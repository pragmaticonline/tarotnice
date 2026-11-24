// Billing page behaviour: pack checkout, Transactions filters with
// cursor paging, and the Invite tab (copy buttons, LINE share, payout
// request). Content is server-rendered; this file only wires actions.
// only wires data. Text labels come from the JSON payloads' `label`
// fields so EN/TH stay in one place (the i18n dict on the server).
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function api(path, opts) {
    return fetch(path, Object.assign({ credentials: "include", headers: { "Content-Type": "application/json" } }, opts || {}))
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; }); });
  }

  var lang = document.documentElement.lang === "th" ? "th" : "en";
  var ui = {
    en: {
      txTopup: "Token top-up", txRefund: "Refund", txDaily: "Daily free tokens",
      txReadingDaily: "Question (free tokens)", txReadingWallet: "Question (tokens)",
      txReferral: "Invite bonus", txReferralFriend: "Friend code bonus", txTopupBonus: "Friend top-up bonus", txWelcome: "Welcome bonus", txPromo: "Promo bonus", txStaffGrant: "Staff grant", txAffiliateClaim: "Affiliate payout", txCheckin: "Daily check-in", txMouse: "Mouse catch", txLineGift: "LINE friend gift",
      available: "Available", used: "Used", expired: "Expired",
      copied: "Copied",
    },
    th: {
      txTopup: "\u0e40\u0e15\u0e34\u0e21\u0e42\u0e17\u0e40\u0e04\u0e19", txRefund: "\u0e04\u0e37\u0e19\u0e40\u0e07\u0e34\u0e19", txDaily: "\u0e42\u0e17\u0e40\u0e04\u0e19\u0e1f\u0e23\u0e35\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19",
      txReadingDaily: "\u0e04\u0e33\u0e16\u0e32\u0e21 (\u0e42\u0e17\u0e40\u0e04\u0e19\u0e1f\u0e23\u0e35)", txReadingWallet: "\u0e04\u0e33\u0e16\u0e32\u0e21 (\u0e42\u0e17\u0e40\u0e04\u0e19)",
      txReferral: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e0a\u0e27\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19", txReferralFriend: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e42\u0e04\u0e49\u0e14\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19", txTopupBonus: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e40\u0e15\u0e34\u0e21\u0e40\u0e07\u0e34\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19", txWelcome: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a", txPromo: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e42\u0e1b\u0e23\u0e42\u0e21\u0e0a\u0e31\u0e19", txStaffGrant: "\u0e42\u0e17\u0e40\u0e04\u0e19\u0e08\u0e32\u0e01\u0e17\u0e35\u0e21\u0e07\u0e32\u0e19", txCheckin: "\u0e40\u0e0a\u0e47\u0e01\u0e2d\u0e34\u0e19\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19", txMouse: "\u0e08\u0e31\u0e1a\u0e2b\u0e19\u0e39\u0e44\u0e14\u0e49", txLineGift: "\u0e02\u0e2d\u0e07\u0e02\u0e27\u0e31\u0e0d\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19 LINE", txAffiliateClaim: "\u0e04\u0e48\u0e32\u0e15\u0e2d\u0e1a\u0e41\u0e17\u0e19\u0e1e\u0e32\u0e23\u0e4c\u0e17\u0e40\u0e19\u0e2d\u0e23\u0e4c",
      available: "\u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49", used: "\u0e43\u0e0a\u0e49\u0e41\u0e25\u0e49\u0e27", expired: "\u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38",
      copied: "\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e41\u0e25\u0e49\u0e27",
    },
  }[lang];

  // --- Pack checkout ---
  document.querySelectorAll("[data-buy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.disabled = true;
      api("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ pack: btn.getAttribute("data-buy"), return: location.pathname }),
      }).then(function (r) {
        if (r.data && r.data.url) { location.href = r.data.url; return; }
        btn.disabled = false;
      }).catch(function () { btn.disabled = false; });
    });
  });

  // --- Tabs ---
  function activateTab(name) {
    document.querySelectorAll("[data-tab]").forEach(function (t) {
      t.setAttribute("aria-selected", t.getAttribute("data-tab") === name ? "true" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
  }
  document.querySelectorAll("[data-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () { activateTab(tab.getAttribute("data-tab")); });
  });
  if (location.hash === "#ref") activateTab("ref");
  if (location.hash === "#activity" && $("activity")) $("activity").scrollIntoView();

  // --- Redeem code (wallet) ---
  var redeemBtn = $("redeem-apply");
  if (redeemBtn) {
    redeemBtn.addEventListener("click", function () {
      var input = $("redeem-code");
      var msg = $("redeem-msg");
      var s = window.__tnRedeemStrings || {};
      api("/api/me/redeem", { method: "POST", body: JSON.stringify({ code: input ? input.value : "" }) }).then(function (r) {
        if (!msg) return;
        if (r.status === 200) {
          msg.style.color = "#146c2e";
          msg.textContent = (s.ok || "{code} redeemed · +{bonus} bonus tokens").replace("{code}", r.data.code).replace("{bonus}", r.data.bonus);
          setTimeout(function () { location.reload(); }, 900);
          return;
        }
        msg.style.color = "";
        msg.textContent = r.data.error === "expired_code" ? (s.expired || "Expired") : r.data.error === "already_used" ? (s.used || "Already used") : r.data.error === "own_code" ? (s.own || "Own code") : r.data.error === "ineligible" ? (s.newOnly || "New accounts only") : (s.invalid || "Invalid code");
      }).catch(function () {});
    });
  }

  // --- Affiliate payout claim ---
  var claimBtn = $("aff-claim");
  if (claimBtn) {
    claimBtn.addEventListener("click", function () {
      var msg = $("aff-claim-msg");
      claimBtn.disabled = true;
      api("/api/me/affiliate/claim", { method: "POST", body: "{}" }).then(function (r) {
        if (r.status === 200) { location.reload(); return; }
        claimBtn.disabled = false;
        if (msg) msg.textContent = (r.data && r.data.error) || "error";
      }).catch(function () { claimBtn.disabled = false; });
    });
  }

  // --- Transactions ---
  var txList = $("tx-list");
  var txEmpty = $("tx-empty");
  var txMore = $("tx-more");
  var txCursor = null;
  var txFilter = "all";

  function txLabel(item) {
    if (item.reason === "topup") return ui.txTopup;
    if (item.reason === "refund") return ui.txRefund;
    if (item.reason === "daily") return ui.txDaily;
    if (item.reason === "reading") return item.source === "daily" ? ui.txReadingDaily : ui.txReadingWallet;
    if (item.reason === "welcome") return ui.txWelcome;
    if (item.reason === "promo" && item.ref && /^promo:LINE-/i.test(item.ref)) return ui.txLineGift || ui.txPromo;
    if (item.reason === "promo") return ui.txPromo;
    if (item.reason === "staff_grant") return ui.txStaffGrant || item.reason;
    if (item.reason === "affiliate_claim") return ui.txAffiliateClaim || item.reason;
    if (item.reason === "checkin") return ui.txCheckin || item.reason;
    if (item.reason === "mouse") return ui.txMouse || item.reason;
    if (item.reason === "referral") return item.ref && item.ref.indexOf("friend-topup-bonus:") === 0 ? (ui.txTopupBonus || ui.txReferral) : item.ref && item.ref.indexOf("friend-bonus:") === 0 ? ui.txReferralFriend : ui.txReferral;
    return item.reason;
  }

  function renderTx(items, append) {
    if (!append) txList.innerHTML = "";
    var lastDay = null;
    var prior = txList.querySelectorAll(".tx-group");
    if (prior.length) lastDay = prior[prior.length - 1].textContent;
    items.forEach(function (item) {
      if (item.day && item.day !== lastDay) {
        lastDay = item.day;
        var head = document.createElement("li");
        head.className = "tx-group";
        head.textContent = item.day;
        txList.appendChild(head);
      }
      var li = document.createElement("li");
      li.className = "tx-row";
      var sign = item.delta > 0 ? "+" : "";
      var status = item.status ? ' <span class="tx-status">' + esc(ui[item.status] || item.status) + "</span>" : "";
      var sub = "";
      if (item.reading) {
        sub = "<span class=\"tx-sub\">" + esc(item.reading.topic || "") + " · &ldquo;" + esc(item.reading.question || "") + "&rdquo; " +
          "<a href=\"/history/" + encodeURIComponent(item.reading.id) + "\">" + esc(window.__tnTxStrings ? window.__tnTxStrings.read || "Read this reading" : "Read this reading") + "</a></span>";
      }
      if (item.reason === "topup" && item.amount) {
        sub = "<span class=\"tx-sub\">\u0e3f" + (item.amount / 100).toLocaleString() + (item.paymentMethod ? " · " + esc(item.paymentMethod) : "") +
          (item.receiptUrl ? " · <a href=\"" + esc(item.receiptUrl) + "\" target=\"_blank\" rel=\"noopener\">" + esc(window.__tnTxStrings ? window.__tnTxStrings.receipt || "View receipt" : "View receipt") + "</a>" : "") + "</span>";
      }
      li.innerHTML = "<span class=\"tx-label\">" + esc(txLabel(item)) + status + sub + "</span>" +
        "<span class=\"tx-day\">" + esc(item.day) + "</span>" +
        "<b class=\"tx-delta" + (item.delta < 0 ? " neg" : "") + "\">" + sign + item.delta + "</b>";
      txList.appendChild(li);
    });
    txEmpty.hidden = txList.children.length > 0;
  }

  function loadTx() {
    var q = "/api/me/transactions?filter=" + encodeURIComponent(txFilter) + (txCursor ? "&cursor=" + txCursor : "");
    api(q).then(function (r) {
      var items = (r.data && r.data.items) || [];
      renderTx(items, Boolean(txCursor));
      txCursor = r.data && r.data.nextCursor ? r.data.nextCursor : null;
      txMore.hidden = !txCursor;
    }).catch(function () {});
  }

  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      txFilter = btn.getAttribute("data-filter");
      txCursor = null;
      loadTx();
    });
  });
  if (txMore) txMore.addEventListener("click", loadTx);
  if (txList) loadTx();

  // --- Invite + affiliate tab (v2: everything server-rendered) ---
  function copyText(text, btn) {
    function done() {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ui.copied;
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else { done(); }
  }
  function wireCopy(id, getText) {
    var btn = $(id);
    if (btn) btn.addEventListener("click", function () { copyText(getText(), btn); });
  }
  wireCopy("copy-code", function () { var el = $("invite-code"); return el ? el.textContent : ""; });
  wireCopy("copy-link", function () { var el = $("invite-link"); return el ? el.textContent : ""; });
  wireCopy("copy-msg", function () { var el = $("invite-message"); return el ? el.textContent : ""; });
  document.querySelectorAll("[data-share-invite]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var linkEl = $("invite-link");
      var msgEl = $("invite-message");
      var url = linkEl ? linkEl.textContent.trim() : "";
      var text = msgEl ? msgEl.textContent : "";
      // The invite message already ends with the link; LINE appends
      // the url= value to the text, so strip the link from the text
      // or the shared message carries the link twice.
      if (url) text = text.split(url).join("").trim();
      var target = btn.getAttribute("data-share-invite");
      if (target !== "line") return;
      var shareUrl = "https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(url) +
        (text ? "&text=" + encodeURIComponent(text) : "");
      window.open(shareUrl, "_blank", "noopener,width=640,height=560");
    });
  });

  // --- Affiliate cash payout request ---
  var payoutBtn = $("aff-payout");
  if (payoutBtn) {
    payoutBtn.addEventListener("click", function () {
      var msg = $("aff-payout-msg");
      var s = window.__tnAffPay || {};
      payoutBtn.disabled = true;
      api("/api/me/affiliate/payout", { method: "POST", body: "{}" }).then(function (r) {
        if (r.status === 200) { location.reload(); return; }
        payoutBtn.disabled = false;
        if (msg) msg.textContent = s.fail || "error";
      }).catch(function () { payoutBtn.disabled = false; });
    });
  }
})();
