/* =============================================================================
   EarnLoop — Account Settings logic (replaces SettingsPage.tsx)
   Profile / Social Accounts / Preferences tabs backed by the store.
   ============================================================================= */
(function () {
  "use strict";

  var seed = window.EARNLOOP_SEED;
  var countries = seed.countries;
  var businessCategories = seed.businessCategories;
  var SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "x", "linkedin"];
  var SOUNDS_KEY = "earnloop:notification-sounds";
  function $(id) { return document.getElementById(id); }

  var u = EL.store.get().currentUser;

  // Local editable copies
  var categories = u.businessCategories.slice();
  var socials = JSON.parse(JSON.stringify(u.socials));

  /* --- Tabs ------------------------------------------------------------- */
  var tabsEl = $("set-tabs");
  tabsEl.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-tab]");
    if (!trigger) return;
    var tab = trigger.getAttribute("data-tab");
    tabsEl.querySelectorAll(".tabs__trigger").forEach(function (t) { t.classList.toggle("is-active", t === trigger); });
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab; });
  });

  /* --- Profile picture -------------------------------------------------- */
  // Staged locally; committed by the dedicated "Save Picture" button (or by the
  // Profile "Save Changes" button, which also carries it).
  var pendingAvatar = u.avatarUrl || null;

  function savedAvatar() { return EL.store.get().currentUser.avatarUrl || null; }

  function renderAvatar() {
    EL.fillAvatar($("set-avatar-fallback"), pendingAvatar);
    $("set-avatar-save").hidden = pendingAvatar === savedAvatar(); // only when changed
    $("set-avatar-remove").hidden = !pendingAvatar;
    renderIcons();
  }

  // Reflect the current picture in the header + profile menu without a reload.
  function syncPageAvatars(url) {
    document.querySelectorAll(".app-header .avatar__fallback, .profile-menu .avatar__fallback")
      .forEach(function (el) { EL.fillAvatar(el, url); });
  }

  // Crop to a centered square and downscale to 256px so the data URL stays small
  // enough to persist in localStorage.
  function fileToAvatarDataUrl(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var size = 256, canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        var min = Math.min(img.width, img.height);
        canvas.getContext("2d").drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        try { cb(canvas.toDataURL("image/jpeg", 0.85)); } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  $("set-avatar-fallback").textContent = EL.initials(u.fullName);
  renderAvatar();
  $("set-avatar-input").addEventListener("change", function () {
    var input = this;
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { EL.toast.error("Please choose an image file (PNG, JPG, WEBP, GIF…)"); input.value = ""; return; }
    fileToAvatarDataUrl(file, function (dataUrl) {
      input.value = "";
      if (!dataUrl) { EL.toast.error("Could not read that image."); return; }
      pendingAvatar = dataUrl;
      renderAvatar();
      EL.toast("Image ready. Click Save Picture to apply");
    });
  });
  $("set-avatar-remove").addEventListener("click", function () {
    pendingAvatar = null;
    renderAvatar();
  });
  $("set-avatar-save").addEventListener("click", function () {
    EL.store.dispatch({ type: "UPDATE_USER", patch: { avatarUrl: pendingAvatar } });
    syncPageAvatars(pendingAvatar);
    renderAvatar();
    if (window.SB && window.SB.configured && window.SB.updateProfile) {
      window.SB.updateProfile({ avatar_url: pendingAvatar }).then(function (res) {
        if (res && res.error) { EL.toast.error("Couldn't save picture: " + res.error.message); return; }
        EL.toast.success(pendingAvatar ? "Profile picture saved" : "Profile picture removed");
      });
    } else {
      EL.toast.success(pendingAvatar ? "Profile picture saved" : "Profile picture removed");
    }
  });

  /* --- Profile tab ------------------------------------------------------ */
  $("set-fullname").value = u.fullName;
  $("set-username").value = u.username;
  $("set-email").value = u.email;
  $("set-bio").value = u.bio || "";
  $("set-country").innerHTML = countries.map(function (c) {
    return '<option value="' + EL.escapeHtml(c) + '"' + (c === u.country ? " selected" : "") + ">" + EL.escapeHtml(c) + "</option>";
  }).join("");

  function renderCats() {
    $("set-cats").innerHTML = businessCategories.map(function (cat) {
      var active = categories.indexOf(cat) !== -1;
      return '<button type="button" class="chip' + (active ? " is-active" : "") + '" data-cat="' + EL.escapeHtml(cat) + '">' +
        (active ? '<i data-lucide="check"></i>' : "") + EL.escapeHtml(cat) + "</button>";
    }).join("");
    renderIcons();
  }
  $("set-cats").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-cat]");
    if (!btn) return;
    var cat = btn.getAttribute("data-cat");
    var i = categories.indexOf(cat);
    if (i === -1) categories.push(cat); else categories.splice(i, 1);
    renderCats();
  });
  renderCats();

  $("set-save-profile").addEventListener("click", function () {
    var fullName = $("set-fullname").value, username = $("set-username").value;
    var country = $("set-country").value;
    EL.store.dispatch({ type: "UPDATE_USER", patch: {
      fullName: fullName, username: username, email: $("set-email").value,
      bio: $("set-bio").value, country: country, businessCategories: categories.slice(),
      avatarUrl: pendingAvatar,
    } });
    // Persist the DB-writable fields (email is auth-managed; bio has no column yet).
    if (window.SB && window.SB.configured && window.SB.updateProfile) {
      window.SB.updateProfile({
        full_name: fullName, username: username, country: country,
        business_categories: categories.slice(), avatar_url: pendingAvatar,
      }).then(function (res) {
        if (res && res.error) { EL.toast.error("Couldn't save: " + res.error.message); return; }
        EL.toast.success("Profile updated");
      });
    } else {
      EL.toast.success("Profile updated");
    }
  });

  /* --- Social Accounts tab ---------------------------------------------- */
  function renderSocials() {
    $("set-socials").innerHTML = SOCIAL_PLATFORMS.map(function (p) {
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
  $("set-socials").addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-toggle]");
    if (!toggle) return;
    var p = toggle.getAttribute("data-toggle");
    socials[p] = { handle: socials[p] ? socials[p].handle : "", connected: !(socials[p] && socials[p].connected) };
    renderSocials();
  });
  $("set-socials").addEventListener("input", function (e) {
    var input = e.target.closest("[data-handle]");
    if (!input) return;
    var p = input.getAttribute("data-handle");
    socials[p].handle = input.value;
  });
  renderSocials();

  $("set-save-socials").addEventListener("click", function () {
    var payload = JSON.parse(JSON.stringify(socials));
    EL.store.dispatch({ type: "UPDATE_USER", patch: { socials: payload } });
    if (window.SB && window.SB.configured && window.SB.saveSocials) {
      window.SB.saveSocials(payload).then(function (res) {
        if (res && res.error) { EL.toast.error("Couldn't save: " + res.error.message); return; }
        EL.toast.success("Social accounts updated");
      });
    } else {
      EL.toast.success("Social accounts updated");
    }
  });

  /* --- Re-sync the form from the real profile once shell.js hydrates it -- */
  // Runs once (before the user has started editing) so fields show live data
  // instead of the mock seed. Socials come from their own table.
  var resynced = false;
  function resyncFromUser() {
    var cu = EL.store.get().currentUser;
    $("set-fullname").value = cu.fullName || "";
    $("set-username").value = cu.username || "";
    $("set-email").value = cu.email || "";
    $("set-bio").value = cu.bio || "";
    $("set-country").innerHTML = countries.map(function (c) {
      return '<option value="' + EL.escapeHtml(c) + '"' + (c === cu.country ? " selected" : "") + ">" + EL.escapeHtml(c) + "</option>";
    }).join("");
    categories = (cu.businessCategories || []).slice();
    renderCats();
    if (!pendingAvatar) { pendingAvatar = cu.avatarUrl || null; }
    $("set-avatar-fallback").textContent = EL.initials(cu.fullName);
    renderAvatar();
  }
  EL.store.subscribe(function () {
    if (resynced) return;
    resynced = true;
    resyncFromUser();
  });
  // Load the real connected socials from their table.
  if (window.SB && window.SB.configured && window.SB.getSocials) {
    window.SB.getSocials().then(function (res) {
      if (!res || res.error || !Array.isArray(res.data)) return;
      var next = {};
      res.data.forEach(function (r) { next[r.platform] = { handle: r.handle || "", connected: !!r.connected }; });
      socials = next;
      renderSocials();
    });
  }

  /* --- Preferences tab -------------------------------------------------- */
  var soundsBtn = $("set-sounds");
  function getSounds() {
    try { var v = localStorage.getItem(SOUNDS_KEY); return v === null ? true : JSON.parse(v); } catch (e) { return true; }
  }
  function setSounds(v) { try { localStorage.setItem(SOUNDS_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  soundsBtn.classList.toggle("is-on", getSounds());
  soundsBtn.addEventListener("click", function () {
    var next = !getSounds();
    setSounds(next);
    soundsBtn.classList.toggle("is-on", next);
  });

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }
})();
