/* =============================================================================
   EarnLoop — Admin Dashboard logic (replaces AdminDashboardPage.tsx)
   Standalone admin shell with hash-routed sections:
   overview · users · review · tasks · campaigns · content · logs
   ============================================================================= */
(function () {
  "use strict";

  // Admin-only guard. The page starts hidden (inline head script); reveal it
  // only for a confirmed admin session, otherwise SB.requireAdmin redirects
  // (no session → auth.html, signed-in non-admin → dashboard.html). The UI is
  // built below into the still-hidden DOM, so nothing flashes before we decide.
  function reveal() { if (window.__adminReveal) window.__adminReveal(); }
  if (window.SB && window.SB.configured) {
    window.SB.requireAdmin().then(function (session) { if (session) reveal(); });
  } else {
    reveal(); // Auth not wired yet — allow through for local dev.
  }

  var seed = window.EARNLOOP_SEED;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return EL.escapeHtml(s); }

  var NAV = [
    { id: "overview", label: "Overview", icon: "bar-chart-3" },
    { id: "users", label: "Users", icon: "users" },
    { id: "review", label: "Review Queue", icon: "clipboard-list" },
    { id: "tasks", label: "Tasks & Rewards", icon: "list-checks" },
    { id: "campaigns", label: "Campaigns", icon: "megaphone" },
    { id: "content", label: "Content & Ads", icon: "video" },
    { id: "logs", label: "Admin Logs", icon: "file-text" },
  ];
  var FOOTER = [
    { id: "overview", label: "Overview", icon: "bar-chart-3" },
    { id: "users", label: "Users", icon: "users" },
    { id: "review", label: "Review", icon: "clipboard-list" },
    { id: "logs", label: "Logs", icon: "file-text" },
  ];
  var META = {
    overview: { title: "Overview", description: "Platform health, revenue, and country performance at a glance." },
    users: { title: "Users", description: "View, suspend, ban, or delete platform users." },
    review: { title: "Review Queue", description: "Approve or reject pending screenshot submissions." },
    tasks: { title: "Tasks & Rewards", description: "Edit reward rules, categories, referral, and XP settings." },
    campaigns: { title: "Campaigns", description: "Every campaign purchased across the platform." },
    content: { title: "Content & Ads", description: "Manage the featured video and video ad settings." },
    logs: { title: "Admin Logs", description: "An audit trail of every admin action." },
  };
  var CATEGORY_ICON = { share2: "share-2", music: "music", globe: "globe", smartphone: "smartphone", users: "users", tag: "tag" };
  var USER_STATUS = {
    active: { label: "Active", cls: "badge--success" },
    suspended: { label: "Suspended", cls: "badge--warning" },
    banned: { label: "Banned", cls: "badge--destructive" },
  };
  var CAMPAIGN_STATUS = {
    active: { label: "Active", cls: "badge--info" },
    completed: { label: "Completed", cls: "badge--success" },
    pending: { label: "Pending", cls: "badge--warning" },
    paused: { label: "Paused", cls: "badge--warning" },
  };

  function section() { return (location.hash || "").replace("#", "") || "overview"; }

  // When Supabase is wired, the Review Queue pulls real pending submissions.
  // `livePending` caches the last loaded list (null = not loaded / using mock).
  function usingLiveAdmin() { return !!(window.SB && window.SB.configured); }
  var livePending = null;

  /* --- Chrome (nav, header, footer) ------------------------------------- */
  function renderNav() {
    var active = section();
    var links = NAV.map(function (item) {
      return '<a href="#' + item.id + '" class="admin-nav__link' + (item.id === active ? " is-active" : "") + '">' +
        '<i data-lucide="' + item.icon + '"></i><span class="admin-nav__label">' + item.label + "</span></a>";
    }).join("");
    $("admin-nav").innerHTML = links;
    $("admin-nav-mobile").innerHTML = links;

    var queueCount = livePending != null ? livePending.length : EL.store.get().adminSubmissionsQueue.length;
    $("admin-footer-nav").innerHTML = FOOTER.map(function (item) {
      var dot = (item.id === "review" && queueCount > 0) ? '<span class="admin-footer-nav__dot"></span>' : "";
      return '<a href="#' + item.id + '" class="admin-footer-nav__item' + (item.id === active ? " is-active" : "") + '">' +
        '<i data-lucide="' + item.icon + '"></i>' + item.label + dot + "</a>";
    }).join("");
  }

  /* --- Section renderers ------------------------------------------------ */
  function renderOverviewLive() {
    $("admin-content").innerHTML = '<div class="admin-ov"><p class="admin-ov__sub">Loading overview…</p></div>';
    window.SB.adminOverview().then(function (res) {
      if (!res || res.error || !res.data) {
        $("admin-content").innerHTML = emptyState("bar-chart-3", "Couldn't load overview", (res && res.error && res.error.message) || "Please try again.");
        renderIcons();
        return;
      }
      var d = res.data;
      var countries = d.countries || [];
      var maxUsers = Math.max.apply(null, countries.map(function (c) { return Number(c.users) || 0; }).concat([1]));
      var ctryHtml = countries.length ? countries.map(function (c) {
        var users = Number(c.users) || 0, rev = Number(c.revenue) || 0;
        return '<div><div class="admin-ctry__top"><span class="admin-ctry__name">' + esc(c.country) + '</span>' +
          '<span class="admin-ctry__rev">' + EL.formatCurrency(rev) + '</span></div>' +
          '<div class="progress"><div class="progress__bar" style="width:' + Math.round((users / maxUsers) * 100) + '%"></div></div>' +
          '<div class="admin-ctry__users">' + EL.formatNumber(users) + ' users</div></div>';
      }).join("") : '<p class="admin-ov__sub">No users yet.</p>';

      $("admin-content").innerHTML =
        '<div class="admin-ov">' +
        '<div class="stat-grid">' +
        statCard("users", "Total Users", d.total_users) +
        statCard("clipboard-list", "Pending Reviews", d.pending_reviews) +
        statCard("megaphone", "Active Campaigns", d.active_campaigns) +
        statCard("dollar-sign", "Total Revenue", Number(d.total_revenue) || 0, "$", "", 2) +
        "</div>" +
        '<div class="admin-ov__grid">' +
        '<div class="card card--pad-lg admin-ov__wide">' +
        '<div class="admin-ov__head"><div><h3 class="section-title">Platform Totals</h3>' +
        '<p class="admin-ov__sub">Lifetime activity across the platform.</p></div></div>' +
        '<div class="admin-perf">' +
        perf(EL.formatNumber(d.total_campaigns), "Campaigns") +
        perf(EL.formatNumber(d.tasks_completed), "Tasks Approved") +
        perf(EL.formatNumber(d.points_awarded), "Points Awarded") +
        perf(EL.formatNumber(d.pending_reviews), "Pending Reviews") +
        "</div></div>" +
        '<div class="card card--pad-lg"><h3 class="section-title">Country Analytics</h3>' +
        '<div class="admin-ctry">' + ctryHtml + "</div></div>" +
        "</div></div>";
      animateCounts();
      renderIcons();
    });
  }

  function renderOverview() {
    if (usingLiveAdmin()) { renderOverviewLive(); return; }
    var s = EL.store.get();
    var pp = seed.platformPerformance;
    var ca = seed.countryAnalytics;
    var totalRevenue = ca.reduce(function (sum, c) { return sum + c.revenue; }, 0);
    var maxRevenue = Math.max.apply(null, ca.map(function (c) { return c.revenue; }));

    var values = seed.revenueSeries.slice(-6);
    var labels = seed.monthLabels.slice(-6);
    var max = Math.max.apply(null, values);
    var chart = values.map(function (v, i) {
      return '<div class="admin-chart__col"><div class="admin-chart__bar" style="height:0%" data-bar="' + Math.round((v / max) * 100) + '"></div>' +
        '<span class="admin-chart__label">' + labels[i] + "</span></div>";
    }).join("");

    var countries = ca.map(function (c) {
      return '<div><div class="admin-ctry__top"><span class="admin-ctry__name">' + esc(c.country) + '</span><span class="admin-ctry__rev">' + EL.formatCurrency(c.revenue) + "</span></div>" +
        '<div class="progress"><div class="progress__bar" style="width:' + ((c.revenue / maxRevenue) * 100) + '%"></div></div>' +
        '<div class="admin-ctry__users">' + EL.formatNumber(c.users) + " users</div></div>";
    }).join("");

    $("admin-content").innerHTML =
      '<div class="admin-ov">' +
      '<div class="stat-grid">' +
      statCard("users", "Total Users", s.adminUsers.length) +
      statCard("clipboard-list", "Pending Reviews", s.adminSubmissionsQueue.length) +
      statCard("gauge", "Platform Uptime", pp.uptime, "", "%", 2) +
      statCard("activity", "Active Users Now", pp.activeUsersNow) +
      "</div>" +
      '<div class="admin-ov__grid">' +
      '<div class="card card--pad-lg admin-ov__wide">' +
      '<div class="admin-ov__head"><div><h3 class="section-title">Revenue Performance</h3>' +
      '<p class="admin-ov__sub">Total revenue: ' + EL.formatCurrency(totalRevenue) + "</p></div>" +
      '<span class="badge badge--secondary">Last 6 months</span></div>' +
      '<div class="admin-chart">' + chart + "</div>" +
      '<div class="admin-perf">' +
      perf(pp.avgResponseMs + "ms", "Avg Response") +
      perf(EL.formatNumber(pp.tasksCompletedToday), "Tasks Today") +
      perf(pp.pendingReviews, "Pending Reviews") +
      perf(pp.uptime + "%", "Uptime") +
      "</div></div>" +
      '<div class="card card--pad-lg"><h3 class="section-title">Country Analytics</h3>' +
      '<div class="admin-ctry">' + countries + "</div></div>" +
      "</div></div>";

    // animate chart bars
    setTimeout(function () {
      document.querySelectorAll("#admin-content [data-bar]").forEach(function (bar, i) {
        setTimeout(function () { bar.style.height = bar.getAttribute("data-bar") + "%"; }, i * 50);
      });
    }, 60);
    animateCounts();
  }
  function perf(v, l) { return '<div><div class="admin-perf__v">' + v + '</div><div class="admin-perf__l">' + l + "</div></div>"; }
  function statCard(icon, label, value, prefix, suffix, decimals) {
    return '<div class="card card--pad"><div class="stat-card__top"><span class="stat-card__ic"><i data-lucide="' + icon + '"></i></span></div>' +
      '<span class="stat-card__value" data-count="' + value + '"' + (prefix ? ' data-prefix="' + prefix + '"' : "") +
      (suffix ? ' data-suffix="' + suffix + '"' : "") + (decimals ? ' data-decimals="' + decimals + '"' : "") + '>0</span>' +
      '<div class="stat-card__label">' + label + "</div></div>";
  }

  var liveUsers = null;

  function renderUsers() {
    if (usingLiveAdmin()) { renderUsersLive(); return; }
    renderUsersFrom(EL.store.get().adminUsers);
  }

  function renderUsersLive() {
    $("admin-content").innerHTML = '<div class="card card--pad"><p class="admin-tr__sub">Loading users…</p></div>';
    window.SB.getUsers().then(function (res) {
      if (!res || res.error) {
        $("admin-content").innerHTML = emptyState("users", "Couldn't load users", (res && res.error && res.error.message) || "Please try again.");
        renderIcons();
        return;
      }
      liveUsers = (res.data || []).map(function (p) {
        return { id: p.id, name: p.full_name || p.username || "User", email: p.email || "", country: p.country || "—", level: p.level, points: p.points, status: p.status || "active" };
      });
      renderUsersFrom(liveUsers);
      wireSection("users"); // bind menus rendered after the async load
    });
  }

  function adminUserList() { return liveUsers != null ? liveUsers : EL.store.get().adminUsers; }

  function renderUsersFrom(users) {
    if (users.length === 0) {
      $("admin-content").innerHTML = emptyState("users", "No users", "Every user on the platform will show up here.");
      renderIcons();
      return;
    }
    var rows = users.map(function (u) {
      var st = USER_STATUS[u.status] || USER_STATUS.active;
      var items = "";
      if (u.status !== "active") items += menuItem(u.id, "active", "check", "Activate");
      if (u.status !== "suspended") items += menuItem(u.id, "suspended", "shield-check", "Suspend");
      if (u.status !== "banned") items += menuItem(u.id, "banned", "ban", "Ban");
      items += '<div class="admin-menu__sep"></div>' +
        '<button type="button" class="admin-menu__item admin-menu__item--danger" data-del="' + u.id + '"><i data-lucide="trash-2"></i> Delete</button>';
      return "<tr>" +
        '<td><div class="admin-user"><span class="avatar avatar--sm"><span class="avatar__fallback">' + EL.initials(u.name) + "</span></span>" +
        '<div class="admin-user__body"><div class="admin-user__name">' + esc(u.name) + '</div><div class="admin-user__email">' + esc(u.email) + "</div></div></div></td>" +
        '<td class="admin-td-muted">' + esc(u.country) + "</td>" +
        '<td class="admin-td-muted">' + u.level + "</td>" +
        '<td class="admin-td-muted">' + EL.formatNumber(u.points) + "</td>" +
        '<td><span class="badge ' + st.cls + '">' + st.label + "</span></td>" +
        '<td class="is-right"><div class="admin-menu-wrap"><button type="button" class="admin-iconbtn" data-menu="' + u.id + '"><i data-lucide="more-horizontal"></i></button>' +
        '<div class="admin-menu" data-menu-for="' + u.id + '" hidden>' + items + "</div></div></td>" +
        "</tr>";
    }).join("");
    $("admin-content").innerHTML =
      '<div class="card card--flush"><div class="table-wrap"><table class="table"><thead><tr>' +
      "<th>User</th><th>Country</th><th>Level</th><th>Points</th><th>Status</th><th class=\"is-right\">Actions</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }
  function menuItem(id, status, icon, label) {
    return '<button type="button" class="admin-menu__item" data-status="' + status + '" data-user="' + id + '"><i data-lucide="' + icon + '"></i> ' + label + "</button>";
  }

  function renderReview() {
    if (usingLiveAdmin()) { renderReviewLive(); return; }
    var queue = EL.store.get().adminSubmissionsQueue;
    if (queue.length === 0) {
      $("admin-content").innerHTML = emptyState("clipboard-list", "Queue is empty", "New screenshot submissions will appear here for review.");
      return;
    }
    $("admin-content").innerHTML = '<div class="admin-review">' + queue.map(function (item) {
      return '<div class="card card--pad admin-review__item">' +
        '<span class="admin-review__ic">' + EL.platformIcon(item.platform, "") + "</span>" +
        '<div class="admin-review__body"><div class="admin-review__task">' + esc(item.task) + "</div>" +
        '<div class="admin-review__meta">' + esc(item.user) + " · +" + item.points + " pts · submitted " + EL.timeAgo(item.submittedAt) + "</div></div>" +
        '<div class="admin-review__actions">' +
        '<button type="button" class="btn btn--secondary btn--sm" data-reject="' + item.id + '"><i data-lucide="x"></i> Reject</button>' +
        '<button type="button" class="btn btn--primary btn--sm" data-approve="' + item.id + '"><i data-lucide="check"></i> Approve</button>' +
        "</div></div>";
    }).join("") + "</div>";
  }

  function renderReviewLive() {
    $("admin-content").innerHTML = '<div class="admin-review"><p class="admin-tr__sub">Loading submissions…</p></div>';
    window.SB.getPendingSubmissions().then(function (res) {
      if (!res || res.error) {
        $("admin-content").innerHTML = emptyState("clipboard-list", "Couldn't load queue", (res && res.error && res.error.message) || "Please try again.");
        renderIcons();
        return;
      }
      livePending = res.data || [];
      renderNav(); // refresh footer badge count
      if (livePending.length === 0) {
        $("admin-content").innerHTML = emptyState("clipboard-list", "Queue is empty", "New screenshot submissions will appear here for review.");
        renderIcons();
        return;
      }
      $("admin-content").innerHTML = '<div class="admin-review">' + livePending.map(function (item) {
        var task = item.tasks || {};
        var prof = item.profiles || {};
        var who = prof.full_name || prof.username || "User";
        var proofBtn = item.screenshot_url
          ? '<button type="button" class="btn btn--outline btn--sm" data-proof="' + esc(item.id) + '"><i data-lucide="image"></i> View proof</button>'
          : "";
        return '<div class="card card--pad admin-review__item">' +
          '<span class="admin-review__ic">' + EL.platformIcon(task.platform, "") + "</span>" +
          '<div class="admin-review__body"><div class="admin-review__task">' + esc(task.title || "Task") + "</div>" +
          '<div class="admin-review__meta">' + esc(who) + " · +" + (task.points || 0) + " pts · submitted " + EL.timeAgo(item.created_at) + "</div></div>" +
          '<div class="admin-review__actions">' + proofBtn +
          '<button type="button" class="btn btn--secondary btn--sm" data-reject="' + esc(item.id) + '"><i data-lucide="x"></i> Reject</button>' +
          '<button type="button" class="btn btn--primary btn--sm" data-approve="' + esc(item.id) + '"><i data-lucide="check"></i> Approve</button>' +
          "</div></div>";
      }).join("") + "</div>";
      renderIcons();
      wireSection("review"); // bind buttons that were rendered after the async load
    });
  }

  function renderTasks() {
    var s = EL.store.get();
    var rules = s.rewardRules.map(function (r) {
      return '<div class="admin-rule"><span class="admin-rule__action">' + esc(r.action) + "</span>" +
        '<div class="admin-rule__edit"><input class="input" type="number" min="0" value="' + r.points + '" data-rule="' + esc(r.action) + '" />' +
        '<span class="admin-rule__unit">pts</span></div></div>';
    }).join("");
    var cats = s.taskCategories.map(function (c) {
      var icon = CATEGORY_ICON[c.icon] || "tag";
      return '<span class="admin-cat"><i data-lucide="' + icon + '" style="color:' + c.color + '"></i>' + esc(c.name) + "</span>";
    }).join("");

    $("admin-content").innerHTML =
      '<div class="admin-tr">' +
      '<div class="card card--pad-lg"><h3 class="section-title">Reward Rules</h3>' +
      '<p class="admin-tr__sub">Edit how many points each action earns platform-wide.</p>' +
      '<div class="admin-rules">' + rules + "</div></div>" +
      '<div class="card card--pad-lg"><div class="admin-tr__head"><h3 class="section-title">Task Categories</h3>' +
      '<button type="button" class="btn btn--secondary btn--sm" id="admin-add-cat"><i data-lucide="plus"></i> Add Category</button></div>' +
      '<div class="admin-cats">' + cats + "</div></div>" +
      '<div class="card card--pad-lg"><h3 class="section-title">Referral &amp; XP Program</h3>' +
      '<div class="admin-prog-grid">' +
      '<div class="field"><label class="field__label" for="admin-ref">Referral Reward (points)</label><input id="admin-ref" class="input" type="number" min="0" value="' + s.platformSettings.referralReward + '" /></div>' +
      '<div class="field"><label class="field__label" for="admin-xp">XP Required Per Level</label><input id="admin-xp" class="input" type="number" min="0" value="' + s.platformSettings.xpPerLevel + '" /></div>' +
      "</div><div class=\"admin-save\"><button type=\"button\" class=\"btn btn--primary\" id=\"admin-save-prog\">Save Settings</button></div></div>" +
      "</div>";
  }

  function renderCampaigns() {
    if (usingLiveAdmin()) { renderCampaignsLive(); return; }
    renderCampaignsFrom(EL.store.get().campaigns);
  }

  function renderCampaignsLive() {
    $("admin-content").innerHTML = '<div class="card card--pad"><p class="admin-tr__sub">Loading campaigns…</p></div>';
    window.SB.getAllCampaigns().then(function (res) {
      if (!res || res.error) {
        $("admin-content").innerHTML = emptyState("megaphone", "Couldn't load campaigns", (res && res.error && res.error.message) || "Please try again.");
        renderIcons();
        return;
      }
      renderCampaignsFrom(res.data || []);
    });
  }

  function renderCampaignsFrom(campaigns) {
    if (campaigns.length === 0) {
      $("admin-content").innerHTML = emptyState("megaphone", "No campaigns", "Campaigns created by users will appear here.");
      renderIcons();
      return;
    }
    var rows = campaigns.map(function (c) {
      var pct = Math.round((c.progress / c.target) * 100);
      var st = CAMPAIGN_STATUS[c.status] || CAMPAIGN_STATUS.active;
      return "<tr>" +
        '<td><div class="admin-camp"><span class="admin-camp__ic">' + EL.platformIcon(c.platform, "") + "</span>" +
        '<span class="admin-camp__title">' + esc(c.title) + "</span></div></td>" +
        '<td class="admin-camp-prog"><div class="admin-camp-prog__row"><div class="progress"><div class="progress__bar" style="width:' + pct + '%"></div></div>' +
        '<span class="admin-camp-prog__pct">' + pct + "%</span></div></td>" +
        '<td class="admin-td-muted">' + EL.formatCurrency(c.cost) + "</td>" +
        '<td class="admin-td-muted admin-cap">' + esc(c.method) + "</td>" +
        '<td><span class="badge ' + st.cls + '">' + st.label + "</span></td>" +
        "</tr>";
    }).join("");
    $("admin-content").innerHTML =
      '<div class="card card--flush"><div class="table-wrap"><table class="table"><thead><tr>' +
      "<th>Campaign</th><th>Progress</th><th>Cost</th><th>Method</th><th>Status</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }

  /* --- Content & Ads ----------------------------------------------------
     Two upload forms (featured video → featured_videos, house ad → video_ads)
     plus the ad frequency/reward settings. Both uploads go to the same public
     ad-videos bucket; the RLS policies already restrict these tables to admins,
     so no extra RPC is involved. */
  var liveFeatured = null, liveAllAds = null;

  function renderContent() {
    var s = EL.store.get();
    $("admin-content").innerHTML =
      '<div class="admin-content">' +

      // --- Featured video ---
      '<div class="card card--pad-lg"><h3 class="section-title">Featured Video</h3>' +
      '<p class="admin-content__sub">Shown on every user\'s dashboard. Use it for sponsored products or announcements.</p>' +
      '<div class="field"><label class="field__label" for="admin-fv-title">Title</label>' +
      '<input id="admin-fv-title" class="input" type="text" placeholder="Platform Update 2.4" /></div>' +
      '<div class="field"><label class="field__label" for="admin-fv-desc">Description</label>' +
      '<textarea id="admin-fv-desc" class="textarea" rows="2" placeholder="A short line about what this video covers."></textarea></div>' +
      '<div class="field"><label class="field__label">Video file</label>' +
      '<input id="admin-fv-file" type="file" accept="video/*" hidden />' +
      '<div class="admin-featured-row">' +
      '<button type="button" class="btn btn--outline" id="admin-fv-choose"><i data-lucide="upload"></i> Choose video</button>' +
      '<span class="admin-content__sub" id="admin-fv-name">No video selected</span></div></div>' +
      '<div id="admin-fv-preview"></div>' +
      '<div class="admin-save"><button type="button" class="btn btn--primary" id="admin-fv-publish" disabled><i data-lucide="video"></i> Publish Featured Video</button></div>' +
      '<div id="admin-fv-list"></div></div>' +

      // --- House ad ---
      '<div class="card card--pad-lg"><h3 class="section-title">Post a Platform Ad</h3>' +
      '<p class="admin-content__sub">A house ad the platform runs itself — nobody is charged, and you set the view count directly.</p>' +
      '<div class="admin-prog-grid">' +
      '<div class="field"><label class="field__label" for="admin-ad-brand">Brand</label>' +
      '<input id="admin-ad-brand" class="input" type="text" placeholder="EarnLoop" /></div>' +
      '<div class="field"><label class="field__label" for="admin-ad-views">Views to deliver</label>' +
      '<input id="admin-ad-views" class="input" type="number" min="1" step="100" value="5000" /></div></div>' +
      '<div class="field"><label class="field__label" for="admin-ad-link">Link (optional)</label>' +
      '<input id="admin-ad-link" class="input" type="text" placeholder="https://..." /></div>' +
      '<div class="field"><label class="field__label">Video file</label>' +
      '<input id="admin-ad-file" type="file" accept="video/*" hidden />' +
      '<div class="admin-featured-row">' +
      '<button type="button" class="btn btn--outline" id="admin-ad-choose"><i data-lucide="upload"></i> Choose video</button>' +
      '<span class="admin-content__sub" id="admin-ad-name">No video selected</span></div></div>' +
      '<div id="admin-ad-preview"></div>' +
      '<div class="admin-save"><button type="button" class="btn btn--primary" id="admin-ad-publish" disabled><i data-lucide="video"></i> Publish Ad</button></div></div>' +

      // --- Ad settings ---
      '<div class="card card--pad-lg"><h3 class="section-title">Video Advertisements</h3>' +
      '<p class="admin-content__sub">Non-skippable ads shown while users complete tasks. Revenue model: CPM.</p>' +
      '<div class="admin-prog-grid">' +
      '<div class="field"><label class="field__label" for="admin-adfreq">Show Every (minutes)</label><input id="admin-adfreq" class="input" type="number" min="1" value="' + s.platformSettings.adFrequencyMinutes + '" /></div>' +
      '<div class="field"><label class="field__label" for="admin-adreward">Reward Per Watch (points)</label><input id="admin-adreward" class="input" type="number" min="0" value="' + s.platformSettings.adReward + '" /></div>' +
      "</div><div class=\"admin-save\"><button type=\"button\" class=\"btn btn--primary\" id=\"admin-save-ads\">Save Settings</button></div></div>" +

      // --- Running ads ---
      '<div class="card card--pad-lg"><h3 class="section-title">Running Ads</h3>' +
      '<p class="admin-content__sub">Every ad on the platform, including ones users paid for.</p>' +
      '<div id="admin-ad-list"></div></div>' +
      "</div>";

    if (usingLiveAdmin()) { loadFeatured(); loadAllAds(); }
  }

  /* --- Featured video list ---------------------------------------------- */
  function loadFeatured() {
    window.SB.getFeaturedVideos().then(function (res) {
      if (!res || res.error) return;
      liveFeatured = res.data || [];
      renderFeaturedList();
    });
  }

  function renderFeaturedList() {
    var host = $("admin-fv-list");
    if (!host) return;
    if (!liveFeatured || !liveFeatured.length) {
      host.innerHTML = '<p class="admin-content__sub">No featured video published yet.</p>';
      return;
    }
    host.innerHTML =
      '<h4 class="dash-camps__h">Published</h4><div class="admin-vid-list">' +
      liveFeatured.map(function (v, i) {
        // Only the newest active one actually appears on the dashboard.
        var isLive = v.active && liveFeatured.filter(function (x, j) { return x.active && j < i; }).length === 0;
        return (
          '<div class="admin-vid">' +
          '<div class="admin-vid__body"><div class="admin-vid__title">' + EL.escapeHtml(v.title || "Untitled") + "</div>" +
          '<div class="admin-vid__sub">' + EL.formatDate(v.created_at) + "</div></div>" +
          '<span class="badge ' + (isLive ? "badge--success" : v.active ? "badge--secondary" : "badge--outline") + '">' +
          (isLive ? "On dashboard" : v.active ? "Active" : "Hidden") + "</span>" +
          '<button type="button" class="btn btn--ghost btn--sm" data-fv-toggle="' + v.id + '" data-fv-active="' + (v.active ? "1" : "0") + '">' +
          (v.active ? "Hide" : "Show") + "</button>" +
          '<button type="button" class="btn btn--ghost btn--sm" data-fv-del="' + v.id + '"><i data-lucide="trash-2"></i></button>' +
          "</div>"
        );
      }).join("") + "</div>";
    wireFeaturedList();
    renderIcons();
  }

  function wireFeaturedList() {
    $("admin-fv-list").querySelectorAll("[data-fv-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-fv-active") !== "1";
        window.SB.setFeaturedVideoActive(btn.getAttribute("data-fv-toggle"), next).then(function (res) {
          if (res && res.error) { EL.toast.error("Couldn't update: " + res.error.message); return; }
          window.SB.adminLog(next ? "Showed a featured video" : "Hid a featured video");
          loadFeatured();
        });
      });
    });
    $("admin-fv-list").querySelectorAll("[data-fv-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!window.confirm("Delete this featured video?")) return;
        window.SB.deleteFeaturedVideo(btn.getAttribute("data-fv-del")).then(function (res) {
          if (res && res.error) { EL.toast.error("Couldn't delete: " + res.error.message); return; }
          window.SB.adminLog("Deleted a featured video");
          EL.toast.success("Deleted");
          loadFeatured();
        });
      });
    });
  }

  /* --- Shared upload form ------------------------------------------------
     The featured-video and house-ad forms differ only in which fields must be
     filled and what gets inserted afterwards, so they share this wiring:
     pick file → local preview → upload to the bucket → insert the row. */
  function wireVideoForm(cfg) {
    var file = null, previewUrl = "";
    var fileEl = $(cfg.fileId), chooseEl = $(cfg.chooseId), nameEl = $(cfg.nameId);
    var previewEl = $(cfg.previewId), publishEl = $(cfg.publishId);
    if (!fileEl || !publishEl) return;

    function sync() { publishEl.disabled = !(file && cfg.ready()); }

    function clearFile() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      file = null; previewUrl = ""; fileEl.value = "";
      nameEl.textContent = "No video selected";
      previewEl.innerHTML = "";
    }

    chooseEl.addEventListener("click", function () { fileEl.click(); });
    fileEl.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      file = f;
      previewUrl = URL.createObjectURL(f);
      nameEl.textContent = f.name;
      previewEl.innerHTML = '<video src="' + previewUrl + '" controls muted class="admin-vid-preview"></video>';
      sync();
    });
    (cfg.watch || []).forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", sync);
    });

    publishEl.addEventListener("click", function () {
      if (!file || !cfg.ready()) return;
      if (!usingLiveAdmin()) { EL.toast.error("Connect Supabase to publish videos."); return; }
      var label = publishEl.innerHTML;
      publishEl.disabled = true;
      // Show the real byte progress — video files are big enough that an
      // indefinite spinner is indistinguishable from a hang.
      function busy(text) { publishEl.innerHTML = '<i data-lucide="loader"></i> ' + text; renderIcons(); }
      busy("Uploading…");
      window.SB.uploadVideo(file, cfg.kind, function (fraction) {
        busy("Uploading " + Math.round(fraction * 100) + "%");
      }).then(function (up) {
        if (up.error) throw up.error;
        busy("Publishing…");
        return cfg.publish(up.data.url);
      }).then(function (res) {
        if (res && res.error) throw res.error;
        publishEl.innerHTML = label;
        clearFile();
        sync();
        renderIcons();
        cfg.done();
      }).catch(function (err) {
        publishEl.innerHTML = label;
        publishEl.disabled = false;
        renderIcons();
        EL.toast.error((err && err.message) || "Upload failed.");
      });
    });

    sync();
  }

  /* --- All ads list ------------------------------------------------------ */
  function loadAllAds() {
    window.SB.getAllVideoAds().then(function (res) {
      if (!res || res.error) return;
      liveAllAds = res.data || [];
      renderAdList();
    });
  }

  function renderAdList() {
    var host = $("admin-ad-list");
    if (!host) return;
    if (!liveAllAds || !liveAllAds.length) {
      host.innerHTML = '<p class="admin-content__sub">No video ads yet.</p>';
      return;
    }
    host.innerHTML = '<div class="admin-vid-list">' + liveAllAds.map(function (a) {
      var owner = a.profiles ? (a.profiles.full_name || a.profiles.username) : "Platform";
      var served = (a.impressions_total || 0) - (a.impressions_remaining || 0);
      var st = a.status === "active" ? "badge--info" : a.status === "completed" ? "badge--success" : "badge--secondary";
      return (
        '<div class="admin-vid">' +
        '<div class="admin-vid__body"><div class="admin-vid__title">' + EL.escapeHtml(a.brand || "Untitled") + "</div>" +
        '<div class="admin-vid__sub">' + EL.escapeHtml(owner) + " · " + EL.formatNumber(served) + "/" + EL.formatNumber(a.impressions_total || 0) + " views</div></div>" +
        '<span class="badge ' + st + '">' + (a.status || "") + "</span>" +
        (a.status === "active"
          ? '<button type="button" class="btn btn--ghost btn--sm" data-ad-stop="' + a.id + '">Stop</button>'
          : "") +
        "</div>"
      );
    }).join("") + "</div>";
    host.querySelectorAll("[data-ad-stop]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!window.confirm("Stop showing this ad? Remaining views won't be delivered.")) return;
        window.SB.stopVideoAd(btn.getAttribute("data-ad-stop")).then(function (res) {
          if (res && res.error) { EL.toast.error("Couldn't stop: " + res.error.message); return; }
          window.SB.adminLog("Stopped a video ad");
          EL.toast.success("Ad stopped");
          loadAllAds();
        });
      });
    });
    renderIcons();
  }

  function renderLogs() {
    if (usingLiveAdmin()) { renderLogsLive(); return; }
    renderLogsFrom(EL.store.get().adminLogs);
  }

  function renderLogsLive() {
    $("admin-content").innerHTML = '<div class="card card--pad"><p class="admin-tr__sub">Loading logs…</p></div>';
    window.SB.getAdminLogs().then(function (res) {
      if (!res || res.error) {
        $("admin-content").innerHTML = emptyState("file-text", "Couldn't load logs", (res && res.error && res.error.message) || "Please try again.");
        renderIcons();
        return;
      }
      var logs = (res.data || []).map(function (x) {
        return { id: x.id, admin: (x.profiles && x.profiles.full_name) || "Admin", action: x.action, time: x.created_at };
      });
      renderLogsFrom(logs);
    });
  }

  function renderLogsFrom(logs) {
    if (logs.length === 0) {
      $("admin-content").innerHTML = emptyState("file-text", "No admin activity", "Actions taken by admins will be logged here for auditing.");
      renderIcons();
      return;
    }
    $("admin-content").innerHTML = '<div class="card card--flush admin-logs">' + logs.map(function (log) {
      return '<div class="admin-log"><span class="admin-log__ic"><i data-lucide="file-text"></i></span>' +
        '<div><p class="admin-log__action">' + esc(log.action) + "</p>" +
        '<p class="admin-log__meta">' + esc(log.admin) + " · " + EL.timeAgo(log.time) + "</p></div></div>";
    }).join("") + "</div>";
    renderIcons();
  }

  function emptyState(icon, title, desc) {
    return '<div class="empty-state"><span class="empty-state__ic"><i data-lucide="' + icon + '"></i></span>' +
      '<p class="empty-state__title">' + title + '</p><p class="empty-state__desc">' + desc + "</p></div>";
  }

  /* --- Section event wiring --------------------------------------------- */
  function wireSection(sec) {
    var content = $("admin-content");
    if (sec === "users") {
      content.querySelectorAll("[data-menu]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var menu = content.querySelector('[data-menu-for="' + btn.getAttribute("data-menu") + '"]');
          var wasHidden = menu.hidden;
          closeMenus();
          menu.hidden = !wasHidden;
        });
      });
      content.querySelectorAll("[data-status]").forEach(function (btn) {
        btn.addEventListener("click", function () { setUserStatus(btn.getAttribute("data-user"), btn.getAttribute("data-status")); });
      });
      content.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.addEventListener("click", function () { openDelete(btn.getAttribute("data-del")); });
      });
    } else if (sec === "review") {
      content.querySelectorAll("[data-approve]").forEach(function (btn) {
        btn.addEventListener("click", function () { reviewAction(btn.getAttribute("data-approve"), true); });
      });
      content.querySelectorAll("[data-reject]").forEach(function (btn) {
        btn.addEventListener("click", function () { reviewAction(btn.getAttribute("data-reject"), false); });
      });
      content.querySelectorAll("[data-proof]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var item = (livePending || []).filter(function (x) { return x.id === btn.getAttribute("data-proof"); })[0];
          if (!item || !item.screenshot_url || !window.SB) return;
          window.SB.screenshotUrl(item.screenshot_url).then(function (res) {
            if (res && res.data && res.data.signedUrl) window.open(res.data.signedUrl, "_blank", "noopener");
            else EL.toast.error("Couldn't open the screenshot.");
          });
        });
      });
    } else if (sec === "tasks") {
      content.querySelectorAll("[data-rule]").forEach(function (input) {
        input.addEventListener("change", function () {
          var val = Number(input.value);
          if (!isFinite(val) || val < 0) return;
          var action = input.getAttribute("data-rule");
          EL.store.dispatch({ type: "ADMIN_UPDATE_REWARD_RULE", action: action, points: val });
          if (usingLiveAdmin()) {
            window.SB.updateRewardRule(action, val).then(function (res) {
              if (res && res.error) { EL.toast.error("Couldn't save: " + res.error.message); return; }
              window.SB.adminLog('Set "' + action + '" reward to ' + val + " pts");
              EL.toast.success("Saved");
            });
          }
        });
      });
      $("admin-add-cat").addEventListener("click", function () { openDialog($("admin-cat-dialog")); $("admin-cat-name").focus(); });
      $("admin-save-prog").addEventListener("click", function () {
        var s = EL.store.get();
        var ref = Number($("admin-ref").value) || 0, xp = Number($("admin-xp").value) || 0;
        EL.store.dispatch({ type: "ADMIN_UPDATE_PLATFORM_SETTINGS", settings: Object.assign({}, s.platformSettings, {
          referralReward: ref, xpPerLevel: xp }) });
        if (usingLiveAdmin()) {
          Promise.all([window.SB.updateSetting("referral_reward", ref), window.SB.updateSetting("xp_per_level", xp)]).then(function (r) {
            var err = (r[0] && r[0].error) || (r[1] && r[1].error);
            if (err) { EL.toast.error("Couldn't save: " + err.message); return; }
            window.SB.adminLog("Updated referral and XP program settings");
            EL.toast.success("Program settings saved");
          });
        } else {
          EL.store.dispatch({ type: "ADMIN_LOG", action: "Updated referral and XP program settings" });
          EL.toast.success("Program settings saved");
        }
      });
    } else if (sec === "content") {
      wireVideoForm({
        kind: "featured",
        fileId: "admin-fv-file", chooseId: "admin-fv-choose", nameId: "admin-fv-name",
        previewId: "admin-fv-preview", publishId: "admin-fv-publish",
        // A featured video needs a title; an ad needs a brand.
        ready: function () { return !!$("admin-fv-title").value.trim(); },
        watch: ["admin-fv-title"],
        publish: function (url) {
          return window.SB.createFeaturedVideo({
            title: $("admin-fv-title").value.trim(),
            description: $("admin-fv-desc").value.trim(),
            videoUrl: url,
          });
        },
        done: function () {
          $("admin-fv-title").value = ""; $("admin-fv-desc").value = "";
          window.SB.adminLog("Published a featured video");
          EL.toast.success("Featured video published");
          loadFeatured();
        },
      });

      wireVideoForm({
        kind: "ad",
        fileId: "admin-ad-file", chooseId: "admin-ad-choose", nameId: "admin-ad-name",
        previewId: "admin-ad-preview", publishId: "admin-ad-publish",
        ready: function () {
          return !!$("admin-ad-brand").value.trim() && Number($("admin-ad-views").value) > 0;
        },
        watch: ["admin-ad-brand", "admin-ad-views"],
        publish: function (url) {
          return window.SB.createHouseAd({
            brand: $("admin-ad-brand").value.trim(),
            videoUrl: url,
            linkUrl: $("admin-ad-link").value.trim(),
            views: Number($("admin-ad-views").value),
          });
        },
        done: function () {
          $("admin-ad-brand").value = ""; $("admin-ad-link").value = "";
          window.SB.adminLog("Published a platform video ad");
          EL.toast.success("Ad is live");
          loadAllAds();
        },
      });
      $("admin-save-ads").addEventListener("click", function () {
        var s = EL.store.get();
        var freq = Number($("admin-adfreq").value) || 0, reward = Number($("admin-adreward").value) || 0;
        EL.store.dispatch({ type: "ADMIN_UPDATE_PLATFORM_SETTINGS", settings: Object.assign({}, s.platformSettings, {
          adFrequencyMinutes: freq, adReward: reward }) });
        if (usingLiveAdmin()) {
          Promise.all([window.SB.updateSetting("ad_frequency_minutes", freq), window.SB.updateSetting("ad_reward", reward)]).then(function (r) {
            var err = (r[0] && r[0].error) || (r[1] && r[1].error);
            if (err) { EL.toast.error("Couldn't save: " + err.message); return; }
            window.SB.adminLog("Updated video ad frequency settings");
            EL.toast.success("Ad settings saved");
          });
        } else {
          EL.store.dispatch({ type: "ADMIN_LOG", action: "Updated video ad frequency settings" });
          EL.toast.success("Ad settings saved");
        }
      });
    }
  }

  function closeMenus() { document.querySelectorAll(".admin-menu").forEach(function (m) { m.hidden = true; }); }

  function setUserStatus(id, status) {
    var user = adminUserList().filter(function (u) { return u.id === id; })[0];
    if (!user) return;
    var verb = status === "active" ? "Reactivated" : status === "suspended" ? "Suspended" : "Banned";
    if (usingLiveAdmin()) {
      closeMenus();
      window.SB.setUserStatus(id, status).then(function (res) {
        if (res && res.error) { EL.toast.error("Couldn't update: " + res.error.message); return; }
        window.SB.adminLog(verb + " user " + user.name);
        EL.toast.success(user.name + " is now " + status);
        renderUsersLive();
      });
      return;
    }
    EL.store.dispatch({ type: "ADMIN_SET_USER_STATUS", id: id, status: status });
    EL.store.dispatch({ type: "ADMIN_LOG", action: verb + " user " + user.name });
    EL.toast.success(user.name + " is now " + status);
    renderSection();
  }

  /* --- Delete dialog ----------------------------------------------------- */
  var delTargetId = null;
  function openDelete(id) {
    var user = adminUserList().filter(function (u) { return u.id === id; })[0];
    if (!user) return;
    delTargetId = id;
    $("admin-del-title").textContent = "Delete " + user.name + "?";
    openDialog($("admin-del-dialog"));
  }
  $("admin-del-confirm").addEventListener("click", function () {
    if (!delTargetId) return;
    var id = delTargetId;
    var user = adminUserList().filter(function (u) { return u.id === id; })[0];
    var name = user ? user.name : "User";
    delTargetId = null;
    closeDialog($("admin-del-dialog"));
    if (usingLiveAdmin()) {
      window.SB.deleteUser(id).then(function (res) {
        if (res && res.error) { EL.toast.error("Couldn't delete: " + res.error.message); return; }
        window.SB.adminLog("Deleted user " + name);
        EL.toast.success(name + " was deleted");
        renderUsersLive();
      });
      return;
    }
    EL.store.dispatch({ type: "ADMIN_DELETE_USER", id: id });
    EL.store.dispatch({ type: "ADMIN_LOG", action: "Deleted user " + name });
    EL.toast.success(name + " was deleted");
    renderSection();
  });

  /* --- Add-category dialog ---------------------------------------------- */
  var catNameEl = $("admin-cat-name");
  catNameEl.addEventListener("input", function () { $("admin-cat-create").disabled = !catNameEl.value.trim(); });
  $("admin-cat-create").addEventListener("click", function () {
    var name = catNameEl.value.trim();
    if (!name) return;
    var cat = { id: EL.uid("cat"), name: name, icon: "tag", color: "#64748B" };
    EL.store.dispatch({ type: "ADMIN_ADD_CATEGORY", category: cat });
    if (usingLiveAdmin()) {
      window.SB.addTaskCategory(cat).then(function (res) {
        if (res && res.error) { EL.toast.error("Couldn't create: " + res.error.message); return; }
        window.SB.adminLog('Created task category "' + name + '"');
        EL.toast.success("Category created");
      });
    } else {
      EL.store.dispatch({ type: "ADMIN_LOG", action: 'Created task category "' + name + '"' });
      EL.toast.success("Category created");
    }
    catNameEl.value = ""; $("admin-cat-create").disabled = true;
    closeDialog($("admin-cat-dialog"));
    renderSection();
  });

  /* --- Review actions ---------------------------------------------------- */
  function reviewAction(id, approve) {
    // Live path: call the secure RPCs (approve credits points server-side).
    if (usingLiveAdmin()) {
      if (approve) {
        window.SB.approveSubmission(id).then(function (res) {
          if (res && res.error) { EL.toast.error(res.error.message || "Approve failed."); return; }
          EL.toast.success("Approved. Points awarded to the user.");
          renderReviewLive();
        });
      } else {
        var reason = window.prompt("Reason for rejection (the user will see this):", "Screenshot didn't verify.");
        if (reason === null) return; // cancelled
        window.SB.rejectSubmission(id, reason).then(function (res) {
          if (res && res.error) { EL.toast.error(res.error.message || "Reject failed."); return; }
          EL.toast("Submission rejected.");
          renderReviewLive();
        });
      }
      return;
    }

    var item = EL.store.get().adminSubmissionsQueue.filter(function (x) { return x.id === id; })[0];
    if (!item) return;
    if (approve) {
      EL.store.dispatch({ type: "ADMIN_APPROVE_QUEUE_ITEM", id: id });
      EL.store.dispatch({ type: "ADMIN_LOG", action: "Approved submission from " + item.user + ": " + item.task });
      EL.toast.success("Submission approved");
    } else {
      EL.store.dispatch({ type: "ADMIN_REJECT_QUEUE_ITEM", id: id });
      EL.store.dispatch({ type: "ADMIN_LOG", action: "Rejected submission from " + item.user + ": " + item.task });
      EL.toast.error("Submission rejected");
    }
    renderNav();       // update footer queue badge
    renderSection();
  }

  /* --- Dialog helpers ---------------------------------------------------- */
  function openDialog(el) { el.classList.add("is-open"); el.setAttribute("aria-hidden", "false"); }
  function closeDialog(el) { el.classList.remove("is-open"); el.setAttribute("aria-hidden", "true"); }
  document.addEventListener("click", function (e) {
    var closer = e.target.closest("[data-dialog-close]");
    if (closer) closeDialog(closer.closest(".dialog"));
    if (!e.target.closest(".admin-menu-wrap")) closeMenus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".dialog.is-open").forEach(closeDialog);
    closeMenus();
  });

  /* --- Count-up (supports prefix/suffix/decimals) ----------------------- */
  function animateCounts() {
    document.querySelectorAll("#admin-content [data-count]").forEach(function (el) {
      var target = parseFloat(el.getAttribute("data-count")) || 0;
      var prefix = el.getAttribute("data-prefix") || "";
      var suffix = el.getAttribute("data-suffix") || "";
      var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      var start = null, dur = 1000;
      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = target * eased;
        var text = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString("en-US");
        el.textContent = prefix + text + suffix;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  /* --- Router ----------------------------------------------------------- */
  var RENDERERS = { overview: renderOverview, users: renderUsers, review: renderReview, tasks: renderTasks, campaigns: renderCampaigns, content: renderContent, logs: renderLogs };
  function renderSection() {
    var sec = section();
    var meta = META[sec] || META.overview;
    $("admin-sec-title").textContent = meta.title;
    $("admin-sec-desc").textContent = meta.description;
    (RENDERERS[sec] || renderOverview)();
    wireSection(sec);
    renderIcons();
  }

  function renderAll() {
    renderNav();
    renderSection();
    renderIcons();
  }

  /* --- Header + mobile sheet -------------------------------------------- */
  var admin = EL.store.get().admin;
  $("admin-avatar").textContent = EL.initials(admin.fullName);
  $("admin-name").textContent = admin.fullName;
  // Replace the mock admin identity with the real signed-in admin's profile.
  if (usingLiveAdmin() && window.SB.getProfile) {
    window.SB.getProfile().then(function (res) {
      if (!res || !res.data) return;
      var name = res.data.full_name || res.data.username || "Admin";
      $("admin-name").textContent = name;
      $("admin-avatar").textContent = EL.initials(name);
    });
  }

  $("admin-menu-btn").addEventListener("click", function () { $("admin-sheet").hidden = false; });
  $("admin-sheet-backdrop").addEventListener("click", function () { $("admin-sheet").hidden = true; });
  $("admin-sheet").addEventListener("click", function (e) { if (e.target.closest("a")) $("admin-sheet").hidden = true; });

  // Pull admin-configurable data (reward rules, settings, categories, logs)
  // from the DB into the store, then re-render so those sections show live data.
  function numOr(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function hydrateAdminConfig() {
    Promise.all([
      window.SB.getRewardRules(), window.SB.getSettings(),
      window.SB.getTaskCategories(), window.SB.getAdminLogs(),
    ]).then(function (r) {
      var st = EL.store.get();
      if (r[0] && !r[0].error && r[0].data) st.rewardRules = r[0].data.map(function (x) { return { action: x.action, points: x.points }; });
      if (r[1] && !r[1].error && r[1].data) {
        var m = {}; r[1].data.forEach(function (x) { m[x.key] = x.value; });
        st.platformSettings = Object.assign({}, st.platformSettings, {
          referralReward: numOr(m.referral_reward, st.platformSettings.referralReward),
          xpPerLevel: numOr(m.xp_per_level, st.platformSettings.xpPerLevel),
          adFrequencyMinutes: numOr(m.ad_frequency_minutes, st.platformSettings.adFrequencyMinutes),
          adReward: numOr(m.ad_reward, st.platformSettings.adReward),
        });
      }
      if (r[2] && !r[2].error && r[2].data) st.taskCategories = r[2].data.map(function (x) { return { id: x.id, name: x.name, icon: x.icon, color: x.color }; });
      if (r[3] && !r[3].error && r[3].data) st.adminLogs = r[3].data.map(function (x) {
        return { id: x.id, admin: (x.profiles && x.profiles.full_name) || "Admin", action: x.action, time: x.created_at };
      });
      renderAll();
    });
  }

  window.addEventListener("hashchange", function () { renderNav(); renderSection(); renderIcons(); });

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  renderAll();
  if (usingLiveAdmin()) hydrateAdminConfig();
})();
