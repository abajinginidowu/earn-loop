/* =============================================================================
   EarnLoop — Notifications page logic (replaces NotificationsPage.tsx)
   Read/unread notification center with per-item and mark-all-read actions.
   ============================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  // icon names map 1:1 to lucide, with a bell fallback
  var ICONS = { "check-circle": 1, "trending-up": 1, "alert-triangle": 1, "user-plus": 1, award: 1, flag: 1 };
  var STATUS = {
    success: { label: "Success", cls: "badge--success" },
    info: { label: "Info", cls: "badge--info" },
    warning: { label: "Warning", cls: "badge--warning" },
    danger: { label: "Danger", cls: "badge--destructive" },
  };

  function usingLive() { return !!(window.SB && window.SB.configured); }

  // Notifications. Mock seed for instant paint / local dev, then replaced by the
  // user's real rows once Supabase is ready.
  var NOTIFS = EL.store.get().notifications;

  (function loadLive(tries) {
    if (usingLive() && window.SB.getNotifications) {
      window.SB.getNotifications().then(function (res) {
        if (res && !res.error && Array.isArray(res.data)) {
          NOTIFS = res.data.map(function (n) {
            return { id: n.id, type: n.type, title: n.title, message: n.message, icon: n.icon, unread: n.unread, time: n.created_at };
          });
          render();
        }
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLive((tries || 0) + 1); }, 200);
  })(0);

  function render() {
    var notifications = NOTIFS;
    var unreadCount = notifications.filter(function (n) { return n.unread; }).length;

    // Header action
    $("notif-actions").innerHTML = unreadCount > 0
      ? '<button type="button" id="notif-mark-all" class="btn btn--secondary"><i data-lucide="check-check"></i> Mark All Read</button>'
      : "";
    var markAll = $("notif-mark-all");
    if (markAll) markAll.addEventListener("click", function () {
      if (usingLive()) {
        window.SB.markAllNotificationsRead().then(function () {
          NOTIFS.forEach(function (n) { n.unread = false; });
          render();
        });
      } else {
        EL.store.dispatch({ type: "MARK_ALL_NOTIFICATIONS_READ" });
        NOTIFS = EL.store.get().notifications; render();
      }
    });

    // List
    var list = $("notif-list");
    if (notifications.length === 0) {
      list.innerHTML =
        '<div class="empty-state"><span class="empty-state__ic"><i data-lucide="bell-off"></i></span>' +
        '<p class="empty-state__title">No notifications</p>' +
        '<p class="empty-state__desc">You\'re all caught up.</p></div>';
      renderIcons();
      return;
    }

    var items = notifications.map(function (n) {
      var icon = ICONS[n.icon] ? n.icon : "bell";
      var st = STATUS[n.type] || STATUS.info;
      return (
        '<button type="button" class="notif-item' + (n.unread ? " is-unread" : "") + '" data-notif="' + n.id + '">' +
        '<span class="notif-item__ic"><i data-lucide="' + icon + '"></i></span>' +
        '<div class="notif-item__body"><div class="notif-item__head">' +
        '<span class="notif-item__title">' + EL.escapeHtml(n.title) + "</span>" +
        '<span class="badge ' + st.cls + '">' + st.label + "</span>" +
        (n.unread ? '<span class="notif-item__dot"></span>' : "") + "</div>" +
        '<p class="notif-item__msg">' + EL.escapeHtml(n.message) + "</p>" +
        '<p class="notif-item__time">' + EL.timeAgo(n.time) + "</p></div></button>"
      );
    }).join("");
    list.innerHTML = '<div class="card card--flush notif-card">' + items + "</div>";

    list.querySelectorAll("[data-notif]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-notif");
        var n = NOTIFS.filter(function (x) { return x.id === id; })[0];
        if (!n || !n.unread) return;
        if (usingLive()) {
          window.SB.markNotificationRead(id).then(function () { n.unread = false; render(); });
        } else {
          EL.store.dispatch({ type: "MARK_NOTIFICATION_READ", id: id });
          NOTIFS = EL.store.get().notifications; render();
        }
      });
    });
    renderIcons();
  }

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  render();
})();
