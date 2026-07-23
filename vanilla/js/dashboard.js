/* =============================================================================
   EarnLoop — Dashboard data binding (replaces DashboardPage.tsx logic)
   Fills placeholders in dashboard.html from the store, using plain-CSS classes.
   ============================================================================= */
(function () {
  "use strict";

  var TODAY = "2026-07-07";
  var s = EL.store.get();
  var seed = window.EARNLOOP_SEED;
  var u = s.currentUser;
  function $(id) { return document.getElementById(id); }

  /* --- Derived values --------------------------------------------------- */
  var tasksToday = s.taskSubmissions.filter(function (x) { return x.submittedAt.indexOf(TODAY) === 0; }).length;
  var recentEarnings = s.walletTransactions.filter(function (t) { return t.type === "earn"; }).slice(0, 5)
    .reduce(function (sum, t) { return sum + t.points; }, 0);
  var leaderboardEntry = seed.leaderboard.filter(function (l) { return l.isCurrentUser; })[0];
  var activeCampaigns = s.campaigns.filter(function (c) { return c.status === "active"; });
  /* --- Profile card ----------------------------------------------------- */
  // Rendered as a function + store subscription so it swaps from the mock seed
  // to the real profile the moment shell.js hydrates it (and stays correct on
  // later loads, since the store persists).
  function renderProfileCard() {
    var cu = s.currentUser;
    var xpPct = cu.xpToNext ? Math.round((cu.xp / cu.xpToNext) * 100) : 0;
    $("dash-greeting").textContent = "Welcome back, " + (cu.fullName || "there").split(" ")[0];
    $("dash-name").textContent = cu.fullName || "";
    $("dash-level").textContent = "Level " + cu.level;
    $("dash-xp-pct").textContent = xpPct + "%";
    $("dash-points").textContent = EL.formatNumber(cu.points);
    $("dash-cash").textContent = "$" + Number(cu.cashBalance || 0).toFixed(2);
    $("dash-xp-bar").style.width = xpPct + "%";
    $("dash-avatar").textContent = EL.initials(cu.fullName);
    EL.fillAvatar($("dash-avatar"), cu.avatarUrl);
  }
  renderProfileCard();
  EL.store.subscribe(renderProfileCard);

  /* --- Stat counters ---------------------------------------------------- */
  $("stat-earnings").setAttribute("data-count", recentEarnings);
  $("stat-tasks").setAttribute("data-count", tasksToday);
  $("stat-streak").setAttribute("data-count", u.streak);
  $("stat-rank").setAttribute("data-count", leaderboardEntry ? leaderboardEntry.rank : 0);

  // Update a stat tile's value and re-run its count-up animation.
  function setStat(id, val) {
    var el = $(id);
    if (!el) return;
    el.setAttribute("data-count", val);
    animateCount(el);
  }

  // Daily streak comes from the (hydrated) profile — update when it lands.
  EL.store.subscribe(function () { setStat("stat-streak", EL.store.get().currentUser.streak || 0); });

  // Live metrics: earnings (sum of 'earn' transactions) + tasks submitted today.
  (function loadLiveMetrics(tries) {
    if (window.SB && window.SB.configured) {
      if (window.SB.getTransactions) window.SB.getTransactions().then(function (res) {
        if (!res || res.error || !Array.isArray(res.data)) return;
        var earned = res.data.reduce(function (sum, t) { return sum + (t.type === "earn" ? (t.points || 0) : 0); }, 0);
        setStat("stat-earnings", earned);
        var m = monthlyEarnings(res.data);
        renderChart(m.values, m.labels); // Performance Overview → your monthly points
      });
      if (window.SB.getMySubmissions) window.SB.getMySubmissions().then(function (res) {
        if (!res || res.error || !Array.isArray(res.data)) return;
        var today = new Date().toISOString().slice(0, 10);
        var count = res.data.filter(function (x) { return String(x.created_at || "").slice(0, 10) === today; }).length;
        setStat("stat-tasks", count);
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLiveMetrics((tries || 0) + 1); }, 200);
  })(0);

  /* --- Mini bar chart (your monthly points earned) ---------------------- */
  function renderChart(values, labels) {
    var max = Math.max.apply(null, values.concat([1]));
    $("dash-chart").innerHTML = values.map(function (v, i) {
      return (
        '<div class="dash-chart__col">' +
        '<div class="dash-chart__bar" style="height:0%" data-bar="' + Math.round((v / max) * 100) + '"></div>' +
        '<span class="dash-chart__label">' + labels[i] + "</span></div>"
      );
    }).join("");
    setTimeout(function () {
      $("dash-chart").querySelectorAll("[data-bar]").forEach(function (bar, i) {
        setTimeout(function () { bar.style.height = bar.getAttribute("data-bar") + "%"; }, i * 50);
      });
    }, 60);
  }
  renderChart(seed.revenueSeries.slice(-6), seed.monthLabels.slice(-6));

  // Build the last-6-months earned-points series from the user's transactions.
  function monthlyEarnings(txns) {
    var now = new Date(), buckets = [], labels = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: d.getFullYear() + "-" + (d.getMonth() + 1), val: 0 });
      labels.push(d.toLocaleString("en-US", { month: "short" }));
    }
    txns.forEach(function (t) {
      if (t.type !== "earn") return;
      var d = new Date(t.created_at), key = d.getFullYear() + "-" + (d.getMonth() + 1);
      for (var j = 0; j < buckets.length; j++) { if (buckets[j].key === key) { buckets[j].val += (t.points || 0); break; } }
    });
    return { values: buckets.map(function (b) { return b.val; }), labels: labels };
  }

  /* --- Active campaigns (live when Supabase is ready) ------------------- */
  var campEl = $("dash-campaigns");
  function renderCampaigns(list) {
    if (!list || list.length === 0) {
      campEl.innerHTML = '<p class="dash-card-sub">You don\'t have any active campaigns yet.</p>';
      return;
    }
    campEl.innerHTML = list.slice(0, 3).map(function (c) {
      var pct = c.target ? Math.round((c.progress / c.target) * 100) : 0;
      return (
        '<div class="dash-camp">' +
        '<span class="dash-camp__ic">' + EL.platformIcon(c.platform, "") + "</span>" +
        '<div class="dash-camp__body">' +
        '<div class="dash-camp__row"><span class="dash-camp__title">' + EL.escapeHtml(c.title) + '</span><span class="dash-camp__pct">' + pct + "%</span></div>" +
        '<div class="progress" style="margin-top:0.25rem"><div class="progress__bar" style="width:' + pct + '%"></div></div>' +
        "</div></div>"
      );
    }).join("");
  }
  renderCampaigns(activeCampaigns);
  (function loadLiveCampaigns(tries) {
    if (window.SB && window.SB.configured && window.SB.getCampaigns) {
      window.SB.getCampaigns().then(function (res) {
        if (res && !res.error && Array.isArray(res.data)) {
          renderCampaigns(res.data.filter(function (c) { return c.status === "active"; }));
        }
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLiveCampaigns((tries || 0) + 1); }, 200);
  })(0);

  /* --- Leaderboard (live from the leaderboard view) --------------------- */
  function renderLeaderboard(list) {
    var meId = (EL.store.get().currentUser || {}).id;
    $("dash-leaderboard").innerHTML = list.map(function (e) {
      var name = e.name || e.full_name || e.username || "User";
      var isMe = e.isCurrentUser || (meId && e.id === meId);
      return (
        '<div class="dash-lb__row' + (isMe ? " is-me" : "") + '">' +
        '<span class="dash-lb__rank">' + e.rank + "</span>" +
        '<span class="avatar avatar--sm"><span class="avatar__fallback">' + EL.initials(name) + "</span></span>" +
        '<span class="dash-lb__name">' + EL.escapeHtml(name) + "</span>" +
        '<span class="dash-lb__pts">' + EL.formatNumber(e.points) + "</span></div>"
      );
    }).join("");
  }
  renderLeaderboard(seed.leaderboard);
  (function loadLiveLeaderboard(tries) {
    if (window.SB && window.SB.configured && window.SB.getLeaderboard) {
      window.SB.getLeaderboard(10).then(function (res) {
        if (!res || res.error || !Array.isArray(res.data)) return;
        renderLeaderboard(res.data);
        // Update the "Leaderboard Rank" stat with the user's real rank.
        var meId = (EL.store.get().currentUser || {}).id;
        var mine = res.data.filter(function (e) { return meId && e.id === meId; })[0];
        if (mine) $("stat-rank").textContent = EL.formatNumber(mine.rank);
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLiveLeaderboard((tries || 0) + 1); }, 200);
  })(0);

  /* --- Weekly challenge ------------------------------------------------- */
  var weekly = seed.challenges.filter(function (c) { return c.type === "weekly"; });
  $("dash-challenge").innerHTML = weekly.map(function (c) {
    var pct = (c.progress / c.target) * 100;
    return (
      '<div class="dash-chal">' +
      '<div class="dash-chal__row"><span class="dash-chal__title">' + EL.escapeHtml(c.title) + '</span><span class="dash-chal__count">' + c.progress + "/" + c.target + "</span></div>" +
      '<div class="progress" style="margin-top:0.5rem"><div class="progress__bar" style="width:' + pct + '%"></div></div>' +
      '<p class="dash-chal__note">+' + c.reward + " pts reward · ends in " + c.endsIn + "</p></div>"
    );
  }).join("");

  /* --- Notifications preview -------------------------------------------- */
  var STATUS = {
    success: { label: "Success", cls: "badge--success" },
    info: { label: "Info", cls: "badge--info" },
    warning: { label: "Warning", cls: "badge--warning" },
    danger: { label: "Danger", cls: "badge--destructive" },
  };
  function renderNotifications(list) {
    $("dash-notifications").innerHTML = list.slice(0, 4).map(function (n) {
      var st = STATUS[n.type] || STATUS.info;
      return (
        '<div class="dash-notif">' +
        '<span class="dash-notif__dot' + (n.unread ? " is-unread" : "") + '"></span>' +
        '<div class="dash-notif__body">' +
        '<div class="dash-notif__head"><span class="dash-notif__title">' + EL.escapeHtml(n.title) + '</span><span class="badge ' + st.cls + '">' + st.label + "</span></div>" +
        '<p class="dash-notif__msg">' + EL.escapeHtml(n.message) + "</p>" +
        '<p class="dash-notif__time">' + EL.timeAgo(n.time || n.created_at) + "</p></div></div>"
      );
    }).join("");
  }
  renderNotifications(s.notifications);
  (function loadLiveNotifications(tries) {
    if (window.SB && window.SB.configured && window.SB.getNotifications) {
      window.SB.getNotifications().then(function (res) {
        if (res && !res.error && Array.isArray(res.data)) renderNotifications(res.data);
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLiveNotifications((tries || 0) + 1); }, 200);
  })(0);

  /* --- Count-up animation ----------------------------------------------- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count")) || 0;
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    var duration = 1000, start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString("en-US") + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  document.querySelectorAll("[data-count]").forEach(animateCount);

  /* --- Featured video (admin-uploaded) ----------------------------------
     Shows the newest active featured_videos row. The markup in the HTML is the
     empty state, so nothing here runs when the admin hasn't published one. */
  (function loadFeatured(tries) {
    if (window.SB && window.SB.configured && window.SB.getActiveFeaturedVideo) {
      window.SB.getActiveFeaturedVideo().then(function (res) {
        if (!res || res.error || !res.data || !res.data.length) return;
        renderFeatured(res.data[0]);
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadFeatured((tries || 0) + 1); }, 200);
  })(0);

  function renderFeatured(v) {
    var host = document.getElementById("dash-featured");
    if (!host) return;
    host.innerHTML =
      '<div class="dash-featured__video">' +
      '<span class="badge badge--default ad-modal__badge">Featured</span>' +
      '<video class="dash-featured__player" src="' + EL.escapeHtml(v.video_url) + '" controls playsinline preload="metadata"></video>' +
      "</div>" +
      '<div class="dash-featured__body">' +
      '<h3 class="dash-featured__title">' + EL.escapeHtml(v.title || "") + "</h3>" +
      (v.description ? '<p class="dash-featured__desc">' + EL.escapeHtml(v.description) + "</p>" : "") +
      "</div>";
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  (function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  })();
})();
