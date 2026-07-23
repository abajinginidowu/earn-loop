/* =============================================================================
   EarnLoop — Onboarding logic (replaces OnboardingPage.tsx)
   3-step profile completion: Country → Business Categories → Social Accounts.
   ============================================================================= */
(function () {
  "use strict";

  // Guard: onboarding is only for signed-in users. No session → auth.html.
  if (window.SB && window.SB.configured) {
    window.SB.requireAuth().then(function (session) {
      // First page a new account sees with a session — attribute the referral
      // that brought them here (a no-op when there's no stored ?ref= code).
      if (session) window.SB.claimStoredReferral();
    });
  }

  var seed = window.EARNLOOP_SEED;
  var countries = seed.countries;
  var businessCategories = seed.businessCategories;
  var SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "x", "linkedin"];
  var STEPS = ["Country", "Business Categories", "Social Accounts"];
  function $(id) { return document.getElementById(id); }

  // Onboarding is the "complete your profile" flow for a brand-new user, so it
  // always starts blank — never pre-fill from the seed/demo user (which would
  // wrongly pre-select that demo account's country/categories/socials).
  var step = 0;
  var country = "";
  var categories = [];
  var socials = {};

  /* --- Step 0: country -------------------------------------------------- */
  $("ob-country").innerHTML = '<option value="" disabled' + (country ? "" : " selected") + ">Select your country</option>" +
    countries.map(function (c) {
      return '<option value="' + EL.escapeHtml(c) + '"' + (c === country ? " selected" : "") + ">" + EL.escapeHtml(c) + "</option>";
    }).join("");
  $("ob-country").addEventListener("change", function () { country = $("ob-country").value; updateFooter(); });

  /* --- Step 1: categories ----------------------------------------------- */
  function renderCats() {
    $("ob-cats").innerHTML = businessCategories.map(function (cat) {
      var active = categories.indexOf(cat) !== -1;
      return '<button type="button" class="chip' + (active ? " is-active" : "") + '" data-cat="' + EL.escapeHtml(cat) + '">' +
        (active ? '<i data-lucide="check"></i>' : "") + EL.escapeHtml(cat) + "</button>";
    }).join("");
    renderIcons();
  }
  $("ob-cats").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-cat]");
    if (!btn) return;
    var cat = btn.getAttribute("data-cat");
    var i = categories.indexOf(cat);
    if (i === -1) categories.push(cat); else categories.splice(i, 1);
    renderCats();
    updateFooter();
  });

  /* --- Step 2: socials -------------------------------------------------- */
  function renderSocials() {
    $("ob-socials").innerHTML = SOCIAL_PLATFORMS.map(function (p) {
      var acc = socials[p] || { handle: "", connected: false };
      var name = p === "x" ? "X (Twitter)" : p;
      return (
        '<div class="social-row">' +
        '<span class="social-row__ic">' + EL.platformIcon(p, "") + "</span>" +
        '<div class="social-row__body"><div class="social-row__name">' + name + "</div>" +
        (acc.connected ? '<input class="input social-row__handle" data-handle="' + p + '" value="' + EL.escapeHtml(acc.handle) + '" placeholder="@yourhandle" />' : "") +
        "</div>" +
        '<button type="button" class="switch' + (acc.connected ? " is-on" : "") + '" role="switch" data-toggle="' + p + '"><span class="switch__thumb"></span></button>' +
        "</div>"
      );
    }).join("");
    renderIcons();
  }
  $("ob-socials").addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-toggle]");
    if (!toggle) return;
    var p = toggle.getAttribute("data-toggle");
    socials[p] = { handle: socials[p] ? socials[p].handle : "", connected: !(socials[p] && socials[p].connected) };
    renderSocials();
  });
  $("ob-socials").addEventListener("input", function (e) {
    var input = e.target.closest("[data-handle]");
    if (input) socials[input.getAttribute("data-handle")].handle = input.value;
  });

  /* --- Step navigation -------------------------------------------------- */
  function canContinue() { return step === 0 ? Boolean(country) : step === 1 ? categories.length > 0 : true; }

  function showStep() {
    document.querySelectorAll("[data-step]").forEach(function (el) {
      el.hidden = Number(el.getAttribute("data-step")) !== step;
    });
    // re-trigger fade animation
    var active = document.querySelector('[data-step="' + step + '"]');
    if (active) { active.style.animation = "none"; void active.offsetWidth; active.style.animation = ""; }
    if (step === 1) renderCats();
    if (step === 2) renderSocials();
    updateFooter();
  }

  function updateFooter() {
    $("ob-step-count").textContent = "Step " + (step + 1) + " of " + STEPS.length;
    $("ob-step-name").textContent = STEPS[step];
    $("ob-progress-bar").style.width = (((step + 1) / STEPS.length) * 100) + "%";
    $("ob-back").disabled = step === 0;
    var isLast = step === STEPS.length - 1;
    $("ob-continue").hidden = isLast;
    $("ob-finish").hidden = !isLast;
    $("ob-continue").disabled = !canContinue();
  }

  $("ob-back").addEventListener("click", function () { if (step > 0) { step -= 1; showStep(); } });
  $("ob-continue").addEventListener("click", function () { if (canContinue() && step < STEPS.length - 1) { step += 1; showStep(); } });
  $("ob-finish").addEventListener("click", function () {
    var btn = this;
    // Keep the local store in sync so the current session's UI is instant.
    EL.store.dispatch({ type: "UPDATE_USER", patch: { country: country, businessCategories: categories.slice(), socials: JSON.parse(JSON.stringify(socials)) } });
    function done() { window.location.href = "dashboard.html"; }
    if (window.SB && window.SB.configured) {
      btn.disabled = true;
      // 1) Persist the profile + social accounts to the database (RLS: own row).
      // 2) Stamp user_metadata.onboarded so the OAuth callback router / login
      //    routing skips onboarding next time (it reads the JWT, not the DB).
      window.SB.saveOnboarding({
        country: country,
        business_categories: categories.slice(),
        socials: socials,
      }).then(function (res) {
        if (res && res.error) console.error("[onboarding] save failed:", res.error);
        return window.SB.markOnboarded();
      }).then(done).catch(function (err) { console.error("[onboarding]", err); done(); });
    } else {
      done();
    }
  });

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  showStep();
})();
