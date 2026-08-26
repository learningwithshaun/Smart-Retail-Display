(() => {
  "use strict";
  const MAX_AD_CYCLE_MS = 5 * 60_000;
  const DEFAULTS = { adDurationMs: 30_000, youtubeDurationMs: 10 * 60_000, playlistId: "", fallbackPlaylists: [], shuffle: false };
  const ZUKE_LOGO = "https://res.cloudinary.com/dekgwsl3c/image/upload/v1765557660/Wide_Logos_v2_Zuke_Logo_Wide_White_shv9wx.webp";

  const elements = {
    mediaStage: document.querySelector("#media-stage"),
    youtubeStage: document.querySelector("#youtube-stage"),
    image: document.querySelector("#image-media"),
    video: document.querySelector("#video-media"),
    empty: document.querySelector("#empty-state"),
    caption: document.querySelector("#caption"),
    business: document.querySelector("#caption-business"),
    name: document.querySelector("#caption-name"),
    payment: document.querySelector("#payment-overlay"),
    qrCode: document.querySelector("#qr-code"),
    player: document.querySelector("#youtube-player"),
    progress: document.querySelector("#progress-bar"),
    brandBar: document.querySelector("#brandBar")
  };

  let timeoutId, playlist = [], index = 0, config = { ...DEFAULTS };
  let store = { content: null, hasZuke: false };
  let ytPlayer = null, ytReady = false;

  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const validUrl = (value) => { try { new URL(value); return true; } catch (e) { return false; } };
  const usable = (ad) => ad && ad.status === "active" && ad.payment_status === "paid" && ["image", "video"].includes(ad.media_type) && ["id", "business_id", "business_name", "name"].every((k) => typeof ad[k] === "string" && ad[k].trim()) && validUrl(ad.media_url) && validUrl(ad.paystack_url) && Number.isInteger(ad.play_count) && ad.play_count > 0;
  const positive = (value, fallback, maximum) => Number.isFinite(value) && value > 0 && value <= maximum ? value : fallback;

  function parse(payload) {
    const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    config = {
      adDurationMs: positive(data.ad_duration_seconds, 30, 300) * 1000,
      youtubeDurationMs: positive(data.youtube_duration_minutes, 10, 120) * 60_000,
      playlistId: typeof data.youtube_playlist_id === "string" ? data.youtube_playlist_id.trim() : "",
      fallbackPlaylists: Array.isArray(data.youtube_fallback_playlist_ids) ? data.youtube_fallback_playlist_ids.filter(Boolean) : [],
      shuffle: !!data.youtube_shuffle
    };
    const maxSlots = Math.max(1, Math.floor(MAX_AD_CYCLE_MS / config.adDurationMs));
    playlist = (Array.isArray(data.media) ? data.media : []).filter(usable)
      .flatMap((ad) => Array.from({ length: Math.min(ad.play_count, maxSlots) }, () => ad)).slice(0, maxSlots);
  }


  // ── Brand bar: Zuke logo × active ad's business logo (or name) ─────────
  function renderBrand(ad) {
    const bizName = (ad && ad.business_name) || "";
    const bizLogo = (ad && ad.business_logo) || "";
    let html = '<img class="brand-zuke" src="' + ZUKE_LOGO + '" alt="Zuke" />';
    if (bizLogo) html += '<span class="brand-sep">×</span><img class="brand-biz" src="' + esc(bizLogo) + '" alt="' + esc(bizName) + '" />';
    else if (bizName) html += '<span class="brand-sep">×</span><span class="brand-name">' + esc(bizName) + '</span>';
    elements.brandBar.innerHTML = html;
  }

  async function loadMedia() {
    if (store.hasZuke && store.content) { parse(store.content); return; }
    try {
      let resp = await fetch("/api/media", { cache: "no-store" });
      if (!resp.ok) resp = await fetch("media.json", { cache: "no-store" });
      if (!resp.ok) throw new Error("Media request failed (" + resp.status + ")");
      parse(await resp.json());
    } catch (e) { console.error("Unable to load media", e); parse({ media: [] }); }
  }

  // Called by the subscription adapter whenever a NEWER revision arrives.
  function onZukeContent(content) {
    if (!content) return;
    store.hasZuke = true;
    store.content = content;
    parse(content);
    clearTimeout(timeoutId);
    startCycle();
  }

  function hideMedia() { elements.image.classList.add("hidden"); elements.video.classList.add("hidden"); elements.video.pause(); }
  function schedule(next, duration) {
    clearTimeout(timeoutId);
    elements.progress.style.transition = "none";
    elements.progress.style.width = "0";
    requestAnimationFrame(() => { elements.progress.style.transition = "width " + duration + "ms linear"; elements.progress.style.width = "100%"; });
    timeoutId = setTimeout(next, duration);
  }
  function renderQr(url) {
    elements.qrCode.replaceChildren();
    if (window.QRCode) new window.QRCode(elements.qrCode, { text: url, width: 140, height: 140, correctLevel: window.QRCode.CorrectLevel.M });
  }

  function showEmpty() {
    renderBrand(null);
    elements.youtubeStage.classList.add("hidden");
    elements.mediaStage.classList.remove("hidden");
    hideMedia();
    elements.caption.classList.add("hidden");
    elements.payment.classList.add("hidden");
    elements.empty.classList.remove("hidden");
    schedule(startCycle, config.adDurationMs);
  }

  function showAd() {
    if (!playlist.length) return showEmpty();
    const ad = playlist[index];
    renderBrand(ad);
    elements.youtubeStage.classList.add("hidden");
    elements.mediaStage.classList.remove("hidden");
    elements.empty.classList.add("hidden");
    elements.caption.classList.remove("hidden");
    elements.payment.classList.remove("hidden");
    elements.business.textContent = ad.business_name;
    elements.name.textContent = ad.name;
    renderQr(ad.paystack_url);
    hideMedia();

    if (ad.media_type === "video") {
      elements.image.removeAttribute("src");
      elements.video.classList.remove("hidden");
      elements.video.src = ad.media_url;
      elements.video.load();
      elements.video.play().catch(() => console.warn("Video autoplay was blocked"));
    } else {
      // Detect image aspect ratio on load: if the image is squarer (or taller)
      // than the 16:9 screen, show it fully with `contain` so it is never
      // stretched or badly cropped; wide/landscape images use `cover`.
      elements.video.removeAttribute("src");
      elements.image.classList.remove("hidden");
      elements.image.onload = function onImgLoad() {
        const ratio = (elements.image.naturalWidth && elements.image.naturalHeight) ? elements.image.naturalWidth / elements.image.naturalHeight : 1;
        elements.image.classList.toggle("contain", ratio < 1.6);
        elements.image.onload = null;
      };
      elements.image.src = ad.media_url;
    }

    const proceed = () => { index += 1; index < playlist.length ? showAd() : startEntertainment(); };
    const target = ad.media_type === "video" ? elements.video : elements.image;
    target.onerror = () => { console.warn("Skipping broken media", ad.media_url); proceed(); };
    schedule(proceed, config.adDurationMs);
  }

// ── YouTube entertainment (fallback / random videos) ─────────────────────
  function playlistIds() {
    const list = [];
    if (config.playlistId) list.push(config.playlistId);
    (config.fallbackPlaylists || []).forEach((p) => {
      const pid = String(p || "").trim();
      if (pid && !list.includes(pid)) list.push(pid);
    });
    return list;
  }

  // Lazily load the YouTube IFrame API and create the player.
  function ensureYTPlayer() {
    return new Promise((resolve) => {
      if (ytReady && ytPlayer) return resolve(ytPlayer);
      const create = () => {
        ytPlayer = new window.YT.Player(elements.player, {
          width: "100%", height: "100%",
          playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0 },
          events: { onReady: () => { ytReady = true; resolve(ytPlayer); }, onError: () => { ytReady = true; resolve(ytPlayer); } }
        });
      };
      if (window.YT && window.YT.Player) { create(); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); create(); };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }

  // Fetch video IDs for a playlist via the YouTube Data API (only if a key is set).
  function fetchPlaylistItems(pid) {
    const apiKey = window.YOUTUBE_API_KEY;
    if (!apiKey) return Promise.resolve([]);
    const url = "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=" + encodeURIComponent(pid) + "&key=" + encodeURIComponent(apiKey);
    return fetch(url).then((r) => r.json()).then((j) => (j && j.items || []).map((it) => it && it.contentDetails && it.contentDetails.videoId).filter(Boolean)).catch(() => []);
  }

  function playPlaylist(listId) {
    ytPlayer.loadPlaylist({ list: listId, listType: "playlist", index: 0 });
    ytPlayer.playVideo();
  }

  // Shuffle: pick a random playlist, fetch its videos (Data API), play a random video.
  function playShuffled(ids) {
    return fetchPlaylistItems(ids[Math.floor(Math.random() * ids.length)]).then((items) => {
      if (!items.length) { playPlaylist(ids[Math.floor(Math.random() * ids.length)]); return; }
      const chosen = items[Math.floor(Math.random() * items.length)];
      ytPlayer.loadVideoById(chosen);
      ytPlayer.playVideo();
    }).catch(() => playPlaylist(ids[Math.floor(Math.random() * ids.length)]));
  }

  function hideYouTube() { if (ytPlayer && ytPlayer.stopVideo) { try { ytPlayer.stopVideo(); } catch (e) {} } }

  function startEntertainment() {
    const ids = playlistIds();
    hideMedia();
    elements.mediaStage.classList.add("hidden");
    elements.payment.classList.add("hidden");
    elements.youtubeStage.classList.remove("hidden");
    renderBrand(null);
    if (!ids.length) { schedule(startCycle, 60_000); return; }
    ensureYTPlayer().then(() => {
      if (config.shuffle && window.YOUTUBE_API_KEY) return playShuffled(ids);
      playPlaylist(ids[Math.floor(Math.random() * ids.length)]);
      return undefined;
    }).catch(() => {});
    schedule(startCycle, config.youtubeDurationMs);
  }

  async function startCycle() {
    clearTimeout(timeoutId);
    index = 0;
    if (elements.youtubeStage && !elements.youtubeStage.classList.contains("hidden")) hideYouTube();
    await loadMedia();
    showAd();
  }

  // ── Subscribe to Zuke publications (transport-agnostic seam). ────────────
  const queryParams = new URLSearchParams(window.location.search);
  const ZUKE_EXPORT_URL = queryParams.get("zuke") || window.ZUKE_EXPORT_URL || "https://app.zuke.co.za/api/display-ads/export";
  const POLL_INTERVAL_MS = 30_000;
  const adapter = window.createSubscriptionAdapter({ url: ZUKE_EXPORT_URL, intervalMs: POLL_INTERVAL_MS });
  adapter.subscribe(onZukeContent);

  // Wait briefly for the first Zuke poll so the initial frame is usually real
  // published content; falls back to /api/media|media.json within ~4s.
  const delay = new Promise((r) => setTimeout(r, 4000));
  Promise.race([adapter.start(), delay]).then(() => startCycle()).catch(() => startCycle());
})();