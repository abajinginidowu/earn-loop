/* =============================================================================
   EarnLoop — Auth page logic (Supabase-backed)
   -----------------------------------------------------------------------------
   • Log in / Register tabs with validation
   • Email + password sign-up → 6-digit email code (Supabase OTP, type "signup")
   • Google (Gmail) OAuth — one-click redirect, no code
   Requires js/supabase.js (window.SB) loaded first.
   ============================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var USERNAME_RE = /^[a-z0-9_.]+$/i;
  var SB = window.SB;

  // The email a signup code was sent to (used by verify + resend).
  var pendingEmail = "";

  // Already signed in? Skip the auth page.
  if (SB) SB.redirectIfAuthed("dashboard.html");

  // A shared referral link lands here as ?ref=CODE. Park it now; it's claimed
  // once the new account has a session (onboarding / auth-callback).
  if (SB) SB.captureReferralCode();

  function blockedText(status) {
    return status === "banned"
      ? "This account has been banned. Contact support if you think that's a mistake."
      : "This account is suspended. Contact support to have it reviewed.";
  }

  /* --- Tab switching (login / register) --------------------------------- */
  // An invited visitor (?ref=) is here to sign up, so open on that tab.
  var params = new URLSearchParams(location.search);
  var mode = params.get("mode") === "register" || params.get("ref") ? "register" : "login";
  var tabsEl = $("auth-tabs");
  function setMode(m) {
    mode = m;
    tabsEl.querySelectorAll(".tabs__trigger").forEach(function (t) { t.classList.toggle("is-active", t.getAttribute("data-tab") === m); });
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== m; });
  }
  tabsEl.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-tab]");
    if (trigger) setMode(trigger.getAttribute("data-tab"));
  });
  setMode(mode);

  // Bounced off an app page because the account was suspended/banned mid-session.
  var blocked = params.get("blocked");
  if (blocked === "suspended" || blocked === "banned") {
    setMode("login");
    showErr("login-general", blockedText(blocked));
  }

  /* --- Error helpers ---------------------------------------------------- */
  function showErr(key, msg) {
    var el = document.querySelector('[data-err="' + key + '"]');
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; } else { el.hidden = true; }
  }
  function clearErrs(keys) { keys.forEach(function (k) { showErr(k, ""); }); }
  function showGeneral(msg) { showErr(mode === "register" ? "reg-general" : "login-general", msg); }

  // Pull a human-readable reason out of any Supabase/network error, and always
  // log the raw object so the real cause is inspectable in the console.
  function errText(error) {
    console.error("[auth] error:", error);
    if (!error) return "Something went wrong. Please try again.";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    if (error.status) return "Request failed (HTTP " + error.status + ").";
    try { var s = JSON.stringify(error); if (s && s !== "{}") return s; } catch (e) {}
    return "Something went wrong — check the browser console for details.";
  }

  // Button loading state (preserves the original inner HTML).
  function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) {
      if (btn.dataset.label == null) btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = text || "Please wait…";
    } else {
      btn.disabled = false;
      if (btn.dataset.label != null) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
    }
  }

  function notConfigured() {
    if (SB && SB.configured) return false;
    showGeneral("Auth isn't connected yet. Add your Supabase URL and anon key in js/supabase.js.");
    return true;
  }

  /* --- Log in ----------------------------------------------------------- */
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("login-email").value.trim();
    var pw = $("login-password").value;
    clearErrs(["login-email", "login-password", "login-general"]);
    var ok = true;
    if (!EMAIL_RE.test(email)) { showErr("login-email", "Enter a valid email address"); ok = false; }
    if (pw.length < 8) { showErr("login-password", "Password must be at least 8 characters"); ok = false; }
    if (!ok || notConfigured()) return;

    var btn = this.querySelector('button[type="submit"]');
    setBusy(btn, true, "Logging in…");
    SB.signIn(email, pw).then(function (res) {
      if (res.error) { setBusy(btn, false); showErr("login-general", errText(res.error)); return; }
      // Supabase can't refuse the token, so a suspended/banned account is signed
      // back out here (and refused by the database for anything that matters).
      SB.accountStatus().then(function (status) {
        if (status === "suspended" || status === "banned") {
          SB.signOut().then(function () {
            setBusy(btn, false);
            showErr("login-general", blockedText(status));
          });
          return;
        }
        // First-timers who never finished the profile steps go to onboarding.
        SB.onboardTarget().then(function (page) { window.location.href = page; });
      });
    }).catch(function (err) { setBusy(btn, false); showErr("login-general", errText(err)); });
  });

  /* --- Register (email + password) -------------------------------------- */
  $("register-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("reg-name").value.trim();
    var username = $("reg-username").value.trim();
    var email = $("reg-email").value.trim();
    var pw = $("reg-password").value;
    var confirm = $("reg-confirm").value;
    var terms = $("reg-terms").checked;
    clearErrs(["reg-name", "reg-username", "reg-email", "reg-password", "reg-terms", "reg-general"]);
    var ok = true;
    if (name.length < 2) { showErr("reg-name", "Enter your full name"); ok = false; }
    if (username.length < 3) { showErr("reg-username", "Username must be at least 3 characters"); ok = false; }
    else if (!USERNAME_RE.test(username)) { showErr("reg-username", "Letters, numbers, dots and underscores only"); ok = false; }
    if (!EMAIL_RE.test(email)) { showErr("reg-email", "Enter a valid email address"); ok = false; }
    if (pw.length < 8) { showErr("reg-password", "Password must be at least 8 characters"); ok = false; }
    else if (pw !== confirm) { showErr("reg-password", "Passwords do not match"); ok = false; }
    if (!terms) { showErr("reg-terms", "You must accept the terms"); ok = false; }
    if (!ok || notConfigured()) return;

    var btn = this.querySelector('button[type="submit"]');
    setBusy(btn, true, "Creating account…");
    SB.signUp(email, pw, { full_name: name, username: username }).then(function (res) {
      setBusy(btn, false);
      if (res.error) { showErr("reg-general", errText(res.error)); return; }
      pendingEmail = email;
      // When "Confirm email" is OFF in Supabase, signUp returns an active session
      // (the user is already verified) — skip the 6-digit step and go straight to
      // onboarding. When it's re-enabled later, session is null → show the OTP step.
      var session = res.data && res.data.session;
      if (session) { window.location.href = "onboarding.html"; return; }
      goToVerify(email);
    }).catch(function (err) { setBusy(btn, false); showErr("reg-general", errText(err)); });
  });

  /* --- Google (Gmail) OAuth --------------------------------------------- */
  var googleBtn = $("google-btn");
  if (googleBtn) {
    googleBtn.addEventListener("click", function () {
      if (notConfigured()) return;
      setBusy(googleBtn, true, "Redirecting…");
      SB.signInWithGoogle().then(function (res) {
        // On success the browser redirects to Google; we only land here on error.
        if (res && res.error) { setBusy(googleBtn, false); showGeneral(res.error.message); }
      });
    });
  }

  /* --- OTP inputs ------------------------------------------------------- */
  var otpInputs = [];
  for (var i = 0; i < 6; i++) otpInputs.push($("otp-" + i));
  function otpComplete() { return otpInputs.every(function (el) { return el.value.length === 1; }); }
  function otpValue() { return otpInputs.map(function (el) { return el.value; }).join(""); }
  otpInputs.forEach(function (el, idx) {
    el.addEventListener("input", function () {
      if (!/^[0-9]?$/.test(el.value)) { el.value = el.value.replace(/[^0-9]/g, "").slice(0, 1); }
      if (el.value && idx < 5) otpInputs[idx + 1].focus();
      $("otp-verify").disabled = !otpComplete();
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !el.value && idx > 0) otpInputs[idx - 1].focus();
    });
  });

  /* --- Show / reset the email-verification (OTP) step ------------------- */
  function goToVerify(sentTo) {
    $("otp-email").textContent = sentTo || "your email";
    otpInputs.forEach(function (el) { el.value = ""; });
    $("otp-verify").disabled = true;
    showErr("otp", "");
    var note = $("otp-resend-note");
    if (note) note.hidden = true;
    $("auth-form-step").hidden = true;
    $("auth-otp-step").hidden = false;
    if (otpInputs[0]) otpInputs[0].focus();
  }

  $("otp-back").addEventListener("click", function () {
    $("auth-otp-step").hidden = true;
    $("auth-form-step").hidden = false;
  });

  /* --- Verify the 6-digit code ------------------------------------------ */
  $("otp-verify").addEventListener("click", function () {
    if (!otpComplete()) return;
    showErr("otp", "");
    if (!SB || !SB.configured) { showErr("otp", "Auth isn't connected yet (see js/supabase.js)."); return; }
    var btn = this;
    setBusy(btn, true, "Verifying…");
    SB.verifySignupCode(pendingEmail, otpValue()).then(function (res) {
      if (res.error) {
        setBusy(btn, false);
        $("otp-verify").disabled = !otpComplete();
        showErr("otp", errText(res.error));
        return;
      }
      window.location.href = "onboarding.html";
    });
  });

  /* --- Resend code ------------------------------------------------------ */
  var resendBtn = $("otp-resend");
  if (resendBtn) {
    resendBtn.addEventListener("click", function () {
      otpInputs.forEach(function (el) { el.value = ""; });
      $("otp-verify").disabled = true;
      showErr("otp", "");
      if (otpInputs[0]) otpInputs[0].focus();
      if (!SB || !SB.configured) { showErr("otp", "Auth isn't connected yet (see js/supabase.js)."); return; }
      SB.resendSignupCode(pendingEmail).then(function (res) {
        var note = $("otp-resend-note");
        if (res && res.error) { showErr("otp", res.error.message); return; }
        if (note) { note.hidden = false; setTimeout(function () { note.hidden = true; }, 3000); }
      });
    });
  }

  /* --- Right-panel count-ups (if any) ----------------------------------- */
  document.querySelectorAll("[data-count]").forEach(function (el) {
    var target = parseFloat(el.getAttribute("data-count")) || 0, start = null, dur = 1000;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  (function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  })();
})();
