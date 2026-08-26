/* ============================================================================
 * SubscriptionAdapter — transport-agnostic subscription seam.
 *
 * The playback engine (app.js) talks ONLY to the object returned by
 * createSubscriptionAdapter(). Today an HTTP adapter pulls Zuke's versioned
 * `/api/display-ads/export` on an interval (Option A). Later, a RabbitMQ
 * adapter implementing the SAME interface (subscribe / getCurrent / start) can
 * be swapped in for scaling — nothing in app.js changes.
 *
 * Contract consumed (from Zuke, transport-independent):
 *   { revision, published_at, media:[...], youtube_playlist_id,
 *     ad_duration_seconds, youtube_duration_minutes }
 * `revision` is the idempotency key: consumers ignore a payload whose revision
 * is not greater than the last one applied (safe with at-least-once brokers).
 * ========================================================================== */
(function (global) {
  "use strict";

  function revisionOf(payload) {
    return payload && typeof payload.revision === "number" ? payload.revision : 0;
  }
  function buildEtag(revision) {
    return '"rev-' + revision + '"';
  }

  /* ── HTTP pull adapter (today) ───────────────────────────────────────────
   * Polls Zuke's /export every `intervalMs` with an If-None-Match header keyed
   * on revision. A 304 means "nothing changed" (no re-render). On a 200 with a
   * newer revision it fires listeners with the new content.                 */
  function createHttpPollingAdapter(options) {
    const opts = Object.assign({ intervalMs: 30000 }, options || {});
    if (!opts.url) throw new Error("HttpPollingAdapter requires a url");

    let current = null;
    let lastRevision = null;
    let timerId = null;
    const listeners = [];

    function emit(payload) {
      current = payload;
      lastRevision = revisionOf(payload);
      listeners.slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error("[SubscriptionAdapter] listener error", e); }
      });
    }

    async function poll() {
      let response;
      try {
        const headers = { Accept: "application/json" };
        if (lastRevision !== null) headers["If-None-Match"] = buildEtag(lastRevision);
        response = await fetch(opts.url, { cache: "no-store", headers });
        if (response.status === 304) return current;            // unchanged
        if (!response.ok) throw new Error("HTTP " + response.status);
        const payload = await response.json();
        const rev = revisionOf(payload);
        if (rev > lastRevision) emit(payload);                          // rev > 0 → fire
      } catch (err) {
        console.warn("[SubscriptionAdapter] poll failed:", err && err.message);
      }
      return current;
    }

    function subscribe(listener) {
      listeners.push(listener);
      return () => { const i = listeners.indexOf(listener); if (i !== -1) listeners.splice(i, 1); };
    }

    // start() returns a promise of the first poll (resolves current content).
    function start() {
      const first = poll();
      if (opts.intervalMs > 0) timerId = setInterval(poll, opts.intervalMs);
      return first;
    }

    function stop() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function getCurrent() { return current; }

    return { subscribe, start, stop, getCurrent, toString: () => "HttpPollingAdapter" };
  }

  /* ── RabbitMQ adapter (placeholder — same interface) ────────────────────
   * Future: connect to the `zuke.advertising` topic exchange, bind a queue to
   * a routing key (e.g. "display.all.ads" or "display.<businessId>.ads"),
   * consume message.content, verify revision > lastSeen (dedupe), then emit().
   * Uncomment + wire below when RabbitMQ is provisioned.                   */
  function createRabbitMqAdapter() {
    throw new Error(
      "RabbitMqAdapter not implemented — add an amqplib consumer that fills " +
      "subscribe()/start()/getCurrent() and emit() the same way the HTTP adapter does."
    );
  }

  /* Swap the adapter here when scaling. Overridable via global config so the
   * same deployment can flip transports without an app.js change.          */
  function createSubscriptionAdapter(opts) {
    const kind = (opts && opts.adapter) || global.SMART_RETAIL_ADAPTER || "http";
    if (kind === "rabbitmq") return createRabbitMqAdapter(opts);
    return createHttpPollingAdapter(opts);
  }

  global.createSubscriptionAdapter = createSubscriptionAdapter;
})(window);