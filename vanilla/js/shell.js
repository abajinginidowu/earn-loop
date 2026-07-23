/* =============================================================================
   EarnLoop — App shell (replaces AppShell.tsx). Plain-CSS classes in css/app.css.
   A page opts in with:  <main data-app-main data-active="dashboard"> … </main>
   ============================================================================= */
(function () {
  "use strict";

  var NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: "home", href: "dashboard.html" },
    { id: "tasks", label: "Tasks", icon: "list-checks", href: "tasks.html" },
    { id: "my-tasks", label: "My Tasks", icon: "clipboard-list", href: "my-tasks.html", badge: 2 },
    { id: "create-campaign", label: "Create Campaign", icon: "megaphone", href: "create-campaign.html" },
    { id: "video-ads", label: "Video Ads", icon: "video", href: "video-ads.html" },
    { id: "referral", label: "Referral", icon: "users", href: "referral.html" },
    { id: "wallet", label: "Wallet", icon: "wallet", href: "wallet.html" },
    { id: "settings", label: "Account Settings", icon: "settings", href: "settings.html" },
  ];
  var FOOTER_ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: "home", href: "dashboard.html" },
    { id: "video-ads", label: "Video Ads", icon: "video", href: "video-ads.html" },
    { id: "wallet", label: "Wallet", icon: "wallet", href: "wallet.html" },
    { id: "settings", label: "Settings", icon: "settings", href: "settings.html" },
  ];

  var state = EL.store.get();
  var mainEl = document.querySelector("[data-app-main]");
  var active = mainEl ? mainEl.getAttribute("data-active") || "" : "";

  // Admins get an extra "Admin Panel" link (in the sidebar + profile menu).
  // Defaults from the mock user for local dev; overridden by the real Supabase
  // JWT role (app_metadata.role) once the session is confirmed below.
  var isAdmin = !!(state.currentUser && state.currentUser.role === "admin");

  var COLLAPSE_KEY = "sidebar-collapsed";
  function isCollapsed() { return localStorage.getItem(COLLAPSE_KEY) === "true"; }
  function setCollapsed(v) { localStorage.setItem(COLLAPSE_KEY, v ? "true" : "false"); }

  /* --- Markup builders -------------------------------------------------- */
  function logoHtml() {
    return (
      '<a href="dashboard.html" class="sidebar__logo">' +
      '<span class="sidebar__logo-mark"><i data-lucide="sparkles"></i></span>' +
      '<span class="sidebar__logo-text">EarnLoop</span></a>'
    );
  }

  function navListHtml() {
    return NAV_ITEMS.map(function (item) {
      var badge = item.badge ? '<span class="badge badge--secondary sidebar__badge">' + item.badge + "</span>" : "";
      return (
        '<a href="' + item.href + '" class="sidebar__link' + (item.id === active ? " is-active" : "") + '">' +
        '<i data-lucide="' + item.icon + '"></i>' +
        '<span class="sidebar__label">' + item.label + "</span>" + badge + "</a>"
      );
    }).join("");
  }

  function sidebarBodyHtml() {
    return (
      '<div class="sidebar__logo-wrap">' + logoHtml() + "</div>" +
      '<div class="sidebar__nav"><nav class="sidebar__nav-list">' + navListHtml() + "</nav></div>" +
      '<div class="sidebar__foot">' +
      '<div class="sidebar__sep"></div>' +
      (isAdmin ? '<a href="admin-dashboard.html" class="sidebar__logout sidebar__profile' + (active === "admin" ? " is-active" : "") + '"><i data-lucide="shield"></i><span class="sidebar__logout-text">Admin Panel</span></a>' : "") +
      '<a href="profile.html" class="sidebar__logout sidebar__profile' + (active === "profile" ? " is-active" : "") + '"><i data-lucide="user"></i><span class="sidebar__logout-text">Profile</span></a>' +
      '<a href="landing.html" data-logout class="sidebar__logout"><i data-lucide="log-out"></i><span class="sidebar__logout-text">Logout</span></a>' +
      "</div>"
    );
  }

  function asideHtml() {
    var collapsed = isCollapsed();
    return (
      '<aside id="el-sidebar" class="sidebar' + (collapsed ? " is-collapsed" : "") + '">' +
      '<div class="sidebar__body">' + sidebarBodyHtml() + "</div>" +
      '<div class="sidebar__collapse"><button type="button" id="el-collapse-btn" class="sidebar__collapse-btn">' +
      '<i data-lucide="' + (collapsed ? "chevrons-right" : "chevrons-left") + '"></i>' +
      '<span class="sidebar__collapse-text">Collapse</span></button></div>' +
      "</aside>"
    );
  }

  function headerHtml() {
    var unread = state.notifications.filter(function (n) { return n.unread; }).length;
    return (
      '<header class="app-header">' +
      '<button type="button" id="el-mobile-menu-btn" class="icon-btn app-header__menu-btn" aria-label="Open menu"><i data-lucide="menu"></i></button>' +
      '<a href="dashboard.html" class="app-header__logo sidebar__logo"><span class="sidebar__logo-mark"><i data-lucide="sparkles"></i></span><span class="sidebar__logo-text">EarnLoop</span></a>' +
      '<div class="app-header__spacer"></div>' +
      '<a href="notifications.html" class="icon-btn" aria-label="Notifications"><i data-lucide="bell"></i>' + (unread > 0 ? '<span class="notif-dot"></span>' : "") + "</a>" +
      '<div class="profile">' +
      '<button type="button" id="el-profile-btn" class="profile__btn"><span class="avatar avatar--sm">' + EL.avatarInner(state.currentUser) + "</span></button>" +
      profileMenuHtml() +
      "</div></header>"
    );
  }

  function profileMenuHtml() {
    return '<div id="el-profile-menu" class="profile-menu" hidden>' + profileMenuInner() + "</div>";
  }

  // Split out so it can be refreshed in place once the real profile lands —
  // replacing the whole element would strip the handlers bound in wire().
  function profileMenuInner() {
    var u = state.currentUser;
    return (
      '<div class="profile-menu__head"><span class="avatar">' + EL.avatarInner(u) + "</span>" +
      '<div style="min-width:0"><div class="profile-menu__name">' + EL.escapeHtml(u.fullName) + '</div><div class="profile-menu__handle">@' + EL.escapeHtml(u.username) + "</div></div></div>" +
      '<div class="profile-menu__stats"><span class="lvl">Level <b>' + u.level + '</b></span><span class="pts">' + EL.formatNumber(u.points) + " pts</span></div>" +
      '<div class="profile-menu__sep"></div>' +
      '<div class="profile-menu__label">Account</div>' +
      '<a href="profile.html" class="profile-menu__item"><i data-lucide="user"></i> Profile</a>' +
      '<a href="settings.html" class="profile-menu__item"><i data-lucide="settings"></i> Account Settings</a>' +
      (isAdmin ? '<a href="admin-dashboard.html" class="profile-menu__item"><i data-lucide="shield"></i> Admin Panel</a>' : "") +
      '<div class="profile-menu__sep"></div>' +
      '<a href="landing.html" data-logout class="profile-menu__item profile-menu__item--danger"><i data-lucide="log-out"></i> Logout</a>'
    );
  }

  function footerNavHtml() {
    var items = FOOTER_ITEMS.map(function (item) {
      return (
        '<a href="' + item.href + '" class="app-footer-nav__item' + (item.id === active ? " is-active" : "") + '">' +
        '<i data-lucide="' + item.icon + '"></i>' + item.label + "</a>"
      );
    }).join("");
    return '<nav class="app-footer-nav">' + items + "</nav>";
  }

  function sheetHtml() {
    return (
      '<div id="el-sheet" class="app-sheet" hidden>' +
      '<div id="el-sheet-backdrop" class="app-sheet__backdrop"></div>' +
      '<div class="app-sheet__panel">' + sidebarBodyHtml() + "</div></div>"
    );
  }

  function overlayHtml() { return '<div id="el-ad-overlay" class="ad-overlay"></div>'; }

  /* --- Assemble --------------------------------------------------------- */
  function build() {
    var wrapper = document.createElement("div");
    wrapper.className = "app-shell";
    wrapper.innerHTML = asideHtml() + '<div id="el-col" class="app-col">' + headerHtml() + "</div>";
    if (mainEl) {
      mainEl.parentNode.insertBefore(wrapper, mainEl);
      mainEl.classList.add("app-main");
      wrapper.querySelector("#el-col").appendChild(mainEl);
    } else {
      document.body.appendChild(wrapper);
    }
    wrapper.insertAdjacentHTML("beforeend", footerNavHtml() + sheetHtml());
    document.body.insertAdjacentHTML("beforeend", overlayHtml());
    wire();
    renderIcons();
  }

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  function wire() {
    var collapseBtn = document.getElementById("el-collapse-btn");
    if (collapseBtn) {
      collapseBtn.addEventListener("click", function () {
        var next = !isCollapsed();
        setCollapsed(next);
        document.getElementById("el-sidebar").classList.toggle("is-collapsed", next);
        collapseBtn.innerHTML = '<i data-lucide="' + (next ? "chevrons-right" : "chevrons-left") + '"></i><span class="sidebar__collapse-text">Collapse</span>';
        renderIcons();
      });
    }
    var menuBtn = document.getElementById("el-mobile-menu-btn");
    var sheet = document.getElementById("el-sheet");
    var sheetBackdrop = document.getElementById("el-sheet-backdrop");
    if (menuBtn) menuBtn.addEventListener("click", function () { sheet.removeAttribute("hidden"); });
    if (sheetBackdrop) sheetBackdrop.addEventListener("click", function () { sheet.setAttribute("hidden", ""); });

    var profileBtn = document.getElementById("el-profile-btn");
    var profileMenu = document.getElementById("el-profile-menu");
    if (profileBtn) {
      profileBtn.addEventListener("click", function (e) { e.stopPropagation(); profileMenu.toggleAttribute("hidden"); });
      document.addEventListener("click", function () { profileMenu.setAttribute("hidden", ""); });
    }

    // Logout — sign out of Supabase, then return to the public landing page.
    document.addEventListener("click", function (e) {
      var link = e.target.closest("[data-logout]");
      if (!link) return;
      e.preventDefault();
      var dest = link.getAttribute("href") || "landing.html";
      var done = function () { location.replace(dest); };
      if (window.SB && window.SB.signOut) {
        window.SB.signOut().then(done, done);
      } else {
        done();
      }
    });
  }

  /* --- Video ad overlay -------------------------------------------------
     Every `adFrequencyMinutes` the overlay asks the server for the next ad this
     user should see (next_video_ad), plays it, and reports the finished watch
     (record_ad_view). The server owns the payout — the browser never credits
     points itself. Falls back to the mock ad list when Supabase isn't wired up. */
  var MIN_SKIP = 30, MAX_SKIP = 60;
  var adOpen = false, elapsed = 0, currentAd = null, skipUnlockAt = MIN_SKIP;
  var adIndex = 0, tickTimer = null, adCycleTimer = null, awarding = false;

  // The DB row and the mock seed use different shapes; normalise once.
  function normalizeAd(row) {
    if (!row) return null;
    return {
      id: row.id,
      brand: row.brand || "",
      videoUrl: row.video_url || row.videoUrl || "",
      linkUrl: row.link_url || row.linkUrl || "",
      live: !!row.video_url,   // came from the DB → real payout available
    };
  }

  function overlayHost() { return document.getElementById("el-ad-overlay"); }

  // Build the modal once. Rebuilding it per tick would restart the <video>, so
  // the countdown only touches the bar, the hint, and the skip button.
  function openOverlay() {
    var host = overlayHost();
    var playable = currentAd && /^https?:|^blob:/.test(currentAd.videoUrl);
    host.classList.add("is-open");
    host.innerHTML =
      '<div class="ad-modal">' +
      '<div class="ad-modal__video">' +
      '<span class="badge badge--default ad-modal__badge">Ad</span>' +
      (playable
        ? '<video id="el-ad-video" class="ad-modal__player" src="' + EL.escapeHtml(currentAd.videoUrl) + '" autoplay playsinline controlslist="nodownload"></video>'
        : '<i data-lucide="play-circle"></i>') +
      (currentAd ? '<div class="ad-modal__brand">' + EL.escapeHtml(currentAd.brand) + "</div>" : "") +
      (currentAd && currentAd.linkUrl ? '<a class="btn btn--primary btn--sm ad-modal__cta" href="' + EL.escapeHtml(currentAd.linkUrl) + '" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i> Visit</a>' : "") +
      "</div>" +
      '<div class="ad-modal__track"><div class="ad-modal__bar" id="el-ad-bar" style="width:0%"></div></div>' +
      '<div class="ad-modal__foot">' +
      '<span class="ad-modal__hint" id="el-ad-hint">Skip available in ' + skipUnlockAt + "s</span>" +
      '<button type="button" id="el-skip-ad" class="btn btn--secondary btn--sm" disabled><i data-lucide="x"></i> Skip Ad</button>' +
      "</div></div>";
    renderIcons();
    var skip = document.getElementById("el-skip-ad");
    if (skip) skip.addEventListener("click", finishAd);
    var video = document.getElementById("el-ad-video");
    if (video) {
      video.addEventListener("ended", finishAd);
      // Autoplay with sound is blocked in most browsers; mute so it always plays.
      video.muted = true;
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* user gesture required — the timer still runs */ });
    }
  }

  function tickOverlay() {
    var bar = document.getElementById("el-ad-bar");
    var hint = document.getElementById("el-ad-hint");
    var skip = document.getElementById("el-skip-ad");
    if (!bar) return;
    var video = document.getElementById("el-ad-video");
    var duration = video && video.duration > 0 ? video.duration : skipUnlockAt + 10;
    var canSkip = elapsed >= skipUnlockAt;
    bar.style.width = Math.min(100, Math.round((elapsed / duration) * 100)) + "%";
    if (hint) hint.textContent = canSkip ? "You can skip now" : "Skip available in " + (skipUnlockAt - elapsed) + "s";
    if (skip) skip.disabled = !canSkip;
  }

  function closeOverlay() {
    adOpen = false;
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    var host = overlayHost();
    host.classList.remove("is-open");
    host.innerHTML = "";
  }

  function finishAd() {
    if (!adOpen || awarding) return;
    awarding = true;
    var ad = currentAd;
    closeOverlay();

    // Live ads: the server decides the reward and credits it.
    if (ad && ad.live && window.SB && window.SB.configured && window.SB.recordAdView) {
      window.SB.recordAdView(ad.id).then(function (res) {
        awarding = false;
        var r = res && res.data;
        if (res && res.error) return;
        if (r && r.awarded) {
          EL.store.dispatch({ type: "UPDATE_USER", patch: { points: (EL.store.get().currentUser.points || 0) + r.points } });
          EL.toast.success("+" + r.points + " points. Thanks for watching!");
        }
      }, function () { awarding = false; });
      return;
    }

    // Mock fallback (no Supabase): credit locally so local dev still works.
    awarding = false;
    var reward = state.platformSettings.adReward;
    EL.store.dispatch({ type: "AWARD_POINTS", points: reward });
    EL.store.dispatch({ type: "ADD_WALLET_TXN", txn: { id: EL.uid("txn"), type: "earn", label: "Watched video ad", points: reward, cash: 0, date: new Date().toISOString() } });
    if (ad) EL.store.dispatch({ type: "RECORD_AD_IMPRESSION", id: ad.id });
    EL.toast.success("+" + reward + " points. Thanks for watching!");
  }

  function playAd(ad) {
    currentAd = ad;
    skipUnlockAt = MIN_SKIP + Math.floor(Math.random() * (MAX_SKIP - MIN_SKIP + 1));
    elapsed = 0; adOpen = true;
    openOverlay();
    tickTimer = setInterval(function () {
      elapsed += 1;
      var video = document.getElementById("el-ad-video");
      // Without a real video there's nothing to end on, so cap the mock playback.
      if (!video && elapsed >= skipUnlockAt + 10) { finishAd(); return; }
      tickOverlay();
    }, 1000);
  }

  // One cycle: fetch the next ad (live if possible, mock otherwise) and play it.
  function adTick() {
    if (adOpen) return;
    if (window.SB && window.SB.configured && window.SB.nextVideoAd) {
      window.SB.nextVideoAd().then(function (res) {
        if (!res || res.error || !res.data) return;      // no inventory → stay quiet
        var row = Array.isArray(res.data) ? res.data[0] : res.data;
        if (row) playAd(normalizeAd(row));
      }, function () { /* offline — skip this cycle */ });
      return;
    }
    var activeAds = state.videoAds.filter(function (a) { return a.status === "active"; });
    if (activeAds.length === 0) return;
    playAd(normalizeAd(activeAds[adIndex++ % activeAds.length]));
  }

  function startAdCycle() {
    if (adCycleTimer) clearInterval(adCycleTimer);
    var minutes = state.platformSettings.adFrequencyMinutes > 0 ? state.platformSettings.adFrequencyMinutes : 5;
    adCycleTimer = setInterval(adTick, minutes * 60 * 1000);
  }

  // Pull the admin's live settings (ad reward/frequency, referral reward) into
  // the store so every page — and the ad cycle below — uses the real values.
  function hydrateSettings() {
    if (!window.SB || !window.SB.getPlatformSettings) return Promise.resolve();
    return window.SB.getPlatformSettings(state.platformSettings).then(function (res) {
      if (!res || res.error || !res.data) return;
      EL.store.dispatch({ type: "ADMIN_UPDATE_PLATFORM_SETTINGS", settings: res.data });
    }).catch(function () { /* keep the seeded defaults */ });
  }

  /* --- Session guard ---------------------------------------------------- */
  // Dynamically load a script and resolve once it has executed.
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  // Make sure window.SB exists (app pages don't include the Supabase scripts
  // themselves — the shell pulls them in on demand so every guarded page gets
  // the same auth helpers without editing each HTML file).
  function ensureSB() {
    if (window.SB) return Promise.resolve(window.SB);
    var chain = window.supabase && window.supabase.createClient
      ? Promise.resolve()
      : loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    return chain
      .then(function () { return loadScript("js/supabase.js"); })
      .then(function () { return window.SB || null; })
      .catch(function () { return null; });
  }

  function render() { build(); startAdCycle(); }

  // Pull the signed-in user's real profile row (RLS: own row) and merge it into
  // the store so the header, profile menu, dashboard card, etc. all show live
  // data instead of the mock "Ada" seed. Maps snake_case DB columns → the app's
  // camelCase currentUser shape. Safe/no-op if the fetch fails.
  function hydrateUser() {
    if (!window.SB || !window.SB.getProfile) return Promise.resolve();
    return window.SB.getProfile().then(function (res) {
      if (!res || res.error || !res.data) return;
      var p = res.data;
      EL.store.dispatch({ type: "UPDATE_USER", patch: {
        id: p.id,
        username: p.username || "",
        fullName: p.full_name || "",
        email: p.email || "",
        avatarUrl: p.avatar_url || "",
        country: p.country || "",
        countryFlag: "",
        joined: p.created_at || "",
        businessCategories: p.business_categories || [],
        role: p.role || "user",
        points: p.points || 0,
        xp: p.xp || 0,
        level: p.level || 1,
        cashBalance: Number(p.cash_balance) || 0,
        streak: p.streak || 0,
      } });
    }).catch(function () { /* keep mock values on failure */ });
  }

  // Pages that change a balance (buying a campaign or a video ad) call this to
  // pull the authoritative numbers back down after the server-side charge.
  EL.refreshUser = hydrateUser;

  /* --- Boot -------------------------------------------------------------
     The chrome used to wait on FOUR network round trips before it existed —
     the Supabase CDN, getSession, the profile, and the settings — which left
     the page with no sidebar or header for seconds on every navigation.

     Now: if this tab holds a session token, draw the shell immediately from the
     store (which already caches the real profile from the previous page), then
     verify in the background. If verification fails the redirect still fires —
     the guard is unchanged, it just no longer blocks the first paint. */

  // Cheap synchronous check for a session token in this tab. Deliberately does
  // not validate it; requireAuth() below does that for real.
  function hasStoredSession() {
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k) && sessionStorage.getItem(k)) return true;
      }
    } catch (e) { /* storage blocked */ }
    return false;
  }

  var rendered = false;
  function renderOnce() {
    if (rendered) return;
    rendered = true;
    render();
  }

  // Re-draw the parts that depend on who the user is, after hydration lands.
  // (Only needed when we painted optimistically before the profile arrived.)
  function refreshChrome(wasAdmin) {
    if (!rendered) return;
    var btn = document.getElementById("el-profile-btn");
    if (btn) btn.innerHTML = '<span class="avatar avatar--sm">' + EL.avatarInner(state.currentUser) + "</span>";
    var menu = document.getElementById("el-profile-menu");
    if (menu) menu.innerHTML = profileMenuInner();   // in place — keeps its handlers
    // The Admin Panel link is driven by the JWT role, which we only learn after
    // the session resolves — rebuild the nav if that answer changed.
    if (wasAdmin !== isAdmin) {
      var body = document.querySelector("#el-sidebar .sidebar__body");
      if (body) body.innerHTML = sidebarBodyHtml();
      var panel = document.querySelector("#el-sheet .app-sheet__panel");
      if (panel) panel.innerHTML = sidebarBodyHtml();
    }
    renderIcons();
  }

  if (hasStoredSession()) renderOnce();

  ensureSB().then(function (SB) {
    // No Supabase (local dev with mock data) — just draw it.
    if (!SB || !SB.configured) { renderOnce(); return; }
    SB.requireAuth().then(function (session) {
      if (!session) return;   // requireAuth already redirected to auth.html
      var wasAdmin = isAdmin;
      isAdmin = SB.roleOf ? SB.roleOf(session.user) === "admin" : isAdmin;
      Promise.all([hydrateUser(), hydrateSettings()]).then(function () {
        renderOnce();            // first paint, if the optimistic one didn't run
        refreshChrome(wasAdmin); // otherwise refresh what changed
        startAdCycle();          // restart on the admin's real frequency
      });
      // Suspended/banned accounts are signed out here rather than in
      // requireAuth, so the check costs no time before first paint.
      if (SB.enforceStatus) SB.enforceStatus();
    });
  });
})();
