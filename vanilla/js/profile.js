/* =============================================================================
   EarnLoop — Profile page logic (replaces ProfilePage.tsx)
   Read-only display of the current user's identity, stats, and achievements.
   ============================================================================= */
(function () {
  "use strict";

  var seed = window.EARNLOOP_SEED;
  var achievements = seed.achievements;
  function $(id) { return document.getElementById(id); }

  // achievement icon names map 1:1 to lucide, with a trophy fallback
  var ACH_ICONS = { footprints: 1, flame: 1, users: 1, megaphone: 1, trophy: 1, gem: 1 };

  /* --- Identity + stats (re-renders when shell.js hydrates the profile) --- */
  function render() {
    var u = EL.store.get().currentUser;
    var xpPct = u.xpToNext ? Math.round((u.xp / u.xpToNext) * 100) : 0;

    $("prof-avatar").textContent = EL.initials(u.fullName);
    EL.fillAvatar($("prof-avatar"), u.avatarUrl);
    $("prof-name").textContent = u.fullName || "";
    $("prof-level").textContent = "Level " + u.level;
    $("prof-handle").textContent = "@" + (u.username || "");
    var flag = u.countryFlag ? u.countryFlag + " " : "";
    var joined = u.joined ? " · Joined " + EL.formatDate(u.joined) : "";
    $("prof-meta").textContent = (u.country ? flag + u.country : "") + joined;

    $("prof-xp").textContent = EL.formatNumber(u.xp) + " XP";
    $("prof-xp-next").textContent = EL.formatNumber(u.xpToNext) + " XP";
    $("prof-xp-note").textContent = xpPct + "% to Level " + (u.level + 1);
    $("prof-xp-bar").style.width = xpPct + "%";

    if (u.bio) { $("prof-bio").textContent = u.bio; $("prof-bio").hidden = false; }

    $("prof-cats").innerHTML = (u.businessCategories || []).map(function (cat) {
      return '<span class="badge badge--secondary">' + EL.escapeHtml(cat) + "</span>";
    }).join("");

    $("prof-points").textContent = EL.formatNumber(u.points);
    $("prof-cash").textContent = EL.formatCurrency(u.cashBalance);
    $("prof-streak").textContent = u.streak;
    $("prof-badges").textContent = (u.badges || []).length;
  }
  render();
  EL.store.subscribe(render);

  /* --- Achievements ----------------------------------------------------- */
  $("prof-ach-grid").innerHTML = achievements.map(function (a) {
    var icon = ACH_ICONS[a.icon] ? a.icon : "trophy";
    var pct = a.target ? Math.round(((a.progress || 0) / a.target) * 100) : 100;
    var prog = (!a.unlocked && a.target)
      ? '<div class="prof-ach__prog"><div class="progress"><div class="progress__bar" style="width:' + pct + '%"></div></div>' +
        '<div class="prof-ach__prog-note">' + EL.formatNumber(a.progress || 0) + "/" + EL.formatNumber(a.target) + "</div></div>"
      : "";
    return (
      '<div class="prof-ach__item' + (a.unlocked ? " is-unlocked" : "") + '">' +
      '<span class="prof-ach__ic"><i data-lucide="' + icon + '"></i></span>' +
      '<div class="prof-ach__body"><div class="prof-ach__name">' + EL.escapeHtml(a.name) + "</div>" +
      '<p class="prof-ach__desc">' + EL.escapeHtml(a.desc) + "</p>" + prog + "</div></div>"
    );
  }).join("");

  (function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  })();
})();
