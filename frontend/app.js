(() => {
  "use strict";
  const MAX_AD_CYCLE_MS = 5 * 60_000;
  const DEFAULT_SCHEDULE = {
    morning: { start: "09:00", end: "11:30" },
    afternoon: { start: "11:30", end: "18:00" },
    evening: { start: "18:00", end: "21:00" }
  };
  const DEFAULTS = {
    adDurationMs: 30_000,
    youtubeDurationMs: 10 * 60_000,
    playlistId: "",
    fallbackPlaylists: [],
    shuffle: false,
    youtubeMode: "both",
    apiKey: "",
    schedule: DEFAULT_SCHEDULE
  };
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
    brandBar: document.querySelector("#brandBar"),
    masterMute: document.querySelector("#master-mute"),
    muteIconOn: document.querySelector("#mute-icon-on"),
    muteIconOff: document.querySelector("#mute-icon-off")
  };

  let timeoutId, playlist = [], rawMediaList = [], index = 0, lastPlayedAdId = null, config = { ...DEFAULTS };
  let store = { content: null, hasZuke: false };
  let ytPlayer = null, ytReady = false, masterMuted = localStorage.getItem("masterMuted") === "true";
  const ytVideoQueues = {};

  function updateMuteUI() {
    if (masterMuted) {
      elements.muteIconOn.classList.remove("hidden");
      elements.muteIconOff.classList.add("hidden");
    } else {
      elements.muteIconOn.classList.add("hidden");
      elements.muteIconOff.classList.remove("hidden");
    }
  }
  updateMuteUI();

  elements.masterMute.addEventListener("click", () => {
    masterMuted = !masterMuted;
    localStorage.setItem("masterMuted", masterMuted);
    updateMuteUI();
    // Immediate apply
    if (ytPlayer && typeof ytPlayer.mute === "function") {
      if (masterMuted) ytPlayer.mute();
      else if (!elements.youtubeStage.classList.contains("mini") || (playlist[index] && playlist[index].media_type === "image")) {
        ytPlayer.unMute();
      }
    }
    if (elements.video) {
      if (masterMuted) elements.video.muted = true;
      else if (!elements.video.classList.contains("hidden")) elements.video.muted = false;
    }
  });

  const ALLOWED_ORIENTATIONS = ["landscape", "portrait", "square"];
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const validUrl = (value) => { try { new URL(value); return true; } catch (e) { return false; } };
  const usable = (ad) => ad && ad.status === "active" && ad.payment_status === "paid" && ["image", "video"].includes(ad.media_type) && ["id", "business_id", "business_name", "name"].every((k) => typeof ad[k] === "string" && ad[k].trim()) && validUrl(ad.media_url) && validUrl(ad.paystack_url) && Number.isInteger(ad.play_count) && ad.play_count > 0 && (ad.orientation == null || ALLOWED_ORIENTATIONS.includes(ad.orientation));
  const positive = (value, fallback, maximum) => Number.isFinite(value) && value > 0 && value <= maximum ? value : fallback;

  function validateSchedule(rawSchedule) {
    if (!rawSchedule || typeof rawSchedule !== "object" || Array.isArray(rawSchedule)) return DEFAULT_SCHEDULE;
    const result = {};
    for (const [key, val] of Object.entries(rawSchedule)) {
      if (typeof key === "string" && key.trim() && val && typeof val === "object" && typeof val.start === "string" && typeof val.end === "string") {
        result[key.trim()] = { start: val.start.trim(), end: val.end.trim() };
      }
    }
    return Object.keys(result).length ? result : DEFAULT_SCHEDULE;
  }

  function getCurrentTimeSlot(schedule) {
    if (!schedule || typeof schedule !== "object") return null;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    for (const [slotName, range] of Object.entries(schedule)) {
      if (!range || typeof range.start !== "string" || typeof range.end !== "string") continue;
      const [sH, sM] = range.start.split(":").map(Number);
      const [eH, eM] = range.end.split(":").map(Number);
      if (Number.isNaN(sH) || Number.isNaN(sM) || Number.isNaN(eH) || Number.isNaN(eM)) continue;

      const startTotal = sH * 60 + sM;
      const endTotal = eH * 60 + eM;

      if (startTotal <= endTotal) {
        if (currentMins >= startTotal && currentMins < endTotal) {
          return slotName.toLowerCase();
        }
      } else {
        // Overnight wrap-around slot (e.g. 22:00 to 04:00)
        if (currentMins >= startTotal || currentMins < endTotal) {
          return slotName.toLowerCase();
        }
      }
    }
    return null;
  }

  function getEligibleMedia(mediaList, schedule) {
    const usableAds = (Array.isArray(mediaList) ? mediaList : []).filter(usable);
    if (!usableAds.length) return [];

    const currentSlot = getCurrentTimeSlot(schedule);
    if (!currentSlot) return usableAds;

    const slotMatched = usableAds.filter((ad) => {
      if (!ad.time || typeof ad.time !== "string" || !ad.time.trim()) return true;
      const t = ad.time.trim().toLowerCase();
      return t === "all" || t === currentSlot;
    });

    return slotMatched.length ? slotMatched : usableAds;
  }

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function buildCyclePlaylist(mediaList, cfg, maxAdCycleMs) {
    const eligible = getEligibleMedia(mediaList, cfg.schedule);
    if (!eligible.length) return [];

    const maxSlots = Math.max(1, Math.floor(maxAdCycleMs / cfg.adDurationMs));
    let pool = eligible.flatMap((ad) =>
      Array.from({ length: Math.min(ad.play_count || 1, maxSlots) }, () => ad)
    );

    pool = shuffleArray(pool);

    const uniqueAdIds = new Set(pool.map((a) => a.id));
    if (uniqueAdIds.size > 1 && lastPlayedAdId && pool[0] && pool[0].id === lastPlayedAdId) {
      const swapIdx = pool.findIndex((a) => a.id !== lastPlayedAdId);
      if (swapIdx > 0) {
        const temp = pool[0];
        pool[0] = pool[swapIdx];
        pool[swapIdx] = temp;
      }
    }

    return pool.slice(0, maxSlots);
  }

  function parse(payload) {
    const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    const validModes = ["api", "normal", "both"];
    const modeFromPayload = typeof data.youtube_mode === "string" ? data.youtube_mode.toLowerCase() : "";
    const resolvedMode = validModes.includes(modeFromPayload) ? modeFromPayload : (window.YOUTUBE_MODE || "both");
    const apiKeyFromPayload = typeof data.youtube_api_key === "string" ? data.youtube_api_key.trim() : "";
    if (apiKeyFromPayload) window.YOUTUBE_API_KEY = apiKeyFromPayload;

    config = {
      adDurationMs: positive(data.ad_duration_seconds, 30, 300) * 1000,
      youtubeDurationMs: positive(data.youtube_duration_minutes, 10, 120) * 60_000,
      playlistId: typeof data.youtube_playlist_id === "string" ? data.youtube_playlist_id.trim() : "",
      fallbackPlaylists: Array.isArray(data.youtube_fallback_playlist_ids) ? data.youtube_fallback_playlist_ids.filter(Boolean) : [],
      shuffle: !!data.youtube_shuffle,
      youtubeMode: resolvedMode,
      apiKey: apiKeyFromPayload || window.YOUTUBE_API_KEY || "",
      schedule: validateSchedule(data.schedule)
    };
    rawMediaList = Array.isArray(data.media) ? data.media : [];
    playlist = buildCyclePlaylist(rawMediaList, config, MAX_AD_CYCLE_MS);
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

  function hideMedia() {
    elements.image.classList.remove("image-zoom");
    elements.image.classList.add("hidden");
    elements.video.classList.add("hidden");
    elements.video.pause();
    elements.video.muted = true;
  }
  function schedule(next, duration) {
    clearTimeout(timeoutId);
    elements.progress.style.transition = "none";
    elements.progress.style.width = "0";
    requestAnimationFrame(() => {
      elements.progress.style.transition = "width " + duration + "ms linear";
      elements.progress.style.width = "100%";
    });
    timeoutId = setTimeout(next, duration);
  }
  function renderQr(url) {
    elements.qrCode.replaceChildren();
    if (window.QRCode) new window.QRCode(elements.qrCode, { text: url, width: 140, height: 140, correctLevel: window.QRCode.CorrectLevel.M });
  }

  function showEmpty() {
    renderBrand(null);
    // When empty, we show YouTube full screen as entertainment
    startEntertainment();
  }

  function showAd() {
    if (!playlist.length) return showEmpty();
    const ad = playlist[index];
    lastPlayedAdId = ad.id;
    renderBrand(ad);

    // Keep YouTube stage visible but in mini mode
    elements.youtubeStage.classList.remove("hidden");
    elements.youtubeStage.classList.add("mini");

    elements.mediaStage.classList.remove("hidden");
    elements.mediaStage.dataset.orientation = ad.orientation || "unspecified";
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
      // If it's a video ad, we unmute it (if not master muted) and mute YouTube
      elements.video.muted = masterMuted;
      elements.video.play().catch(() => {
        console.warn("Video autoplay was blocked, muting to retry");
        elements.video.muted = true;
        elements.video.play();
      });
    } else {
      elements.video.removeAttribute("src");
      elements.image.classList.remove("hidden");
      elements.image.classList.add("image-zoom");
      elements.image.style.animationDuration = config.adDurationMs + "ms";
      if (ad.orientation === "portrait" || ad.orientation === "square") {
        elements.image.classList.add("contain");
        elements.image.onload = null;
      } else if (ad.orientation === "landscape") {
        elements.image.classList.remove("contain");
        elements.image.onload = null;
      } else {
        elements.image.onload = function onImgLoad() {
          const ratio = (elements.image.naturalWidth && elements.image.naturalHeight) ? elements.image.naturalWidth / elements.image.naturalHeight : 1;
          elements.image.classList.toggle("contain", ratio < 1.6);
          elements.image.onload = null;
        };
      }
      elements.image.src = ad.media_url;
    }

    // Handle YouTube playback and muting
    ensureYTPlaying().then(() => {
      if (ytPlayer && typeof ytPlayer.mute === "function") {
        if (masterMuted || ad.media_type === "video") ytPlayer.mute();
        else ytPlayer.unMute();
      }
    });

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
        if (ytPlayer && typeof ytPlayer.destroy === "function") {
          try { ytPlayer.destroy(); } catch (e) {}
        }
        elements.player.innerHTML = "";
        
        // Use the safest possible origin: no trailing slashes, exact protocol
        const origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ":" + window.location.port : "");
        
        ytPlayer = new window.YT.Player(elements.player, {
          width: "100%", height: "100%",
          playerVars: { 
            autoplay: 1, 
            mute: 1, 
            playsinline: 1, 
            rel: 0, 
            modestbranding: 1,
            enablejsapi: 1,
            origin: origin
          },
          events: { 
            onReady: () => { 
              ytReady = true; 
              resolve(ytPlayer); 
            }, 
            onError: (e) => { 
              const errorMap = {
                2: "Invalid video parameter or bad ID format.",
                5: "HTML5 player error.",
                100: "Video not found, removed, or marked private.",
                101: "Video owner does not allow embedded playback.",
                150: "Video owner does not allow embedded playback."
              };
              const msg = errorMap[e.data] || "Unknown player error code: " + e.data;
              console.error("[YouTube Player Error " + e.data + "]:", msg);
              ytReady = true; 
              resolve(ytPlayer); 
            } 
          }
        });
      };

      if (window.YT && window.YT.Player) { create(); return; }
      
      // If API not loaded, set up callback and load script
      window.onYouTubeIframeAPIReady = () => {
        create();
      };
      
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    });
  }

  // Fetch video IDs for a playlist via the YouTube Data API.
  function fetchPlaylistItems(pid) {
    const apiKey = config.apiKey || window.YOUTUBE_API_KEY;
    if (!apiKey) {
      const err = new Error("YOUTUBE_API_KEY is missing. Please set YOUTUBE_API_KEY in your .env file or configuration.");
      console.error("[YouTube API Mode]", err.message);
      return Promise.reject(err);
    }
    const url = "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=" + encodeURIComponent(pid) + "&key=" + encodeURIComponent(apiKey);
    return fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          let errorDetails = "";
          try {
            const errJson = await r.json();
            errorDetails = errJson.error ? (errJson.error.message || JSON.stringify(errJson.error)) : JSON.stringify(errJson);
          } catch (e) {
            errorDetails = "HTTP " + r.status + " " + r.statusText;
          }
          const err = new Error("YouTube API request failed (" + errorDetails + ")");
          console.error("[YouTube API Mode]", err.message);
          throw err;
        }
        return r.json();
      })
      .then((j) => {
        const items = (j && j.items || []).map((it) => it && it.contentDetails && it.contentDetails.videoId).filter(Boolean);
        if (!items.length) {
          const err = new Error("No videos returned from YouTube Data API for playlist ID: " + pid);
          console.error("[YouTube API Mode]", err.message);
          throw err;
        }
        return items;
      });
  }

  function playPlaylist(listId) {
    if (!ytPlayer || typeof ytPlayer.loadPlaylist !== "function") return;
    
    // Check if the listId is a video ID or a playlist ID
    if (listId.length === 11) {
      ytPlayer.loadVideoById(listId);
    } else {
      ytPlayer.loadPlaylist({ list: listId, listType: "playlist", index: 0 });
    }
    ytPlayer.playVideo();
  }

  // Play using YouTube Data API
  function playWithApi(listId) {
    if (listId.length === 11) {
      if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
        ytPlayer.loadVideoById(listId);
        ytPlayer.playVideo();
        return Promise.resolve();
      }
      return Promise.reject(new Error("YouTube player not ready"));
    }
    return fetchPlaylistItems(listId).then((items) => {
      if (!ytVideoQueues[listId] || !ytVideoQueues[listId].length) {
        ytVideoQueues[listId] = shuffleArray(items);
      }
      const chosen = ytVideoQueues[listId].pop();
      if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
        ytPlayer.loadVideoById(chosen);
        ytPlayer.playVideo();
      }
    });
  }

  // Unified YouTube playback router honoring youtubeMode ("api", "normal", "both")
  function playYouTubeMedia() {
    const ids = playlistIds();
    if (!ids.length) {
      console.warn("[YouTube] No playlist ID configured in media configuration.");
      return;
    }
    const chosenListId = ids[Math.floor(Math.random() * ids.length)];

    if (config.youtubeMode === "normal") {
      playPlaylist(chosenListId);
    } else if (config.youtubeMode === "api") {
      // STRICT API MODE: No fallback to normal embed on error.
      playWithApi(chosenListId).catch((err) => {
        console.error("[YouTube API Mode Error] Strict API mode active — will NOT fallback to normal embed. Error:", err.message);
      });
    } else {
      // "both" mode: Try API mode first if apiKey is present; fallback to normal embed on error
      const apiKey = config.apiKey || window.YOUTUBE_API_KEY;
      if (apiKey) {
        playWithApi(chosenListId).catch((err) => {
          console.warn("[YouTube Both Mode] API mode encountered an error, falling back to normal embed:", err.message);
          playPlaylist(chosenListId);
        });
      } else {
        playPlaylist(chosenListId);
      }
    }
  }

  function ensureYTPlaying() {
    return ensureYTPlayer().then(() => {
      if (!ytPlayer || typeof ytPlayer.getPlayerState !== "function") return;
      const state = ytPlayer.getPlayerState();
      // If NOT playing (1) and NOT buffering (3), start playing.
      if (state !== 1 && state !== 3) {
        playYouTubeMedia();
      }
    }).catch(() => {});
  }

  function hideYouTube() {
    // We don't really hide it anymore, but we can stop it if needed.
    // However, the requirement is to "keep playing".
  }

  function startEntertainment() {
    hideMedia();
    elements.mediaStage.classList.add("hidden");
    elements.payment.classList.add("hidden");

    // Transition YouTube to full screen
    elements.youtubeStage.classList.remove("hidden");
    elements.youtubeStage.classList.remove("mini");
    renderBrand(null);

    ensureYTPlayer().then(() => {
      if (masterMuted) ytPlayer.mute();
      else if (ytPlayer.unMute) ytPlayer.unMute();
      
      try {
        const state = ytPlayer.getPlayerState();
        if (state !== 1 && state !== 3) {
          playYouTubeMedia();
        }
      } catch (e) {
        // If player isn't ready for getPlayerState, just force play
        playYouTubeMedia();
      }
      return undefined;
    }).catch(() => {});

    schedule(startCycle, config.youtubeDurationMs);
  }

  async function startCycle() {
    clearTimeout(timeoutId);
    index = 0;
    // Don't hide YouTube here, just load media and show ads
    await loadMedia();
    playlist = buildCyclePlaylist(rawMediaList, config, MAX_AD_CYCLE_MS);
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