/* =============================================================================
   EarnLoop — Cloudflare Turnstile (CAPTCHA) helper
   -----------------------------------------------------------------------------
   Supabase can require a CAPTCHA token on the endpoints that create accounts,
   issue sessions, and send emails. This module renders the Turnstile widgets and
   hands out tokens; js/auth.js passes them to Supabase.

   ---------------------------------------------------------------------------
   CURRENTLY OFF — set ENABLED = true to switch it on
   ---------------------------------------------------------------------------
   With ENABLED false nothing loads from Cloudflare, no widget renders, and every
   auth call sends no token — exactly as before CAPTCHA existed. The wiring stays
   in place so turning it on is a one-line change.

   To enable:
     1. https://dash.cloudflare.com → Turnstile → Add widget
     2. Add your hostnames (e.g. your-site.netlify.app, and localhost for dev)
     3. Put the SITE key in SITE_KEY below and set ENABLED = true
     4. Deploy the frontend
     5. ONLY THEN put the SECRET key into Supabase:
        Authentication → Attack Protection → Enable CAPTCHA, provider Turnstile

   Step 5 must come after step 4: Supabase starts rejecting every login the moment
   it's enabled, and a browser running the old JavaScript sends no token — so
   doing it early locks everyone out, including you. See docs/CAPTCHA.md.
   ============================================================================= */
(function () {
  "use strict";

  // Master switch. false = no Cloudflare script, no widgets, no tokens.
  var ENABLED = false;

  // Cloudflare's always-passes test key. Swap for your real site key.
  var SITE_KEY = "1x00000000000000000000AA";

  var SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

  // name -> { el, id (widget id), token, waiters[] }
  var widgets = {};
  var loading = null;

  function isTestKey() { return /^1x0{20}AA$/.test(SITE_KEY); }

  /* Load the Turnstile script once. Resolves false if it can't be reached (an
     ad blocker, or an offline dev machine) so callers can degrade instead of
     hanging the form forever. */
  function loadScript() {
    if (loading) return loading;
    loading = new Promise(function (resolve) {
      if (window.turnstile) return resolve(true);
      var s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(!!window.turnstile); };
      s.onerror = function () {
        console.warn("[captcha] Turnstile failed to load — continuing without a token.");
        resolve(false);
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  function settle(w, token) {
    w.token = token;
    var list = w.waiters;
    w.waiters = [];
    list.forEach(function (fn) { fn(token); });
  }

  /* Render every [data-captcha="<name>"] container on the page. */
  function renderAll() {
    if (!ENABLED) return Promise.resolve(false);
    var nodes = document.querySelectorAll("[data-captcha]");
    if (!nodes.length) return Promise.resolve(false);

    return loadScript().then(function (ok) {
      if (!ok) return false;
      nodes.forEach(function (el) {
        var name = el.getAttribute("data-captcha");
        if (widgets[name]) return;                     // already rendered
        var w = { el: el, id: null, token: null, waiters: [] };
        widgets[name] = w;
        try {
          w.id = window.turnstile.render(el, {
            sitekey: SITE_KEY,
            theme: "light",
            size: "flexible",
            action: name,
            /* "interaction-only" keeps the widget invisible unless Cloudflare
               actually needs a challenge — used where a permanent box would be
               odd (the resend link on the code-entry step). */
            appearance: el.getAttribute("data-captcha-appearance") || "always",
            callback: function (token) { settle(w, token); },
            "expired-callback": function () { w.token = null; },
            "timeout-callback": function () { w.token = null; },
            "error-callback": function () {
              // Don't strand a submit that's waiting on a token.
              settle(w, null);
              return true;   // let Turnstile retry internally
            },
          });
        } catch (e) {
          console.warn("[captcha] render failed for '" + name + "':", e);
          settle(w, null);
        }
      });
      return true;
    });
  }

  /* A fresh token for `name`. Resolves null (never rejects, never hangs) when
     Turnstile is unavailable, so auth still works if the CDN is blocked — the
     request then fails server-side only if Supabase has CAPTCHA switched on. */
  function token(name, timeoutMs) {
    if (!ENABLED) return Promise.resolve(null);
    var w = widgets[name];
    if (!w) return Promise.resolve(null);
    if (w.token) return Promise.resolve(w.token);

    return new Promise(function (resolve) {
      var done = false;
      function finish(t) { if (!done) { done = true; resolve(t || null); } }
      w.waiters.push(finish);
      setTimeout(function () { finish(null); }, timeoutMs || 8000);
    });
  }

  /* Tokens are single-use: Supabase rejects a replay. Reset after every attempt,
     successful or not, so the next submit gets a new one. */
  function reset(name) {
    var w = widgets[name];
    if (!w || w.id === null || !window.turnstile) return;
    w.token = null;
    try { window.turnstile.reset(w.id); } catch (e) { /* widget already gone */ }
  }

  window.EL_CAPTCHA = {
    enabled: ENABLED,
    siteKey: SITE_KEY,
    usingTestKey: isTestKey(),
    renderAll: renderAll,
    token: token,
    reset: reset,
  };

  if (!ENABLED) {
    console.info("[captcha] CAPTCHA is off (ENABLED = false in js/captcha.js).");
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAll);
  } else {
    renderAll();
  }

  if (isTestKey()) {
    console.info(
      "[captcha] Using Cloudflare's TEST site key — it always passes and blocks nobody. " +
      "Replace SITE_KEY in js/captcha.js before launch (see docs/CAPTCHA.md)."
    );
  }
})();
