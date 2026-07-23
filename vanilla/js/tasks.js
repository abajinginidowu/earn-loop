/* =============================================================================
   EarnLoop — Tasks page logic (replaces TasksPage.tsx)
   Renders the task grid, filter bar, and the two-step submit dialog.
   ============================================================================= */
(function () {
  "use strict";

  var seed = window.EARNLOOP_SEED;
  var platforms = seed.platforms;
  var categories = seed.taskCategories;
  function $(id) { return document.getElementById(id); }

  var searchEl = $("tasks-search");
  var platformEl = $("tasks-platform");
  var categoryEl = $("tasks-category");
  var gridEl = $("tasks-grid");
  var emptyEl = $("tasks-empty");
  var dialogEl = $("task-dialog");
  var panelEl = $("task-dialog-panel");

  var platformById = {};
  platforms.forEach(function (p) { platformById[p.id] = p; });

  // Task catalog. Starts from the mock seed for instant paint / local dev, then
  // is replaced by the live `tasks` table once Supabase is ready.
  var TASKS = EL.store.get().tasks;

  (function loadLiveTasks(tries) {
    if (window.SB && window.SB.configured && window.SB.getTasks) {
      window.SB.getTasks().then(function (res) {
        if (res && !res.error && Array.isArray(res.data)) { TASKS = res.data; renderGrid(); }
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLiveTasks((tries || 0) + 1); }, 200);
  })(0);

  /* --- Populate filter selects ------------------------------------------ */
  platformEl.innerHTML = '<option value="all">All Platforms</option>' +
    platforms.map(function (p) { return '<option value="' + p.id + '">' + EL.escapeHtml(p.name) + "</option>"; }).join("");
  categoryEl.innerHTML = '<option value="all">All Categories</option>' +
    categories.map(function (c) { return '<option value="' + c.id + '">' + EL.escapeHtml(c.name) + "</option>"; }).join("");

  /* --- Render the filtered grid ----------------------------------------- */
  function renderGrid() {
    var tasks = TASKS;
    var search = searchEl.value.trim().toLowerCase();
    var platformFilter = platformEl.value;
    var categoryFilter = categoryEl.value;

    var filtered = tasks.filter(function (t) {
      if (platformFilter !== "all" && t.platform !== platformFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (search && (t.title + " " + t.brand).toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    if (filtered.length === 0) {
      gridEl.innerHTML = "";
      gridEl.hidden = true;
      emptyEl.hidden = false;
      renderIcons();
      return;
    }
    emptyEl.hidden = true;
    gridEl.hidden = false;

    gridEl.innerHTML = filtered.map(function (t) {
      var meta = platformById[t.platform];
      var color = meta ? meta.color : "var(--foreground)";
      var plural = t.points > 1 ? "s" : "";
      return (
        '<div class="card card--pad task-card">' +
        '<div class="task-card__head">' +
        '<span class="task-card__ic" style="color:' + color + '">' + EL.platformIcon(t.platform, "") + "</span>" +
        '<div class="task-card__meta">' +
        '<div class="task-card__brand">' + EL.escapeHtml(t.brand) + "</div>" +
        '<div class="task-card__action">' + EL.escapeHtml(t.action) + "</div></div>" +
        '<span class="badge badge--default">+' + t.points + " pt" + plural + "</span></div>" +
        '<p class="task-card__title">' + EL.escapeHtml(t.title) + "</p>" +
        '<div class="task-card__foot">' +
        '<span class="task-card__date"><i data-lucide="calendar"></i> ' + EL.formatDate(t.deadline) + "</span>" +
        "<span>" + EL.escapeHtml(t.country) + "</span></div>" +
        '<button type="button" class="btn btn--primary btn--full task-card__cta" data-task="' + t.id + '">Start Task</button>' +
        "</div>"
      );
    }).join("");
    renderIcons();
  }

  /* --- Task target (copyable link / url / username) --------------------- */
  function isLink(v) { return /^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+/.test(v); }
  function targetKind(v) { return /^@/.test(v) ? "username" : isLink(v) ? "link" : "value"; }

  function targetBlockHtml(t) {
    if (!t.target) return "";
    var kind = targetKind(t.target);
    var label = kind === "username" ? "Username" : kind === "link" ? "Link" : "Target";
    var openBtn = kind === "link"
      ? '<a class="btn btn--outline btn--sm" href="' + EL.escapeHtml(t.target) + '" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i> Open</a>'
      : "";
    return (
      '<div class="task-target">' +
      '<div class="task-target__label">' + label + " to " + EL.escapeHtml(t.action.toLowerCase()) + "</div>" +
      '<div class="task-target__row">' +
      '<code class="task-target__value" title="' + EL.escapeHtml(t.target) + '">' + EL.escapeHtml(t.target) + "</code>" +
      '<button type="button" class="btn btn--primary btn--sm task-target__copy" id="task-copy"><i data-lucide="copy"></i> Copy</button>' +
      openBtn +
      "</div></div>"
    );
  }

  function bindTargetBlock(t) {
    var btn = $("task-copy");
    if (btn) btn.addEventListener("click", function () { EL.copy(t.target, targetKind(t.target) === "username" ? "Username" : "Link"); });
  }

  /* --- Submit dialog ----------------------------------------------------- */
  var activeTask = null;
  var fileName = "";
  var file = null;

  function openTask(task) {
    activeTask = task;
    fileName = "";
    file = null;
    renderDialog("details");
    dialogEl.classList.add("is-open");
    dialogEl.setAttribute("aria-hidden", "false");
  }

  function closeDialog() {
    dialogEl.classList.remove("is-open");
    dialogEl.setAttribute("aria-hidden", "true");
    activeTask = null;
  }

  function renderDialog(step) {
    if (!activeTask) return;
    var t = activeTask;
    var meta = platformById[t.platform];
    var platformName = meta ? meta.name : t.platform;

    if (step === "details") {
      panelEl.innerHTML =
        '<button type="button" class="dialog__close" data-dialog-close><i data-lucide="x"></i></button>' +
        '<div class="dialog__header">' +
        '<h2 class="dialog__title">' + EL.escapeHtml(t.title) + "</h2>" +
        '<p class="dialog__desc">' + EL.escapeHtml(t.brand) + " · " + EL.escapeHtml(t.action) + " · +" + t.points + " points</p></div>" +
        targetBlockHtml(t) +
        '<div class="task-note"><i data-lucide="shield-check"></i> Complete the action on ' + EL.escapeHtml(platformName) +
        ", then upload a screenshot. We verify the timestamp, username, and platform automatically before awarding points.</div>" +
        '<div class="dialog__footer">' +
        '<button type="button" class="btn btn--secondary" data-dialog-close>Cancel</button>' +
        '<button type="button" class="btn btn--primary" id="task-next">I\'ve Completed This</button></div>';
      bindTargetBlock(t);
      $("task-next").addEventListener("click", function () { renderDialog("upload"); });
    } else {
      panelEl.innerHTML =
        '<button type="button" class="dialog__close" data-dialog-close><i data-lucide="x"></i></button>' +
        '<div class="dialog__header">' +
        '<h2 class="dialog__title">Upload Proof</h2>' +
        '<p class="dialog__desc">Attach a screenshot showing the completed action.</p></div>' +
        '<label class="task-upload">' +
        '<i data-lucide="upload"></i>' +
        '<span class="task-upload__name" id="task-file-name">' + (fileName || "Click to select a screenshot") + "</span>" +
        '<span class="task-upload__hint">PNG or JPG, up to 10MB</span>' +
        '<input type="file" accept="image/*" id="task-file" /></label>' +
        '<div class="dialog__footer">' +
        '<button type="button" class="btn btn--secondary" id="task-back">Back</button>' +
        '<button type="button" class="btn btn--primary" id="task-submit"' + (fileName ? "" : " disabled") + ">Submit for Review</button></div>";
      $("task-file").addEventListener("change", function (e) {
        file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        fileName = file ? file.name : "";
        $("task-file-name").textContent = fileName || "Click to select a screenshot";
        $("task-submit").disabled = !fileName;
      });
      $("task-back").addEventListener("click", function () { renderDialog("details"); });
      $("task-submit").addEventListener("click", submitProof);
    }
    renderIcons();
  }

  function submitProof() {
    if (!activeTask) return;
    var task = activeTask;

    // Live path: upload the screenshot + insert a pending submission (RLS-scoped
    // to this user). Points are awarded later by an admin approving it.
    if (window.SB && window.SB.configured && window.SB.submitTask) {
      var btn = $("task-submit");
      if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }
      window.SB.submitTask({ taskId: task.id, file: file }).then(function (res) {
        if (res && res.error) {
          if (btn) { btn.disabled = false; btn.textContent = "Submit for Review"; }
          EL.toast.error(res.error.message || "Couldn't submit. Please try again.");
          return;
        }
        EL.toast.success("Submitted for review. We'll validate your screenshot shortly.");
        closeDialog();
      });
      return;
    }

    // Fallback (auth not wired): keep the old mock behaviour.
    EL.store.dispatch({
      type: "SUBMIT_TASK",
      submission: {
        id: EL.uid("sub"), taskId: task.id, taskTitle: task.title,
        platform: task.platform, points: task.points, status: "pending",
        submittedAt: new Date().toISOString(), reviewedAt: null, screenshot: "",
      },
    });
    EL.toast.success("Submitted for review. We'll validate your screenshot shortly.");
    closeDialog();
  }

  /* --- Events ------------------------------------------------------------ */
  searchEl.addEventListener("input", renderGrid);
  platformEl.addEventListener("change", renderGrid);
  categoryEl.addEventListener("change", renderGrid);

  gridEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-task]");
    if (!btn) return;
    var task = TASKS.filter(function (t) { return t.id === btn.getAttribute("data-task"); })[0];
    if (task) openTask(task);
  });

  dialogEl.addEventListener("click", function (e) {
    if (e.target.closest("[data-dialog-close]")) closeDialog();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && dialogEl.classList.contains("is-open")) closeDialog();
  });

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  renderGrid();
})();
