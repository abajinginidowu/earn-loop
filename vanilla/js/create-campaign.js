/* =============================================================================
   EarnLoop — Create Campaign logic (replaces CreateCampaignPage.tsx + lib/pricing.ts)
   A 5-step wizard (Platform → Describe → Targeting → Pricing → Review & Launch) with
   a live pricing engine. Cost is derived from the seed pricingEngine; points ≈ cash×416.67.
   ============================================================================= */
(function () {
  "use strict";

  var seed = window.EARNLOOP_SEED;
  var pricingEngine = seed.pricingEngine;
  var countries = seed.countries;
  var businessCategories = seed.businessCategories;
  var user = EL.store.get().currentUser;
  function $(id) { return document.getElementById(id); }

  var POINTS_PER_DOLLAR = 416.67;
  var STEPS = ["Platform", "Describe", "Targeting", "Pricing", "Review & Launch"];
  var CAMPAIGN_PLATFORMS = [
    { id: "instagram", label: "Instagram", color: "#E1306C" },
    { id: "tiktok", label: "TikTok", color: "#000000" },
    { id: "facebook", label: "Facebook", color: "#1877F2" },
    { id: "youtube", label: "YouTube", color: "#FF0000" },
    { id: "x", label: "X (Twitter)", color: "#0F1419" },
    { id: "linkedin", label: "LinkedIn", color: "#0A66C2" },
    { id: "pinterest", label: "Pinterest", color: "#E60023" },
    { id: "website", label: "Website", color: "#2563EB" },
    // New platforms — icons to be supplied later (placeholder icon shown for now).
    { id: "reddit", label: "Reddit", color: "#FF4500" },
    { id: "discord", label: "Discord", color: "#5865F2" },
    { id: "telegram", label: "Telegram", color: "#229ED9" },
    { id: "apple", label: "Apple App Store", color: "#000000" },
    { id: "playstore", label: "Play Store", color: "#01875F" },
    { id: "spotify", label: "Spotify", color: "#1DB954", noIcon: true },
    { id: "audiomack", label: "Audiomack", color: "#FFA200" },
    { id: "whatsapp", label: "WhatsApp", color: "#25D366" },
    { id: "threads", label: "Threads", color: "#000000", noIcon: true },
    { id: "applemusic", label: "Apple Music", color: "#FA243C", noIcon: true },
  ];

  /* --- Pricing helpers (ported from lib/pricing.ts) --------------------- */
  function pricingFor(id) { return pricingEngine[id]; }
  function hasTiers(plan) { return plan && "tiers" in plan; }
  function hasPerUnit(plan) { return plan && "perUnit" in plan; }
  function hasPricePerStream(plan) { return plan && "pricePerStream" in plan; }

  // Price for any custom quantity on a tiered plan — linearly interpolated between
  // the defined tiers (and extrapolated by unit rate outside the range) so a custom
  // amount lines up with the preset packages. Tiers are assumed sorted ascending.
  function tierPriceFor(plan, qty) {
    var tiers = plan.tiers;
    if (qty <= tiers[0].qty) return qty * (tiers[0].price / tiers[0].qty);
    for (var i = 0; i < tiers.length - 1; i++) {
      var a = tiers[i], b = tiers[i + 1];
      if (qty <= b.qty) return a.price + ((qty - a.qty) / (b.qty - a.qty)) * (b.price - a.price);
    }
    var last = tiers[tiers.length - 1];
    return qty * (last.price / last.qty);
  }

  function computeCost(sel) {
    var plan = sel.taskType;
    if (!plan) return null;
    if (hasTiers(plan)) return sel.quantity && sel.quantity >= 1 ? tierPriceFor(plan, sel.quantity) : null;
    if (hasPerUnit(plan)) {
      if (!sel.durationOption || !sel.quantity || sel.quantity < 1) return null;
      return sel.durationOption.price * sel.quantity;
    }
    if (hasPricePerStream(plan)) {
      if (!sel.quantity || sel.quantity < plan.minimum) return null;
      return sel.quantity * plan.pricePerStream;
    }
    return null;
  }
  function pointsCostFor(cash) { return Math.ceil(cash * POINTS_PER_DOLLAR); }
  function quantityLabel(sel) {
    var plan = sel.taskType;
    if (!plan) return "";
    if (hasTiers(plan) && sel.quantity) return sel.quantity.toLocaleString("en-US") + " " + plan.unit;
    if (hasPerUnit(plan) && sel.durationOption && sel.quantity) {
      return sel.quantity.toLocaleString("en-US") + " " + plan.unit + " (" + sel.durationOption.label + ")";
    }
    if (hasPricePerStream(plan) && sel.quantity) return sel.quantity.toLocaleString("en-US") + " " + plan.unit;
    return "";
  }

  function platIcon(id, color) {
    var meta = CAMPAIGN_PLATFORMS.filter(function (x) { return x.id === id; })[0];
    var inner = meta && meta.noIcon ? '<i data-lucide="square-dashed"></i>'
      : EL.platformIcon(id, "");
    return '<span class="cc-platform__ic" style="color:' + color + '">' + inner + "</span>";
  }

  /* --- Wizard state ----------------------------------------------------- */
  var step = 0;
  var sel = { platformId: null, taskType: null, tier: null, durationOption: null, quantity: null };
  var country = "Global";
  var category = businessCategories[0];
  var method = "cash";
  var details = { description: "", link: "", screenshot: null, screenshotName: "" };

  function truncate(s, n) { s = s || ""; return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // Only App Store / Play Store campaigns take a screenshot upload. Edit this set
  // to change which platforms show the screenshot field on the Describe step.
  var SCREENSHOT_PLATFORMS = { apple: true, playstore: true };
  function supportsScreenshot() { return Boolean(SCREENSHOT_PLATFORMS[sel.platformId]); }

  function platformMeta() { return CAMPAIGN_PLATFORMS.filter(function (p) { return p.id === sel.platformId; })[0]; }
  // The selected platform's wrapper ({ label, taskTypes }); `plan()` is the chosen task type's pricing.
  function platformPlan() { return sel.platformId ? pricingFor(sel.platformId) : undefined; }
  function plan() { return sel.taskType || undefined; }

  function canContinue() {
    var p = plan();
    if (step === 0) return Boolean(sel.platformId);
    if (step === 1) return details.description.trim().length > 0; // Describe
    if (step === 2) return Boolean(country) && Boolean(category);  // Targeting
    if (step === 3) {                                              // Pricing
      if (!p) return false;
      if (hasTiers(p)) return Boolean(sel.quantity && sel.quantity > 0);
      if (hasPerUnit(p)) return Boolean(sel.durationOption) && Boolean(sel.quantity && sel.quantity > 0);
      if (hasPricePerStream(p)) return Boolean(sel.quantity && sel.quantity >= p.minimum);
      return false;
    }
    return true;
  }

  /* --- Step rendering --------------------------------------------------- */
  function stepPlatformHtml() {
    return '<div class="cc-platforms">' + CAMPAIGN_PLATFORMS.map(function (p) {
      var active = sel.platformId === p.id ? " is-active" : "";
      return (
        '<button type="button" class="pick pick--platform' + active + '" data-platform="' + p.id + '">' +
        platIcon(p.id, p.color) +
        '<span class="cc-platform__label">' + EL.escapeHtml(p.label) + "</span></button>"
      );
    }).join("") + "</div>";
  }

  function stepDescribeHtml() {
    // Screenshot upload only applies to app-store campaigns (App Store / Play Store).
    var screenshotField = "";
    if (supportsScreenshot()) {
      var shot = details.screenshot
        ? '<div class="cc-shot"><img src="' + details.screenshot + '" alt="Screenshot preview" class="cc-shot__img" />' +
          '<button type="button" class="btn btn--outline btn--sm" id="cc-shot-remove"><i data-lucide="x"></i> Remove</button></div>'
        : '<label class="cc-shot-drop" for="cc-shot-input"><span class="cc-shot-drop__ic"><i data-lucide="image-plus"></i></span>' +
          '<span class="cc-shot-drop__title">Upload a screenshot</span>' +
          '<span class="cc-shot-drop__desc">PNG or JPG of what you want promoted</span></label>' +
          '<input id="cc-shot-input" class="cc-shot-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/*" />';
      screenshotField = '<div class="field"><label class="field__label">Screenshot</label>' + shot + "</div>";
    }
    var lead = supportsScreenshot()
      ? "Tell us what you want promoted, add a link, and a screenshot."
      : "Tell us what you want promoted and add a link.";
    return (
      '<h3 class="cc-step-title">Describe your campaign</h3>' +
      '<p class="cc-step-desc">' + lead + "</p>" +
      '<div class="field cc-field-mt"><label class="field__label" for="cc-desc">What do you want? <span class="cc-req">*</span></label>' +
      '<textarea id="cc-desc" class="textarea" rows="4" placeholder="e.g. Promote my new single and grow my Spotify followers…">' + EL.escapeHtml(details.description) + "</textarea></div>" +
      '<div class="field"><label class="field__label" for="cc-link">Link</label>' +
      '<input id="cc-link" class="input" type="url" placeholder="https://…" value="' + EL.escapeHtml(details.link) + '" /></div>' +
      screenshotField
    );
  }

  // Chips to choose which task type (Followers / Likes / Comments / Streams / …)
  // to buy on the selected platform. Switching one resets the quantity selection.
  function taskTypesHtml() {
    var wrapper = platformPlan();
    if (!wrapper || !wrapper.taskTypes) return "";
    return (
      '<h3 class="cc-step-title">What do you want?</h3>' +
      '<div class="cc-tasktypes">' + wrapper.taskTypes.map(function (t) {
        var active = sel.taskType && sel.taskType.id === t.id ? " is-active" : "";
        return '<button type="button" class="chip cc-tasktype' + active + '" data-tasktype="' + t.id + '">' + EL.escapeHtml(t.unit) + "</button>";
      }).join("") + "</div>"
    );
  }

  function stepConfigureHtml() {
    var wrapper = platformPlan();
    if (!wrapper || !wrapper.taskTypes) {
      return '<h3 class="cc-step-title">Pricing</h3><p class="cc-step-desc">Pricing for this platform is coming soon.</p>';
    }
    var html = taskTypesHtml();
    var p = plan();
    if (!p) return html;
    html += '<h3 class="cc-step-title cc-field-mt">Pricing</h3>';
    if (hasTiers(p)) {
      html += '<div class="cc-tiers">' + p.tiers.map(function (tier) {
        var active = sel.tier && sel.tier.qty === tier.qty ? " is-active" : "";
        return (
          '<button type="button" class="pick pick--tier' + active + '" data-tier="' + tier.qty + '">' +
          '<div class="cc-tier__qty">' + EL.formatNumber(tier.qty) + "</div>" +
          '<div class="cc-tier__unit">' + EL.escapeHtml(p.unit) + "</div>" +
          '<div class="cc-tier__price">' + EL.formatCurrency(tier.price) + "</div></button>"
        );
      }).join("") + "</div>";
      html += '<div class="field cc-field-mt"><label class="field__label" for="cc-qty">Or enter a custom amount of ' + EL.escapeHtml(p.unit) + "</label>" +
        '<input id="cc-qty" class="input" type="number" min="1" placeholder="e.g. 2500" value="' + (sel.quantity || "") + '" />' +
        '<p class="cc-hint">Pricing scales automatically with your chosen amount.</p></div>';
    } else if (hasPerUnit(p)) {
      html += '<div class="cc-config-perunit"><div class="cc-durations">' + p.perUnit.map(function (opt) {
        var active = sel.durationOption && sel.durationOption.label === opt.label ? " is-active" : "";
        return (
          '<button type="button" class="pick pick--duration' + active + '" data-duration="' + EL.escapeHtml(opt.label) + '">' +
          '<div class="cc-duration__label">' + EL.escapeHtml(opt.label) + "</div>" +
          '<div class="cc-duration__price">' + EL.formatCurrency(opt.price) + " each</div></button>"
        );
      }).join("") + "</div>" +
        '<div class="field"><label class="field__label" for="cc-qty">Number of ' + EL.escapeHtml(p.unit) + "</label>" +
        '<input id="cc-qty" class="input" type="number" min="1" placeholder="e.g. 2000" value="' + (sel.quantity || "") + '" /></div></div>';
    } else if (hasPricePerStream(p)) {
      html += '<div class="field cc-field-mt"><label class="field__label" for="cc-qty">Number of Streams (minimum ' + EL.formatNumber(p.minimum) + ")</label>" +
        '<input id="cc-qty" class="input" type="number" min="' + p.minimum + '" placeholder="e.g. ' + p.minimum + '" value="' + (sel.quantity || "") + '" />' +
        '<p class="cc-hint">' + EL.formatCurrency(p.pricePerStream) + " per stream</p></div>";
    }
    html += '<div id="cc-pay" class="cc-pay-block">' + payOptionsHtml() + "</div>";
    return html;
  }

  // The Cash / Points selector — shown on the Configure step (updates live as the
  // configuration changes). Amounts read "—" until a cost can be computed.
  function payOptionsHtml() {
    var cost = computeCost(sel);
    var pointsCost = cost !== null ? pointsCostFor(cost) : null;
    var canAffordPoints = pointsCost !== null && user.points >= pointsCost;
    var cashAmt = cost !== null ? EL.formatCurrency(cost) : "";
    var ptsAmt = pointsCost !== null ? EL.formatNumber(pointsCost) + " pts" : "";
    return (
      '<h4 class="cc-pay-h">Pay with</h4>' +
      '<div class="cc-pay-grid pay-grid">' +
      payButtonHtml("cash", "credit-card", "Cash", "Balance: " + EL.formatCurrency(user.cashBalance), cashAmt, false) +
      payButtonHtml("points", "coins", "Points", "Balance: " + EL.formatNumber(user.points) + " pts", ptsAmt, cost !== null && !canAffordPoints) +
      "</div>" +
      (cost !== null && !canAffordPoints ? '<p class="cc-warn">You don\'t have enough points. Pay with cash instead.</p>' : "")
    );
  }

  // Re-render only the pay selector (keeps focus in the quantity input).
  function refreshPay() {
    var payEl = $("cc-pay");
    if (!payEl) return;
    var cost = computeCost(sel);
    if (method === "points" && (cost === null || user.points < pointsCostFor(cost))) method = "cash";
    payEl.innerHTML = payOptionsHtml();
    bindPayMethodButtons();
    updateChrome();
    renderIcons();
  }

  function bindPayMethodButtons() {
    var scope = $("cc-pay") || $("cc-step");
    scope.querySelectorAll("[data-method]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        method = btn.getAttribute("data-method");
        if ($("cc-pay")) refreshPay(); else renderStep();
      });
    });
  }

  function stepTargetingHtml() {
    var countryOpts = '<option value="Global">Global</option>' +
      countries.map(function (c) { return '<option value="' + EL.escapeHtml(c) + '"' + (c === country ? " selected" : "") + ">" + EL.escapeHtml(c) + "</option>"; }).join("");
    var catOpts = businessCategories.map(function (c) { return '<option value="' + EL.escapeHtml(c) + '"' + (c === category ? " selected" : "") + ">" + EL.escapeHtml(c) + "</option>"; }).join("");
    return (
      '<h3 class="cc-step-title">Targeting</h3>' +
      '<p class="cc-step-desc">Only users matching this audience will receive your campaign tasks.</p>' +
      '<div class="cc-targeting-grid">' +
      '<div class="field"><label class="field__label" for="cc-country">Country</label><select id="cc-country" class="select">' + countryOpts + "</select></div>" +
      '<div class="field"><label class="field__label" for="cc-category">Business Category</label><select id="cc-category" class="select">' + catOpts + "</select></div>" +
      "</div>"
    );
  }

  function stepReviewHtml() {
    var p = plan(); var meta = platformMeta(); var cost = computeCost(sel);
    if (!p || !meta || cost === null) return "";
    var pointsCost = pointsCostFor(cost);
    var payName = method === "points" ? "Points" : "Cash";
    var payAmt = method === "points" ? EL.formatNumber(pointsCost) + " pts" : EL.formatCurrency(cost);
    return (
      '<h3 class="cc-step-title">Review &amp; Launch</h3>' +
      '<div class="cc-review-box">' +
      '<div class="cc-review-row"><span>Platform</span><span>' + EL.escapeHtml(meta.label) + "</span></div>" +
      '<div class="cc-review-row"><span>Task</span><span>' + EL.escapeHtml(p.unit) + "</span></div>" +
      '<div class="cc-review-row"><span>Goal</span><span>' + EL.escapeHtml(truncate(details.description, 60)) + "</span></div>" +
      (details.link ? '<div class="cc-review-row"><span>Link</span><span>' + EL.escapeHtml(truncate(details.link, 40)) + "</span></div>" : "") +
      (details.screenshotName ? '<div class="cc-review-row"><span>Screenshot</span><span>' + EL.escapeHtml(truncate(details.screenshotName, 32)) + "</span></div>" : "") +
      '<div class="cc-review-row"><span>Quantity</span><span>' + EL.escapeHtml(quantityLabel(sel)) + "</span></div>" +
      '<div class="cc-review-row"><span>Targeting</span><span>' + EL.escapeHtml(category) + " · " + EL.escapeHtml(country) + "</span></div>" +
      '<div class="cc-review-row"><span>Payment</span><span>' + payName + "</span></div>" +
      '<div class="cc-review-row cc-review-row--total"><span>Total</span><span>' + payAmt + "</span></div></div>" +
      '<p class="cc-step-desc cc-review-note">Change your payment method on the Pricing step. Press <strong>Launch Campaign</strong> to confirm.</p>'
    );
  }

  function payButtonHtml(id, icon, title, sub, amt, disabled) {
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

  function renderStep() {
    var host = $("cc-step");
    var html = step === 0 ? stepPlatformHtml()
      : step === 1 ? stepDescribeHtml()
      : step === 2 ? stepTargetingHtml()
      : step === 3 ? stepConfigureHtml()
      : stepReviewHtml();
    host.innerHTML = '<div class="cc-fade">' + html + "</div>";
    bindStep();
    updateChrome();
    renderIcons();
  }

  function bindStep() {
    var host = $("cc-step");
    host.querySelectorAll("[data-platform]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-platform");
        var wrapper = pricingFor(id);
        var first = wrapper && wrapper.taskTypes ? wrapper.taskTypes[0] : null;
        sel = { platformId: id, taskType: first, tier: null, durationOption: null, quantity: null };
        // Screenshots only apply to app-store campaigns — drop any stale upload.
        if (!SCREENSHOT_PLATFORMS[id] && details.screenshot) {
          URL.revokeObjectURL(details.screenshot);
          details.screenshot = null; details.screenshotName = "";
        }
        renderStep();
      });
    });
    host.querySelectorAll("[data-tasktype]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-tasktype");
        var wrapper = platformPlan();
        sel.taskType = wrapper.taskTypes.filter(function (t) { return t.id === id; })[0];
        sel.tier = null; sel.durationOption = null; sel.quantity = null;
        renderStep();
      });
    });
    host.querySelectorAll("[data-tier]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var qty = Number(btn.getAttribute("data-tier"));
        sel.tier = plan().tiers.filter(function (t) { return t.qty === qty; })[0];
        sel.quantity = qty;
        renderStep();
      });
    });
    host.querySelectorAll("[data-duration]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var label = btn.getAttribute("data-duration");
        sel.durationOption = plan().perUnit.filter(function (o) { return o.label === label; })[0];
        renderStep();
      });
    });
    var descEl = $("cc-desc");
    if (descEl) descEl.addEventListener("input", function () { details.description = descEl.value; updateChrome(); });
    var linkEl = $("cc-link");
    if (linkEl) linkEl.addEventListener("input", function () { details.link = linkEl.value; });
    var shotInput = $("cc-shot-input");
    if (shotInput) shotInput.addEventListener("change", function () {
      var file = shotInput.files && shotInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { EL.toast.error("Please choose an image file (PNG, JPG, WEBP, GIF…)"); shotInput.value = ""; return; }
      if (details.screenshot) URL.revokeObjectURL(details.screenshot);
      details.screenshot = URL.createObjectURL(file);
      details.screenshotName = file.name;
      renderStep();
    });
    var shotRemove = $("cc-shot-remove");
    if (shotRemove) shotRemove.addEventListener("click", function () {
      if (details.screenshot) URL.revokeObjectURL(details.screenshot);
      details.screenshot = null; details.screenshotName = "";
      renderStep();
    });
    var qtyEl = $("cc-qty");
    if (qtyEl) qtyEl.addEventListener("input", function () {
      sel.quantity = Number(qtyEl.value) || null;
      if (hasTiers(plan())) {
        sel.tier = null; // a custom amount clears the preset selection
        host.querySelectorAll("[data-tier]").forEach(function (b) { b.classList.remove("is-active"); });
      }
      updateChrome();
      refreshPay();
    });
    var countryEl = $("cc-country");
    if (countryEl) countryEl.addEventListener("change", function () { country = countryEl.value; updateChrome(); });
    var catEl = $("cc-category");
    if (catEl) catEl.addEventListener("change", function () { category = catEl.value; updateChrome(); });
    bindPayMethodButtons();
  }

  /* --- Chrome (progress, footer, summary) ------------------------------- */
  function updateChrome() {
    $("cc-step-count").textContent = "Step " + (step + 1) + " of " + STEPS.length;
    $("cc-step-name").textContent = STEPS[step];
    $("cc-progress-bar").style.width = (((step + 1) / STEPS.length) * 100) + "%";

    $("cc-back").disabled = step === 0;
    var isLast = step === STEPS.length - 1;
    $("cc-continue").hidden = isLast;
    $("cc-launch").hidden = !isLast;
    $("cc-continue").disabled = !canContinue();
    var launchCost = computeCost(sel);
    $("cc-launch").disabled = launchCost === null || (method === "points" && user.points < pointsCostFor(launchCost));

    updateSummary();
  }

  function updateSummary() {
    var host = $("cc-summary-body");
    var meta = platformMeta();
    if (!meta) { host.innerHTML = '<p class="cc-sum-empty">Choose a platform to see live pricing.</p>'; return; }
    var p = plan();
    var cost = computeCost(sel);
    var qty = quantityLabel(sel);
    var html = '<div class="cc-sum-body">' +
      '<div class="cc-sum-row"><span class="badge badge--secondary">' + EL.escapeHtml(meta.label) + "</span>" +
      (p ? '<span class="cc-sum-unit">' + EL.escapeHtml(p.unit) + "</span>" : "") + "</div>";
    if (p && qty) html += '<div class="cc-sum-qty">' + EL.escapeHtml(qty) + "</div>";
    if (cost !== null) {
      html += '<div class="cc-sum-cost"><div class="cc-sum-cost__amt">' + EL.formatCurrency(cost) + "</div>" +
        '<div class="cc-sum-cost__pts">≈ ' + EL.formatNumber(pointsCostFor(cost)) + " points</div></div>";
    }
    host.innerHTML = html + "</div>";
  }

  /* --- Launch ----------------------------------------------------------- */
  function launchCampaign() {
    var meta = platformMeta(); var p = plan(); var cost = computeCost(sel);
    if (!meta || !p || cost === null) return;
    var pointsCost = pointsCostFor(cost);
    var target = sel.quantity || (sel.tier ? sel.tier.qty : 0);
    var title = meta.label + " " + p.unit + ": " + category + " (" + country + ")";

    // Live path: charge + create atomically through the secure function. On
    // success the wallet/dashboard (now DB-backed) reflect the new balance.
    if (window.SB && window.SB.configured && window.SB.createCampaign) {
      var launchBtn = $("cc-launch");
      launchBtn.disabled = true; launchBtn.textContent = "Launching…";
      window.SB.createCampaign({
        title: title, platform: meta.id, type: p.unit, target: target,
        cost: cost, method: method, pointsCost: pointsCost,
        country: country, category: category,
      }).then(function (res) {
        if (res && res.error) {
          launchBtn.disabled = false; launchBtn.textContent = "Launch Campaign";
          EL.toast.error(res.error.message || "Couldn't launch campaign.");
          return;
        }
        EL.toast.success("Campaign launched: " + title);
        setTimeout(function () { window.location.href = "wallet.html"; }, 400);
      });
      return;
    }

    EL.store.dispatch({
      type: "ADD_CAMPAIGN",
      campaign: {
        id: EL.uid("cmp"), title: title, platform: meta.id, type: p.unit,
        target: target, progress: 0, cost: cost, method: method, status: "active",
        description: details.description, link: details.link, screenshotName: details.screenshotName,
        createdAt: new Date().toISOString().slice(0, 10),
      },
    });
    if (method === "cash") {
      EL.store.dispatch({ type: "SPEND_CASH", cash: cost });
      EL.store.dispatch({ type: "ADD_WALLET_TXN", txn: { id: EL.uid("txn"), type: "spend", label: "Campaign: " + title, points: 0, cash: -cost, date: new Date().toISOString() } });
    } else {
      EL.store.dispatch({ type: "SPEND_POINTS", points: pointsCost });
      EL.store.dispatch({ type: "ADD_WALLET_TXN", txn: { id: EL.uid("txn"), type: "spend", label: "Campaign: " + title, points: -pointsCost, cash: 0, date: new Date().toISOString() } });
    }
    EL.toast.success("Campaign launched: " + title);
    setTimeout(function () { window.location.href = "wallet.html"; }, 400);
  }

  /* --- Footer nav (bound once) ------------------------------------------ */
  $("cc-back").addEventListener("click", function () { if (step > 0) { step -= 1; renderStep(); } });
  $("cc-continue").addEventListener("click", function () { if (canContinue() && step < STEPS.length - 1) { step += 1; renderStep(); } });
  $("cc-launch").addEventListener("click", launchCampaign);

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  renderStep();
})();
