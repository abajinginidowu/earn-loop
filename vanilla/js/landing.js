/* =============================================================================
   Landing page behavior (vanilla — replaces React hooks + Framer Motion)
   Works against plain-CSS classes: .reveal/.is-visible, .faq-item/.is-open, etc.
   ============================================================================= */
(function () {
  "use strict";

  /* --- Referral links ---------------------------------------------------
     Someone may share the landing page itself as /?ref=CODE. Park the code
     (same key js/supabase.js claims from) and carry it onto the auth links so
     it survives even if storage is unavailable. */
  (function captureRef() {
    var code = new URLSearchParams(location.search).get("ref");
    if (!code || !code.trim()) return;
    code = code.trim();
    try { localStorage.setItem("el-referral-code", code); } catch (e) { /* no storage */ }
    document.querySelectorAll('a[href^="auth.html"]').forEach(function (a) {
      var href = a.getAttribute("href");
      if (href.indexOf("ref=") !== -1) return;
      a.setAttribute("href", href + (href.indexOf("?") === -1 ? "?" : "&") + "ref=" + encodeURIComponent(code));
    });
  })();

  /* --- Star ratings ----------------------------------------------------- */
  document.querySelectorAll("[data-stars]").forEach(function (el) {
    var value = parseInt(el.getAttribute("data-stars"), 10) || 0;
    for (var i = 0; i < 5; i++) {
      var star = document.createElement("i");
      star.setAttribute("data-lucide", "star");
      star.className = i < value ? "star--on" : "star--off";
      el.appendChild(star);
    }
  });

  /* --- Render Lucide icons --------------------------------------------- */
  (function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  })();

  /* --- Animated counters ------------------------------------------------ */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count")) || 0;
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    var duration = 1200, start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString("en-US") + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window) {
    var countObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { animateCount(e.target); countObs.unobserve(e.target); } });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { countObs.observe(el); });
  } else {
    counters.forEach(animateCount);
  }

  /* --- Reveal on view (replaces Framer Motion) -------------------------- */
  function reveal(el) {
    var parent = el.closest("[data-stagger]");
    var delay = 0;
    if (parent) {
      var siblings = parent.querySelectorAll(".reveal");
      delay = Array.prototype.indexOf.call(siblings, el) * 80;
    } else if (el.classList.contains("reveal--card")) {
      delay = 150;
    }
    setTimeout(function () { el.classList.add("is-visible"); }, delay);
  }

  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); revObs.unobserve(e.target); } });
    }, { threshold: 0.15 });
    revealEls.forEach(function (el) { revObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* --- FAQ accordion (single open) ------------------------------------- */
  document.querySelectorAll("[data-accordion]").forEach(function (acc) {
    acc.querySelectorAll(".faq-item__trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        var item = trigger.closest(".faq-item");
        var wasOpen = item.classList.contains("is-open");
        acc.querySelectorAll(".faq-item").forEach(function (i) { i.classList.remove("is-open"); });
        if (!wasOpen) item.classList.add("is-open");
      });
    });
  });

  /* --- Mobile menu ------------------------------------------------------ */
  var menuBtn = document.getElementById("mobileMenuBtn");
  var menu = document.getElementById("mobileMenu");
  var backdrop = document.getElementById("mobileMenuBackdrop");
  function openMenu() { if (menu) menu.removeAttribute("hidden"); }
  function closeMenu() { if (menu) menu.setAttribute("hidden", ""); }
  if (menuBtn) menuBtn.addEventListener("click", openMenu);
  if (backdrop) backdrop.addEventListener("click", closeMenu);
  document.querySelectorAll("[data-close-menu]").forEach(function (a) { a.addEventListener("click", closeMenu); });
})();
