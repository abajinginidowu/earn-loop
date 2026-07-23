/* =============================================================================
   EarnLoop — My Tasks page logic (replaces MyTasksPage.tsx)
   Renders the status tabs + submissions table, with resubmit for rejected items.
   ============================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  var tabsEl = $("mtasks-tabs");
  var wrapEl = $("mtasks-table-wrap");
  var emptyEl = $("mtasks-empty");

  var filter = "all";

  var STATUS = {
    approved: { label: "Approved", cls: "badge--success" },
    pending: { label: "Pending", cls: "badge--warning" },
    rejected: { label: "Rejected", cls: "badge--destructive" },
  };

  // Submissions. Mock seed for instant paint / local dev, then replaced by the
  // user's real task_submissions once Supabase is ready.
  var subs = EL.store.get().taskSubmissions;

  // Map a live task_submissions row (with embedded task) → the render shape.
  function mapLive(r) {
    var t = r.tasks || {};
    return {
      id: r.id,
      taskId: r.task_id,
      taskTitle: t.title || "Task",
      platform: t.platform || "",
      points: r.status === "approved" ? (r.points_awarded || t.points || 0) : (t.points || 0),
      status: r.status,
      submittedAt: r.created_at,
      reviewedAt: r.reviewed_at,
      reason: r.reject_reason || "",
    };
  }

  (function loadLive(tries) {
    if (window.SB && window.SB.configured && window.SB.getMySubmissions) {
      window.SB.getMySubmissions().then(function (res) {
        if (res && !res.error && Array.isArray(res.data)) { subs = res.data.map(mapLive); render(); }
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLive((tries || 0) + 1); }, 200);
  })(0);

  function render() {
    var filtered = filter === "all" ? subs : subs.filter(function (s) { return s.status === filter; });

    if (filtered.length === 0) {
      wrapEl.innerHTML = "";
      emptyEl.hidden = false;
      renderIcons();
      return;
    }
    emptyEl.hidden = true;

    var rows = filtered.map(function (sub) {
      var st = STATUS[sub.status] || STATUS.pending;
      var reason = sub.status === "rejected" && sub.reason
        ? '<div class="mtasks-task__reason"><i data-lucide="alert-triangle"></i> ' + EL.escapeHtml(sub.reason) + "</div>"
        : "";
      var action = sub.status === "rejected"
        ? '<button type="button" class="btn btn--secondary btn--sm" data-resubmit="' + sub.id + '"><i data-lucide="rotate-ccw"></i> Resubmit</button>'
        : "";
      return (
        "<tr>" +
        '<td><div class="mtasks-task">' +
        '<span class="mtasks-task__ic">' + EL.platformIcon(sub.platform, "") + "</span>" +
        '<div class="mtasks-task__body">' +
        '<div class="mtasks-task__title">' + EL.escapeHtml(sub.taskTitle) + "</div>" + reason +
        "</div></div></td>" +
        '<td class="mtasks-points">+' + sub.points + "</td>" +
        '<td class="mtasks-submitted">' + EL.timeAgo(sub.submittedAt) + "</td>" +
        '<td><span class="badge ' + st.cls + '">' + st.label + "</span></td>" +
        '<td class="is-right">' + action + "</td>" +
        "</tr>"
      );
    }).join("");

    wrapEl.innerHTML =
      '<div class="card card--flush"><div class="table-wrap"><table class="table">' +
      "<thead><tr>" +
      "<th>Task</th><th>Points</th><th>Submitted</th><th>Status</th><th class=\"is-right\">Action</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
    renderIcons();
  }

  function resubmit(sub) {
    // Live: a real resubmit needs a fresh screenshot, so send the user back to
    // the Tasks page to redo the task (the rejected row stays for their record).
    if (window.SB && window.SB.configured) {
      window.location.href = "tasks.html";
      return;
    }
    EL.store.dispatch({
      type: "SUBMIT_TASK",
      submission: {
        id: EL.uid("sub"),
        taskId: sub.taskId,
        taskTitle: sub.taskTitle,
        platform: sub.platform,
        points: sub.points,
        status: "pending",
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
        screenshot: "",
      },
    });
    EL.toast.success("Resubmitted for review");
    render();
  }

  /* --- Events ------------------------------------------------------------ */
  tabsEl.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-tab]");
    if (!trigger) return;
    filter = trigger.getAttribute("data-tab");
    tabsEl.querySelectorAll(".tabs__trigger").forEach(function (t) {
      t.classList.toggle("is-active", t === trigger);
    });
    render();
  });

  wrapEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-resubmit]");
    if (!btn) return;
    var sub = subs.filter(function (s) { return s.id === btn.getAttribute("data-resubmit"); })[0];
    if (sub) resubmit(sub);
  });

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  render();
})();
