(() => {
  const MAX_AD_CYCLE_MS = 5 * 60_000;
  const DEFAULTS = { adDurationMs: 30_000, youtubeDurationMs: 10 * 60_000, playlistId: "" };
  const elements = {
    mediaStage: document.querySelector("#media-stage"), youtubeStage: document.querySelector("#youtube-stage"), image: document.querySelector("#image-media"), video: document.querySelector("#video-media"), empty: document.querySelector("#empty-state"), caption: document.querySelector("#caption"), business: document.querySelector("#caption-business"), name: document.querySelector("#caption-name"), payment: document.querySelector("#payment-overlay"), qrCode: document.querySelector("#qr-code"), player: document.querySelector("#youtube-player"), progress: document.querySelector("#progress-bar")
  };
  let timeoutId, playlist = [], index = 0, config = { ...DEFAULTS };
  // Published content store. Zuke content (via the subscription adapter) takes
  // precedence; the bundled /api/media|media.json remains the fallback.
  let store = { content: null, hasZuke: false };
  const validUrl = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol); } catch { return false; } };
  const usable = (ad) => ad && ad.status === "active" && ad.payment_status === "paid" && ["image", "video"].includes(ad.media_type) && ["id", "business_id", "business_name", "name"].every((key) => typeof ad[key] === "string" && ad[key].trim()) && validUrl(ad.media_url) && validUrl(ad.paystack_url) && Number.isInteger(ad.play_count) && ad.play_count > 0;
  const positive = (value, fallback, maximum) => Number.isFinite(value) && value > 0 && value <= maximum ? value : fallback;
  function parse(payload) {
    const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    config = { adDurationMs: positive(data.ad_duration_seconds, 30, 300) * 1000, youtubeDurationMs: positive(data.youtube_duration_minutes, 10, 120) * 60_000, playlistId: typeof data.youtube_playlist_id === "string" ? data.youtube_playlist_id.trim() : "" };
    const maxSlots = Math.max(1, Math.floor(MAX_AD_CYCLE_MS / config.adDurationMs));
    playlist = (Array.isArray(data.media) ? data.media : []).filter(usable).flatMap((ad) => Array.from({ length: Math.min(ad.play_count, maxSlots) }, () => ad)).slice(0, maxSlots);
  }
  async function loadMedia() {
    // Zuke published content (from the adapter) wins when available.
    if (store.hasZuke && store.content) { parse(store.content); return; }
    try { let response = await fetch("/api/media", { cache: "no-store" }); if (!response.ok) response = await fetch("media.json", { cache: "no-store" }); if (!response.ok) throw new Error(`Media request failed (${response.status})`); parse(await response.json()); }
    catch (error) { console.error("Unable to load media", error); parse({ media: [] }); }
  }
  // Called by the subscription adapter whenever a NEWER revision arrives.
  function onZukeContent(content) {
    if (!content) return;
    store.hasZuke = true;
    store.content = content;
    parse(content);
    // Surface the new publication promptly, then let the normal cycle run.
    clearTimeout(timeoutId);
    startCycle();
  }
  function hideMedia() { elements.image.classList.add("hidden"); elements.video.classList.add("hidden"); elements.video.pause(); }
  function schedule(next, duration) { clearTimeout(timeoutId); elements.progress.style.transition = "none"; elements.progress.style.width = "0"; requestAnimationFrame(() => { elements.progress.style.transition = `width ${duration}ms linear`; elements.progress.style.width = "100%"; }); timeoutId = setTimeout(next, duration); }
  function renderQr(url) { elements.qrCode.replaceChildren(); if (window.QRCode) new window.QRCode(elements.qrCode, { text: url, width: 140, height: 140, correctLevel: window.QRCode.CorrectLevel.M }); else console.error("QR code library failed to load"); }
  function showEmpty() { elements.youtubeStage.classList.add("hidden"); elements.mediaStage.classList.remove("hidden"); hideMedia(); elements.caption.classList.add("hidden"); elements.payment.classList.add("hidden"); elements.empty.classList.remove("hidden"); schedule(startCycle, config.adDurationMs); }
  function showAd() {
    if (!playlist.length) return showEmpty();
    const ad = playlist[index]; elements.youtubeStage.classList.add("hidden"); elements.mediaStage.classList.remove("hidden"); elements.empty.classList.add("hidden"); elements.caption.classList.remove("hidden"); elements.payment.classList.remove("hidden"); elements.business.textContent = ad.business_name; elements.name.textContent = ad.name; renderQr(ad.paystack_url); hideMedia();
    const target = ad.media_type === "video" ? elements.video : elements.image; target.classList.remove("hidden"); target.src = ad.media_url; if (ad.media_type === "video") { target.load(); target.play().catch(() => console.warn("Video autoplay was blocked")); }
    const proceed = () => { index += 1; index < playlist.length ? showAd() : showEntertainment(); }; target.onerror = () => { console.warn("Skipping broken media", ad.media_url); proceed(); }; schedule(proceed, config.adDurationMs);
  }
  function showEntertainment() { hideMedia(); elements.payment.classList.add("hidden"); elements.mediaStage.classList.add("hidden"); elements.youtubeStage.classList.remove("hidden"); elements.player.src = config.playlistId ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(config.playlistId)}&autoplay=1&mute=1&rel=0` : ""; schedule(startCycle, config.youtubeDurationMs); }
  async function startCycle() { clearTimeout(timeoutId); elements.player.src = ""; index = 0; await loadMedia(); showAd(); }

  // ── Subscribe to Zuke publications (transport-agnostic seam). ────────────
  const queryParams = new URLSearchParams(window.location.search);
  const ZUKE_EXPORT_URL = queryParams.get("zuke") || window.ZUKE_EXPORT_URL || "https://app.zuke.co.za/api/display-ads/export";
  const POLL_INTERVAL_MS = 30_000;
  const adapter = window.createSubscriptionAdapter({ url: ZUKE_EXPORT_URL, intervalMs: POLL_INTERVAL_MS });
  adapter.subscribe(onZukeContent);

  // Wait briefly for the first Zuke poll so the initial frame is usually real
  // published content; falls back to /api/media|media.json within ~4s.
  const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
  Promise.race([adapter.start(), timeout]).then(() => startCycle()).catch(() => startCycle());
})();
