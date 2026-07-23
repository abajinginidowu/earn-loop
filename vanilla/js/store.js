/* =============================================================================
   EarnLoop — State store (replaces the React Context + useReducer)
   -----------------------------------------------------------------------------
   Holds app state in localStorage so points/tasks/ads persist across pages.
   Usage:
     EL.store.get()                      -> current state object
     EL.store.dispatch({ type, ... })    -> mutate state (same actions as React)
     EL.store.subscribe(fn)              -> called after every change
     EL.store.reset()                    -> wipe saved state, reload seed data
   ============================================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "earnloop-state-v1";

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function initialState() {
    var seed = window.EARNLOOP_SEED;
    return {
      currentUser: deepClone(seed.currentUser),
      admin: deepClone(seed.admin),
      notifications: deepClone(seed.notifications),
      tasks: deepClone(seed.tasks),
      taskSubmissions: deepClone(seed.taskSubmissions),
      campaigns: deepClone(seed.campaigns),
      walletTransactions: deepClone(seed.walletTransactions),
      referralList: deepClone(seed.referrals.list),
      adminUsers: deepClone(seed.adminUsers),
      adminSubmissionsQueue: deepClone(seed.adminSubmissionsQueue),
      adminLogs: deepClone(seed.adminLogs),
      rewardRules: deepClone(seed.rewardRules),
      taskCategories: deepClone(seed.taskCategories),
      videoAds: deepClone(seed.videoAdSubmissions),
      platformSettings: deepClone(seed.platformSettings),
    };
  }

  // Backfill fields added to the seed after a user's state was first saved, so
  // existing localStorage state picks them up without a full reset (which would
  // wipe points, avatar, etc.). Currently: task fields like `target`.
  function migrate(s) {
    var seed = window.EARNLOOP_SEED;
    if (Array.isArray(s.tasks) && seed && Array.isArray(seed.tasks)) {
      var byId = {};
      seed.tasks.forEach(function (t) { byId[t.id] = t; });
      s.tasks.forEach(function (t) {
        var seedT = byId[t.id];
        if (seedT) Object.keys(seedT).forEach(function (k) { if (t[k] === undefined) t[k] = seedT[k]; });
      });
    }
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { var s = migrate(JSON.parse(raw)); save(s); return s; }
    } catch (e) { /* ignore */ }
    var fresh = initialState();
    save(fresh);
    return fresh;
  }

  function save(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  var state = load();
  var subscribers = [];

  function notify() {
    subscribers.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }

  function dispatch(action) {
    switch (action.type) {
      case "MARK_NOTIFICATION_READ":
        state.notifications.forEach(function (n) { if (n.id === action.id) n.unread = false; });
        break;
      case "MARK_ALL_NOTIFICATIONS_READ":
        state.notifications.forEach(function (n) { n.unread = false; });
        break;
      case "ADD_NOTIFICATION":
        state.notifications.unshift(action.notification);
        break;
      case "SUBMIT_TASK":
        state.taskSubmissions.unshift(action.submission);
        break;
      case "APPROVE_SUBMISSION":
        state.taskSubmissions.forEach(function (s) {
          if (s.id === action.id) { s.status = "approved"; s.reviewedAt = new Date().toISOString(); }
        });
        break;
      case "REJECT_SUBMISSION":
        state.taskSubmissions.forEach(function (s) {
          if (s.id === action.id) { s.status = "rejected"; s.reason = action.reason; s.reviewedAt = new Date().toISOString(); }
        });
        break;
      case "AWARD_POINTS":
        state.currentUser.points += action.points;
        break;
      case "SPEND_POINTS":
        state.currentUser.points -= action.points;
        break;
      case "SPEND_CASH":
        state.currentUser.cashBalance -= action.cash;
        break;
      case "ADD_CASH":
        state.currentUser.cashBalance += action.cash;
        break;
      case "ADD_CAMPAIGN":
        state.campaigns.unshift(action.campaign);
        break;
      case "ADD_WALLET_TXN":
        state.walletTransactions.unshift(action.txn);
        break;
      case "UPDATE_USER":
        Object.assign(state.currentUser, action.patch);
        break;
      case "SET_SOCIAL_CONNECTED":
        var soc = state.currentUser.socials[action.platform] || {};
        state.currentUser.socials[action.platform] = {
          connected: action.connected,
          handle: action.handle != null ? action.handle : soc.handle,
        };
        break;
      case "ADMIN_SET_USER_STATUS":
        state.adminUsers.forEach(function (u) { if (u.id === action.id) u.status = action.status; });
        break;
      case "ADMIN_DELETE_USER":
        state.adminUsers = state.adminUsers.filter(function (u) { return u.id !== action.id; });
        break;
      case "ADMIN_APPROVE_QUEUE_ITEM":
      case "ADMIN_REJECT_QUEUE_ITEM":
        state.adminSubmissionsQueue = state.adminSubmissionsQueue.filter(function (s) { return s.id !== action.id; });
        break;
      case "ADMIN_ADD_CATEGORY":
        state.taskCategories.push(action.category);
        break;
      case "ADMIN_UPDATE_REWARD_RULE":
        state.rewardRules.forEach(function (r) { if (r.action === action.action) r.points = action.points; });
        break;
      case "ADMIN_UPDATE_PLATFORM_SETTINGS":
        state.platformSettings = action.settings;
        break;
      case "ADMIN_LOG":
        state.adminLogs.unshift({ id: EL.uid("log"), admin: state.admin.fullName, action: action.action, time: new Date().toISOString() });
        break;
      case "SUBMIT_VIDEO_AD":
        state.videoAds.unshift(action.ad);
        break;
      case "RECORD_AD_IMPRESSION":
        state.videoAds = state.videoAds
          .map(function (ad) {
            if (ad.id === action.id) ad.impressionsRemaining -= 1;
            return ad;
          })
          .filter(function (ad) { return ad.impressionsRemaining > 0; });
        break;
      default:
        return;
    }
    save(state);
    notify();
  }

  window.EL = window.EL || {};
  EL.store = {
    get: function () { return state; },
    dispatch: dispatch,
    subscribe: function (fn) { subscribers.push(fn); return function () { subscribers = subscribers.filter(function (f) { return f !== fn; }); }; },
    reset: function () { localStorage.removeItem(STORAGE_KEY); state = load(); notify(); },
  };

  /* --- Formatting helpers (ported from lib/format.ts) ------------------- */
  EL.formatNumber = function (n) {
    if (n == null || isNaN(n)) return "0";
    return new Intl.NumberFormat("en-US").format(n);
  };
  EL.formatCompact = function (n) {
    if (n == null || isNaN(n)) return "0";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  };
  EL.formatCurrency = function (n, currency) {
    if (n == null || isNaN(n)) return "$0.00";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(n);
  };
  EL.formatDate = function (date, opts) {
    var d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat("en-US", opts || { month: "short", day: "numeric", year: "numeric" }).format(d);
  };
  EL.timeAgo = function (date) {
    var d = date instanceof Date ? date : new Date(date);
    var seconds = Math.floor((Date.now() - d.getTime()) / 1000);
    var steps = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (var i = 0; i < steps.length; i++) {
      var val = Math.floor(seconds / steps[i][1]);
      if (val >= 1) return val + " " + steps[i][0] + (val > 1 ? "s" : "") + " ago";
    }
    return "just now";
  };
  EL.clamp = function (n, min, max) { return Math.max(min, Math.min(max, n)); };
  EL.uid = function (prefix) { return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10); };
  EL.initials = function (name) {
    return (name || "").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] ? w[0].toUpperCase() : ""; }).join("");
  };
  EL.escapeHtml = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* --- Platform icons (brand SVGs + lucide fallbacks) ------------------- */
  var STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var BRAND_SVG = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/>|' + STROKE,
    facebook: '<path fill="currentColor" d="M14 8.5h2.5V5H14a4 4 0 0 0-4 4v2H8v3.5h2V21h3.5v-6.5H16l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z"/>|',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7.5 10v6.5M7.5 7.6v.1M11 16.5v-4a2 2 0 0 1 4 0v4M11 12.3V16.5"/>|' + STROKE,
    x: '<path d="M4 4l16 16M20 4L4 20"/>|' + STROKE,
    twitter: '<path d="M4 4l16 16M20 4L4 20"/>|' + STROKE,
    telegram: '<path d="M21 4L3 11l6 2 2 6 3-4 5 3z"/>|' + STROKE,
    whatsapp: '<path d="M12 3a8.5 8.5 0 0 0-7.4 12.7L3 21l5.5-1.5A8.5 8.5 0 1 0 12 3z"/><path fill="currentColor" stroke="none" d="M8.5 9.5c0 3.5 3 6.5 6.5 6.5.5 0 1-.5 1-1v-1l-2-1-1 1a5 5 0 0 1-3-3l1-1-1-2h-1c-.5 0-.5.5-.5 1z"/>|' + STROKE,
    discord: '<path d="M8 5.5S6 6 5 8c-1.5 3-1.5 7-1.5 7S5 17 8 17l.7-1.3M16 5.5S18 6 19 8c1.5 3 1.5 7 1.5 7S18 17 15 17l-.7-1.3"/><ellipse cx="9" cy="12" rx="1.2" ry="1.5" fill="currentColor" stroke="none"/><ellipse cx="15" cy="12" rx="1.2" ry="1.5" fill="currentColor" stroke="none"/>|' + STROKE,
    pinterest: '<circle cx="12" cy="12" r="10"/><path d="M9.5 19c1-3 1.5-5 1.5-5m0 0c-.7-1-1-2.3-.3-3.8.7-1.4 2.6-1.6 3.5-.5 1 1.2.4 3.3-.7 4.6-1 1.1-2.6.6-2.5-1.3.1-1.4 1.5-3.5 3.3-3 1.5.4 2 2.3 1.3 3.8"/>|' + STROKE,
    spotify: '<circle cx="12" cy="12" r="10"/><path d="M7 10.5c3-.8 6.5-.5 9 1M7.5 13.5c2.5-.6 5.3-.4 7.5.9M8 16.3c2-.4 4.2-.3 6 .7"/>|' + STROKE,
    tiktok: '<path fill="currentColor" d="M16.6 2h-3.2v13.6a3.1 3.1 0 1 1-2.2-3v-3.3a6.3 6.3 0 1 0 5.4 6.3V8.9a7.8 7.8 0 0 0 4.6 1.5V7.2a4.6 4.6 0 0 1-4.6-4.6z"/>|',
    youtube: '<rect x="2.5" y="6" width="19" height="12" rx="4"/><path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none"/>|' + STROKE,
  };
  var LUCIDE_PLATFORM = { website: "globe", application: "smartphone", "apple-music": "music", "amazon-music": "music", boomplay: "music", audiomack: "music" };

  // Platforms that have a real PNG in /images. Map -> filename (without extension).
  // Anything not listed here falls back to the inline SVG / Lucide icon below.
  var PNG_PLATFORM = {
    instagram: "instagram", facebook: "facebook", linkedin: "linkedin",
    x: "x", twitter: "x", tiktok: "tiktok", youtube: "youtube", pinterest: "pinterest",
    apple: "appstore", playstore: "playstore",
    reddit: "reddit", discord: "discord", telegram: "telegram",
    website: "website", audiomack: "audiomack", whatsapp: "whatsapp",
  };

  // Returns an HTML string for a platform's icon. `cls` is applied to the element.
  EL.platformIcon = function (platformId, cls) {
    cls = cls || "size-4";
    if (PNG_PLATFORM[platformId]) {
      return '<img class="' + cls + '" src="images/' + PNG_PLATFORM[platformId] + '.png" alt="" loading="lazy" />';
    }
    if (BRAND_SVG[platformId]) {
      var parts = BRAND_SVG[platformId].split("|");
      var attrs = parts[1] || "";
      return '<svg class="' + cls + '" viewBox="0 0 24 24" ' + attrs + '>' + parts[0] + "</svg>";
    }
    var lucideName = LUCIDE_PLATFORM[platformId] || "share-2";
    return '<i data-lucide="' + lucideName + '" class="' + cls + '"></i>';
  };

  /* --- Avatar helpers -------------------------------------------------- */
  // Inner HTML for an `.avatar` element: the uploaded picture (if any) over the
  // initials fallback. Use when building avatar markup as a string.
  EL.avatarInner = function (user) {
    var initials = EL.initials(user.fullName || user.name || "");
    return (user.avatarUrl ? '<img class="avatar__img" alt="" src="' + user.avatarUrl + '" />' : "") +
      '<span class="avatar__fallback">' + initials + "</span>";
  };
  // Insert / update / remove the picture <img> inside an existing `.avatar`,
  // given its `.avatar__fallback` element. Use for markup already in the DOM.
  EL.fillAvatar = function (fallbackEl, url) {
    if (!fallbackEl || !fallbackEl.parentNode) return;
    var wrap = fallbackEl.parentNode;
    var img = wrap.querySelector(".avatar__img");
    if (url) {
      if (!img) { img = document.createElement("img"); img.className = "avatar__img"; img.alt = ""; wrap.insertBefore(img, fallbackEl); }
      img.src = url;
    } else if (img) { img.remove(); }
  };

  /* --- Clipboard ------------------------------------------------------- */
  // Copy text to the clipboard with a legacy fallback; shows a toast.
  EL.copy = function (text, label) {
    function ok() { EL.toast.success((label || "Copied") + " to clipboard"); }
    function fail() { EL.toast.error("Couldn't copy. Copy it manually"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { legacyCopy(text) ? ok() : fail(); });
    } else {
      legacyCopy(text) ? ok() : fail();
    }
  };
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      var done = document.execCommand("copy");
      document.body.removeChild(ta);
      return done;
    } catch (e) { return false; }
  }

  /* --- Toast (replaces sonner) ----------------------------------------- */
  EL.toast = function (message, type) {
    var host = document.getElementById("el-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "el-toast-host";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    var t = document.createElement("div");
    var accent = type === "success" ? " toast--success" : type === "error" ? " toast--error" : "";
    t.className = "toast" + accent;
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    t.style.transition = "opacity .2s ease, transform .2s ease";
    t.textContent = message;
    host.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
    setTimeout(function () {
      t.style.opacity = "0";
      t.style.transform = "translateY(8px)";
      setTimeout(function () { t.remove(); }, 220);
    }, 3200);
  };
  EL.toast.success = function (m) { EL.toast(m, "success"); };
  EL.toast.error = function (m) { EL.toast(m, "error"); };
})();
