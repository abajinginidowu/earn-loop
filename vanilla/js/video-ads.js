/* =============================================================================
   EarnLoop — Video Ads logic (replaces VideoAdsPage.tsx)
   Post a video ad (flexible cash budget or fixed points package) + history table.
   ============================================================================= */
(function () {
  "use strict";

  var seed = window.EARNLOOP_SEED;
  var countries = seed.countries;
  var businessCategories = seed.businessCategories;
  function $(id) { return document.getElementById(id); }

  /* --- Constants (ported from lib/pricing.ts) --------------------------- */
  var VIDEO_AD_IMPRESSIONS = 5000;
  var VIDEO_AD_CPM_CASH = 1;      // $1 per 1,000 views
  var VIDEO_AD_MIN_CASH = 1;
  var VIDEO_AD_POINTS_COST = 150;
  function viewsForCashAmount(a) { return Math.max(0, Math.round((a / VIDEO_AD_CPM_CASH) * 1000)); }

  /* --- Form state ------------------------------------------------------- */
  var brand = "";
  var linkUrl = "";
  var videoFile = null;          // { name }
  var previewUrl = "";
  var category = businessCategories[0];
  var country = "Global";
  var method = "cash";
  var cashAmount = "5";

  var user = function () { return EL.store.get().currentUser; };

  function linkValid() {
    var v = linkUrl.trim();
    if (!v) return true;               // optional
    try { var u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; }
    catch (e) { return false; }
  }

  function cashAmountNum() { return Number(cashAmount) || 0; }
  function cashViews() { return viewsForCashAmount(cashAmountNum()); }
  function cashMeetsMinimum() { return cashAmountNum() >= VIDEO_AD_MIN_CASH; }
  function canAffordCash() { return user().cashBalance >= cashAmountNum(); }
  function canAffordPoints() { return user().points >= VIDEO_AD_POINTS_COST; }
  function canSubmit() {
    if (!(brand.trim() && videoFile)) return false;
    if (!linkValid()) return false;
    return method === "cash" ? (cashMeetsMinimum() && canAffordCash()) : canAffordPoints();
  }

  /* --- Static content --------------------------------------------------- */
  function fillInfoBanner() {
    var ps = EL.store.get().platformSettings;
    $("va-info-text").innerHTML =
      "Pay cash from as little as <strong>" + EL.formatCurrency(VIDEO_AD_MIN_CASH) + "</strong>. $" + VIDEO_AD_CPM_CASH +
      " buys 1,000 views, and the view count updates as you type. Or use the fixed points package: " +
      "<strong>" + VIDEO_AD_POINTS_COST + " points</strong> for <strong>" + EL.formatNumber(VIDEO_AD_IMPRESSIONS) + " views</strong>. " +
      "Every ad is removed automatically once it reaches its view cap. Live ads are shown every " +
      "<strong>" + ps.adFrequencyMinutes + " minutes</strong> while users complete tasks — viewers can skip after 30 to 60 seconds and earn " +
      "<strong>" + ps.adReward + " points</strong> per watch.";
  }

  function fillSelects() {
    $("va-category").innerHTML = businessCategories.map(function (c) {
      return '<option value="' + EL.escapeHtml(c) + '"' + (c === category ? " selected" : "") + ">" + EL.escapeHtml(c) + "</option>";
    }).join("");
    $("va-country").innerHTML = '<option value="Global">Global</option>' + countries.map(function (c) {
      return '<option value="' + EL.escapeHtml(c) + '"' + (c === country ? " selected" : "") + ">" + EL.escapeHtml(c) + "</option>";
    }).join("");
  }

  /* --- Pay method + detail ---------------------------------------------- */
  function renderPay() {
    $("va-pay-grid").innerHTML =
      payOption("cash", "credit-card", "Cash", "Balance: " + EL.formatCurrency(user().cashBalance), "From " + EL.formatCurrency(VIDEO_AD_MIN_CASH), false) +
      payOption("points", "coins", "Points", "Balance: " + EL.formatNumber(user().points) + " pts", EL.formatNumber(VIDEO_AD_POINTS_COST) + " pts", !canAffordPoints());
    $("va-pay-grid").querySelectorAll("[data-method]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        method = btn.getAttribute("data-method");
        renderPay();
        renderDetail();
        updateSubmit();
      });
    });
    renderIcons();
  }

  function payOption(id, icon, title, sub, amt, disabled) {
    var active = method === id ? " is-active" : "";
    return (
      '<button type="button" class="pick pay-option' + active + '" data-method="' + id + '"' + (disabled ? " disabled" : "") + ">" +
      '<span class="pay-option__ic"><i data-lucide="' + icon + '"></i></span>' +
      '<div class="pay-option__body"><div class="pay-option__title">' + title + '</div><div class="pay-option__sub">' + sub + "</div></div>" +
      '<span class="pay-option__amt">' + amt + "</span>" +
      (method === id ? '<span class="pay-option__check"><i data-lucide="check"></i></span>' : "") +
      "</button>"
    );
  }

  function renderDetail() {
    var host = $("va-detail");
    if (method === "cash") {
      host.innerHTML =
        '<div class="va-detail">' +
        '<label class="field__label" for="va-cash">Budget (USD)</label>' +
        '<div class="va-budget-row">' +
        '<input id="va-cash" class="input" type="number" min="' + VIDEO_AD_MIN_CASH + '" step="1" value="' + EL.escapeHtml(cashAmount) + '" />' +
        '<span class="va-budget-eq">= <strong id="va-views">' + EL.formatNumber(cashViews()) + "</strong> views</span></div>" +
        '<p class="va-detail__note">Minimum ' + EL.formatCurrency(VIDEO_AD_MIN_CASH) + " · " + EL.formatCurrency(VIDEO_AD_CPM_CASH) + " per 1,000 views</p>" +
        '<div id="va-cash-warn"></div></div>';
      $("va-cash").addEventListener("input", function () {
        cashAmount = $("va-cash").value;
        $("va-views").textContent = EL.formatNumber(cashViews());
        updateCashWarn();
        updateSubmit();
      });
      updateCashWarn();
    } else {
      host.innerHTML =
        '<div class="va-detail va-detail--package">Fixed package: <strong>' + EL.formatNumber(VIDEO_AD_IMPRESSIONS) +
        " views</strong> for <strong>" + VIDEO_AD_POINTS_COST + " points</strong>.</div>";
    }
  }

  function updateCashWarn() {
    var el = $("va-cash-warn");
    if (!el) return;
    if (!cashMeetsMinimum()) el.innerHTML = '<p class="va-detail__warn">Minimum spend is ' + EL.formatCurrency(VIDEO_AD_MIN_CASH) + ".</p>";
    else if (!canAffordCash()) el.innerHTML = '<p class="va-detail__warn">Not enough cash balance for this amount.</p>';
    else el.innerHTML = "";
  }

  function updateSubmit() { $("va-submit").disabled = !canSubmit(); }

  /* --- History table ---------------------------------------------------- */
  var STATUS = {
    active: { label: "Active", cls: "badge--info" },
    pending: { label: "Pending", cls: "badge--warning" },
    completed: { label: "Completed", cls: "badge--success" },
    rejected: { label: "Rejected", cls: "badge--destructive" },
  };

  // Live rows (video_ads) use snake_case; the mock seed uses camelCase.
  var liveAds = null;   // null until the first successful fetch
  function normalizeAd(a) {
    return {
      brand: a.brand || "",
      videoUrl: a.video_url || a.videoUrl || "",
      linkUrl: a.link_url || a.linkUrl || "",
      status: a.status,
      paymentMethod: a.payment_method || a.paymentMethod,
      cost: Number(a.cost) || 0,
      impressionsTotal: a.impressions_total != null ? a.impressions_total : a.impressionsTotal,
      impressionsRemaining: a.impressions_remaining != null ? a.impressions_remaining : a.impressionsRemaining,
      submittedAt: a.created_at || a.submittedAt,
    };
  }

  // Uploaded files are stored as <uid>/<timestamp>_<rand>.<ext>; show just the
  // readable tail so the table doesn't carry a full storage URL.
  function fileLabel(url) {
    if (!url) return "video";
    var last = String(url).split("/").pop() || "video";
    try { last = decodeURIComponent(last); } catch (e) { /* leave as-is */ }
    return last;
  }

  // Pull the user's real ads; falls back to the mock list until it lands.
  // The shell loads js/supabase.js on demand, so wait for window.SB to appear.
  function loadHistory(tries) {
    if (window.SB && window.SB.configured && window.SB.getMyVideoAds) {
      window.SB.getMyVideoAds().then(function (res) {
        if (!res || res.error) return;
        liveAds = (res.data || []).map(normalizeAd);
        renderHistory();
      }, function () { /* offline — keep showing what we have */ });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadHistory((tries || 0) + 1); }, 200);
  }

  function renderHistory() {
    var ads = liveAds || EL.store.get().videoAds.map(normalizeAd);
    var host = $("va-history-body");
    if (ads.length === 0) {
      host.innerHTML =
        '<div class="empty-state"><span class="empty-state__ic"><i data-lucide="film"></i></span>' +
        '<p class="empty-state__title">No video ads yet</p>' +
        '<p class="empty-state__desc">Submit a video ad above to promote your product to other users.</p></div>';
      renderIcons();
      return;
    }
    var rows = ads.map(function (ad) {
      var viewed = ad.impressionsTotal - ad.impressionsRemaining;
      var pct = ad.impressionsTotal > 0 ? Math.round((viewed / ad.impressionsTotal) * 100) : 0;
      var st = STATUS[ad.status] || STATUS.active;
      var cost = ad.paymentMethod === "cash" ? EL.formatCurrency(ad.cost) : EL.formatNumber(ad.cost) + " pts";
      return (
        "<tr>" +
        '<td><div class="va-ad"><span class="va-ad__ic"><i data-lucide="film"></i></span>' +
        '<div class="va-ad__body"><div class="va-ad__brand">' + EL.escapeHtml(ad.brand) + "</div>" +
        '<div class="va-ad__file">' + EL.escapeHtml(fileLabel(ad.videoUrl)) + "</div>" +
        (ad.linkUrl ? '<a class="va-ad__link" href="' + EL.escapeHtml(ad.linkUrl) + '" target="_blank" rel="noopener noreferrer"><i data-lucide="link"></i>' + EL.escapeHtml(ad.linkUrl) + "</a>" : "") +
        "</div></div></td>" +
        '<td class="va-views"><div class="va-views__row"><div class="progress"><div class="progress__bar" style="width:' + pct + '%"></div></div>' +
        '<span class="va-views__count">' + EL.formatNumber(viewed) + "/" + EL.formatNumber(ad.impressionsTotal) + "</span></div></td>" +
        '<td class="va-cost">' + cost + "</td>" +
        '<td class="va-submitted">' + EL.formatDate(ad.submittedAt) + "</td>" +
        '<td><span class="badge ' + st.cls + '">' + st.label + "</span></td>" +
        "</tr>"
      );
    }).join("");
    host.innerHTML =
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      "<th>Ad</th><th>Views</th><th>Cost</th><th>Submitted</th><th>Status</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    renderIcons();
  }

  /* --- Submit -----------------------------------------------------------
     Live path: upload the video to the ad-videos bucket, then let the server
     charge the advertiser and publish the ad (create_video_ad re-derives the
     view count from the price, so the numbers below are display-only). */
  function submit() {
    if (!canSubmit() || !videoFile) return;
    var cost = method === "cash" ? cashAmountNum() : VIDEO_AD_POINTS_COST;
    var impressionsTotal = method === "cash" ? cashViews() : VIDEO_AD_IMPRESSIONS;
    var label = "Video ad: " + brand.trim();

    if (window.SB && window.SB.configured && window.SB.createVideoAd) {
      setBusy(true);
      var payload = { brand: brand.trim(), linkUrl: linkUrl.trim(), category: category, country: country, method: method, cashAmount: cashAmountNum() };
      window.SB.uploadAdVideo(videoFile, function (fraction) {
        setBusy(true, Math.round(fraction * 100));
      }).then(function (up) {
        if (up.error) throw up.error;
        setBusy(true);                       // uploaded — now waiting on the server
        payload.videoUrl = up.data.url;
        return window.SB.createVideoAd(payload);
      }).then(function (res) {
        if (res.error) throw res.error;
        var ad = Array.isArray(res.data) ? res.data[0] : res.data;
        var views = ad && ad.impressions_total != null ? ad.impressions_total : impressionsTotal;
        EL.toast.success("Video ad is now live. It will be shown to " + EL.formatNumber(views) + " people");
        resetForm();
        setBusy(false);
        renderPay(); renderDetail(); updateSubmit();
        loadHistory();
        // The balance just changed server-side — pull the real numbers back down.
        if (EL.refreshUser) EL.refreshUser().then(function () { renderPay(); renderDetail(); updateSubmit(); });
      }).catch(function (err) {
        setBusy(false);
        EL.toast.error(window.SB.errorMessage(err) || "Could not publish the ad.");
      });
      return;
    }

    // Mock fallback (no Supabase configured).
    if (method === "cash") {
      EL.store.dispatch({ type: "SPEND_CASH", cash: cost });
      EL.store.dispatch({ type: "ADD_WALLET_TXN", txn: { id: EL.uid("txn"), type: "spend", label: label, points: 0, cash: -cost, date: new Date().toISOString() } });
    } else {
      EL.store.dispatch({ type: "SPEND_POINTS", points: cost });
      EL.store.dispatch({ type: "ADD_WALLET_TXN", txn: { id: EL.uid("txn"), type: "spend", label: label, points: -cost, cash: 0, date: new Date().toISOString() } });
    }
    EL.store.dispatch({
      type: "SUBMIT_VIDEO_AD",
      ad: {
        id: EL.uid("vad"), brand: brand.trim(), videoUrl: videoFile.name, linkUrl: linkUrl.trim(), category: category, country: country,
        status: "active", submittedAt: new Date().toISOString(), paymentMethod: method, cost: cost,
        impressionsTotal: impressionsTotal, impressionsRemaining: impressionsTotal,
      },
    });
    EL.toast.success("Video ad is now live. It will be shown to " + EL.formatNumber(impressionsTotal) + " people");
    resetForm();
    renderPay(); renderDetail(); updateSubmit(); renderHistory();
  }

  // Uploading a video takes a while on a phone connection, so show the real
  // percentage while the bytes go out rather than an indefinite spinner.
  function setBusy(busy, percent) {
    var btn = $("va-submit");
    btn.disabled = busy || !canSubmit();
    btn.innerHTML = busy
      ? '<i data-lucide="loader"></i> ' + (percent != null && percent < 100 ? "Uploading " + percent + "%" : "Publishing…")
      : '<i data-lucide="video"></i> Submit Video Ad';
    renderIcons();
  }

  function resetForm() {
    brand = ""; $("va-brand").value = "";
    linkUrl = ""; $("va-link").value = ""; $("va-link-warn").innerHTML = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    videoFile = null; previewUrl = ""; $("va-preview-wrap").innerHTML = "";
    $("va-file-name").textContent = "No video selected"; $("va-file").value = "";
    cashAmount = "5";
  }

  /* --- Bind static inputs ----------------------------------------------- */
  $("va-brand").addEventListener("input", function () { brand = $("va-brand").value; updateSubmit(); });
  $("va-link").addEventListener("input", function () {
    linkUrl = $("va-link").value;
    $("va-link-warn").innerHTML = linkValid() ? "" : '<p class="va-detail__warn">Enter a valid http(s) link, or leave it blank.</p>';
    updateSubmit();
  });
  $("va-choose").addEventListener("click", function () { $("va-file").click(); });
  $("va-file").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    videoFile = file;
    previewUrl = URL.createObjectURL(file);
    $("va-file-name").textContent = file.name;
    $("va-preview-wrap").innerHTML = '<video src="' + previewUrl + '" controls muted class="va-preview"></video>';
    updateSubmit();
  });
  $("va-category").addEventListener("change", function () { category = $("va-category").value; });
  $("va-country").addEventListener("change", function () { country = $("va-country").value; });
  $("va-submit").addEventListener("click", submit);

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  /* --- Init -------------------------------------------------------------
     The shell hydrates the real profile + platform settings after this file
     runs, so re-render the balance-driven bits whenever the store changes. */
  fillInfoBanner();
  fillSelects();
  renderPay();
  renderDetail();
  updateSubmit();
  renderHistory();
  loadHistory(0);

  var lastSnapshot = "";
  EL.store.subscribe(function () {
    var st = EL.store.get();
    var snapshot = [st.currentUser.points, st.currentUser.cashBalance,
                    st.platformSettings.adReward, st.platformSettings.adFrequencyMinutes].join("|");
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;
    fillInfoBanner();
    renderPay();
    updateCashWarn();
    updateSubmit();
  });
})();
