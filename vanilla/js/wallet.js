/* =============================================================================
   EarnLoop — Wallet page logic (replaces WalletPage.tsx)
   Balances and the transaction history table.
   ============================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var TXN_ICON = { earn: "arrow-down-left", spend: "arrow-up-right", referral: "gift", purchase: "shopping-cart", withdraw: "banknote", deposit: "plus-circle" };
  var TXN_LABEL = { earn: "Earned", spend: "Spent", referral: "Referral", purchase: "Purchase", withdraw: "Withdrawal", deposit: "Added funds" };

  var PRESETS = [10, 25, 50, 100];

  var METHODS = [
    { id: "paystack",    name: "Paystack",    desc: "Card, bank & USSD",         mono: "P", color: "#0BA4DB", url: "https://paystack.com" },
    { id: "flutterwave", name: "Flutterwave", desc: "Card, bank & mobile money", mono: "F", color: "#F5A623", url: "https://flutterwave.com" },
    { id: "korapay",     name: "Korapay",     desc: "Card & bank transfer",      mono: "K", color: "#6C5CE7", url: "https://korapay.com" },
    { id: "payoneer",    name: "Payoneer",    desc: "Global bank transfer",      mono: "P", color: "#FF4800", url: "https://www.payoneer.com" },
  ];
  var selectedMethod = METHODS[0].id;
  function currentMethod() { return METHODS.filter(function (m) { return m.id === selectedMethod; })[0] || METHODS[0]; }

  // History rows. Starts as the mock seed for instant paint / local dev, then
  // gets replaced by the real point_transactions rows once Supabase is ready.
  var historyTxns = EL.store.get().walletTransactions;

  /* --- Balances (re-render when shell.js hydrates the live profile) ------ */
  function renderBalances() {
    var u = EL.store.get().currentUser;
    $("wallet-points").textContent = EL.formatNumber(u.points);
    $("wallet-cash").textContent = EL.formatCurrency(u.cashBalance);
  }

  /* --- Transaction history table ---------------------------------------- */
  function renderHistory() {
    var host = $("wallet-history-body");
    var txns = historyTxns;
    if (txns.length === 0) {
      host.innerHTML =
        '<div class="empty-state"><span class="empty-state__ic"><i data-lucide="wallet"></i></span>' +
        '<p class="empty-state__title">No transactions yet</p>' +
        '<p class="empty-state__desc">Your earnings and purchases will show up here.</p></div>';
      renderIcons();
      return;
    }

    var rows = txns.map(function (t) {
      return (
        "<tr>" +
        '<td><div class="wallet-txn">' +
        '<span class="wallet-txn__ic"><i data-lucide="' + (TXN_ICON[t.type] || "circle") + '"></i></span>' +
        '<div class="wallet-txn__body"><div class="wallet-txn__label">' + EL.escapeHtml(t.label) + "</div>" +
        '<div class="wallet-txn__type">' + (TXN_LABEL[t.type] || t.type) + "</div></div></div></td>" +
        '<td class="wallet-txn__type">' + EL.formatDate(t.date) + "</td>" +
        '<td class="is-right ' + amtClass(t.points) + '">' + (t.points !== 0 ? (t.points > 0 ? "+" : "") + EL.formatNumber(t.points) : "") + "</td>" +
        '<td class="is-right ' + amtClass(t.cash) + '">' + (t.cash !== 0 ? (t.cash > 0 ? "+" : "") + EL.formatCurrency(t.cash) : "") + "</td>" +
        "</tr>"
      );
    }).join("");

    host.innerHTML =
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      "<th>Transaction</th><th>Date</th><th class=\"is-right\">Points</th><th class=\"is-right\">Cash</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    renderIcons();
  }

  function amtClass(n) {
    return "wallet-amt " + (n > 0 ? "wallet-amt--pos" : n < 0 ? "wallet-amt--neg" : "wallet-amt--zero");
  }

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    else setTimeout(renderIcons, 60);
  }

  /* --- Add funds -------------------------------------------------------- */
  var dialog = $("wallet-add-dialog");

  function amountNum() { return Number($("wallet-add-amount").value) || 0; }

  function renderPresets() {
    var amt = amountNum();
    $("wallet-add-presets").innerHTML = PRESETS.map(function (p) {
      var active = p === amt ? " is-active" : "";
      return '<button type="button" class="wallet-preset' + active + '" data-preset="' + p + '">' + EL.formatCurrency(p) + "</button>";
    }).join("");
    $("wallet-add-presets").querySelectorAll("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $("wallet-add-amount").value = btn.getAttribute("data-preset");
        syncAmount();
      });
    });
  }

  function renderMethods() {
    $("wallet-methods").innerHTML = METHODS.map(function (m) {
      var active = m.id === selectedMethod ? " is-active" : "";
      return (
        '<button type="button" class="wallet-method' + active + '" data-method="' + m.id + '">' +
        '<span class="wallet-method__mark" style="background-color:' + m.color + '">' + m.mono + "</span>" +
        '<span class="wallet-method__body"><span class="wallet-method__name">' + m.name + "</span>" +
        '<span class="wallet-method__desc">' + m.desc + "</span></span>" +
        '<span class="wallet-method__check"><i data-lucide="check"></i></span>' +
        "</button>"
      );
    }).join("");
    $("wallet-methods").querySelectorAll("[data-method]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedMethod = btn.getAttribute("data-method");
        renderMethods();
        syncMethodLabel();
        renderIcons();
      });
    });
  }

  function syncMethodLabel() {
    if (!processing) $("wallet-add-method-label").textContent = currentMethod().name;
  }

  function syncAmount() {
    var amt = amountNum();
    $("wallet-add-warn").innerHTML = amt >= 1 ? "" : '<p class="wallet-add-warn">Enter an amount of at least ' + EL.formatCurrency(1) + ".</p>";
    if (!processing) $("wallet-add-confirm").disabled = amt < 1;
    renderPresets();
  }

  function openDialog() { dialog.classList.add("is-open"); dialog.setAttribute("aria-hidden", "false"); renderMethods(); syncMethodLabel(); syncAmount(); $("wallet-add-amount").focus(); renderIcons(); }
  function closeDialog() { if (processing) return; dialog.classList.remove("is-open"); dialog.setAttribute("aria-hidden", "true"); }

  var processing = false;
  function confirmAdd() {
    var amt = amountNum();
    if (amt < 1 || processing) return;
    var m = currentMethod();

    // Hand the shopper off to the provider's checkout. A real integration
    // would open a gateway-generated checkout session; here we redirect to the
    // provider so the flow is wired end-to-end on the frontend.
    var win = window.open(m.url, "_blank", "noopener");

    processing = true;
    var btn = $("wallet-add-confirm");
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="wallet-spin"></i> Redirecting to ' + m.name + "…";
    renderIcons();

    // When the shopper returns from the provider, credit the balance. (Real
    // integration: confirm via the provider webhook / verify endpoint instead.)
    setTimeout(function () {
      // NOTE: still client-side simulated. Real deposits must be credited by a
      // payment-provider webhook / verify endpoint server-side (cash_balance and
      // point_transactions are not client-writable). Shown optimistically here.
      var txn = { id: EL.uid("txn"), type: "deposit", label: "Added funds via " + m.name, points: 0, cash: amt, date: new Date().toISOString() };
      EL.store.dispatch({ type: "ADD_CASH", cash: amt });
      EL.store.dispatch({ type: "ADD_WALLET_TXN", txn: txn });
      historyTxns = [txn].concat(historyTxns);
      EL.toast.success("Added " + EL.formatCurrency(amt) + " via " + m.name);
      processing = false;
      btn.disabled = false;
      btn.innerHTML = 'Continue to <span id="wallet-add-method-label">' + m.name + "</span>";
      closeDialog();
      renderBalances();
      renderHistory();
    }, 1400);

    if (!win) EL.toast("Allow pop-ups to open " + m.name + " checkout");
  }

  function renderAccepted() {
    var el = $("wallet-accepted");
    if (!el) return;
    el.innerHTML = METHODS.map(function (m) {
      return '<span class="wallet-accepted__mark" style="background-color:' + m.color + '" title="' + m.name + '">' + m.mono + "</span>";
    }).join("") + '<span class="wallet-accepted__label"><i data-lucide="shield-check"></i> Secured checkout</span>';
  }

  renderAccepted();
  $("wallet-add-open").addEventListener("click", openDialog);

  // Deep link: /wallet.html?add=1 (e.g. the dashboard "Add Funds" button) opens the dialog.
  if (/[?&]add=1(&|$)/.test(location.search)) openDialog();
  $("wallet-add-amount").addEventListener("input", syncAmount);
  $("wallet-add-confirm").addEventListener("click", confirmAdd);
  dialog.addEventListener("click", function (e) { if (e.target.closest("[data-dialog-close]")) closeDialog(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dialog.classList.contains("is-open")) closeDialog(); });

  /* --- Boot: paint now, then swap in live data -------------------------- */
  renderBalances();
  renderHistory();
  // Keep balances in sync when shell.js hydrates the real profile.
  EL.store.subscribe(renderBalances);

  // Load the real transaction history once Supabase is available (shell.js loads
  // it on demand, so it may not be ready the instant this script runs).
  (function loadLiveHistory(tries) {
    if (window.SB && window.SB.configured && window.SB.getTransactions) {
      window.SB.getTransactions().then(function (res) {
        if (!res || res.error || !Array.isArray(res.data)) return;
        historyTxns = res.data.map(function (t) {
          return { id: t.id, type: t.type, label: t.label, points: t.points, cash: Number(t.cash) || 0, date: t.created_at };
        });
        renderHistory();
      });
      return;
    }
    if ((tries || 0) < 50) setTimeout(function () { loadLiveHistory((tries || 0) + 1); }, 200);
  })(0);
})();
