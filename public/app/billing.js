// Billing page behaviour: pack checkout, Transactions filters with
// cursor paging, and the Referrals tab (invite code/link copy, share
// targets, friends list). Strings are rendered server-side; this file
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
      txReferral: "Invite bonus", txReferralFriend: "Joining bonus", txWelcome: "Welcome bonus", txPromo: "Promo bonus",
      available: "Available", used: "Used", expired: "Expired",
      friend: "Friend", waiting: "Waiting for first reading",
      rewarded: "First reading · +1", joined: "Joined", read: "First reading done",
      counts: function (j, r, b, cap) { return j + " joined · " + r + " read · Bonus today " + b + "/" + cap; },
      copied: "Copied",
    },
    th: {
      txTopup: "\u0e40\u0e15\u0e34\u0e21\u0e42\u0e17\u0e40\u0e04\u0e19", txRefund: "\u0e04\u0e37\u0e19\u0e40\u0e07\u0e34\u0e19", txDaily: "\u0e42\u0e17\u0e40\u0e04\u0e19\u0e1f\u0e23\u0e35\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19",
      txReadingDaily: "\u0e04\u0e33\u0e16\u0e32\u0e21 (\u0e42\u0e17\u0e40\u0e04\u0e19\u0e1f\u0e23\u0e35)", txReadingWallet: "\u0e04\u0e33\u0e16\u0e32\u0e21 (\u0e42\u0e17\u0e40\u0e04\u0e19)",
      txReferral: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e0a\u0e27\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19", txReferralFriend: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e2a\u0e21\u0e31\u0e04\u0e23", txWelcome: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a", txPromo: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e42\u0e1b\u0e23\u0e42\u0e21\u0e0a\u0e31\u0e19",
      available: "\u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49", used: "\u0e43\u0e0a\u0e49\u0e41\u0e25\u0e49\u0e27", expired: "\u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38",
      friend: "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19", waiting: "\u0e23\u0e2d\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e14\u0e39\u0e14\u0e27\u0e07\u0e04\u0e23\u0e31\u0e49\u0e07\u0e41\u0e23\u0e01",
      rewarded: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e04\u0e23\u0e31\u0e49\u0e07\u0e41\u0e23\u0e01\u0e41\u0e25\u0e49\u0e27 \u00b7 +1", joined: "\u0e2a\u0e21\u0e31\u0e04\u0e23\u0e41\u0e25\u0e49\u0e27", read: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e41\u0e23\u0e01\u0e41\u0e25\u0e49\u0e27",
      counts: function (j, r, b, cap) { return "\u0e40\u0e02\u0e49\u0e32\u0e23\u0e48\u0e27\u0e21 " + j + " \u00b7 \u0e14\u0e39\u0e14\u0e27\u0e07 " + r + " \u00b7 \u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49 " + b + "/" + cap; },
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
        msg.textContent = r.data.error === "expired_code" ? (s.expired || "Expired") : r.data.error === "already_used" ? (s.used || "Already used") : r.data.error === "own_code" ? (s.own || "Own code") : (s.invalid || "Invalid code");
      }).catch(function () {});
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
    if (item.reason === "promo") return ui.txPromo;
    if (item.reason === "referral") return item.ref && item.ref.indexOf("friend-bonus:") === 0 ? ui.txReferralFriend : ui.txReferral;
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

  // --- Referrals ---
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

  var inviteData = null;
  api("/api/me/referrals").then(function (r) {
    if (r.status !== 200) return;
    inviteData = r.data;
    var codeEl = $("invite-code");
    var linkEl = $("invite-link");
    var msgEl = $("invite-message");
    var imgEl = $("invite-image");
    if (codeEl) codeEl.textContent = inviteData.code;
    if (linkEl) linkEl.textContent = inviteData.link;
    if (imgEl) imgEl.href = "/invite/" + encodeURIComponent(inviteData.code) + ".png?lang=" + lang;
    var msg = lang === "th"
      ? "\u0e25\u0e2d\u0e07\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e1f\u0e23\u0e35\u0e17\u0e35\u0e48 TarotNice \u0e16\u0e32\u0e21\u0e44\u0e14\u0e49\u0e17\u0e38\u0e01\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07 \u0e2a\u0e21\u0e31\u0e04\u0e23\u0e14\u0e49\u0e27\u0e22\u0e42\u0e04\u0e49\u0e14 {code} \u0e23\u0e31\u0e1a +1 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e42\u0e1a\u0e19\u0e31\u0e2a {link}"
      : "Try a free tarot reading on TarotNice. Ask about anything. Sign up with code {code} for a bonus question. {link}";
    if (msgEl) msgEl.textContent = msg.replace("{code}", inviteData.code).replace("{link}", inviteData.link);
    var countsEl = $("friends-counts");
    var progEl = $("friends-progress");
    var friends = inviteData.friends || [];
    var joined = friends.filter(function (f) { return f.status !== "joined" || true; }).length;
    var read = friends.filter(function (f) { return f.status === "read" || f.status === "rewarded"; }).length;
    if (countsEl) countsEl.textContent = "(" + friends.length + ")";
    if (progEl) progEl.textContent = ui.counts(joined, read, inviteData.rewardToday || 0, inviteData.rewardCap || 3);
    var statJoined = $("stat-joined"); if (statJoined) statJoined.textContent = String(friends.length);
    var statRead = $("stat-read"); if (statRead) statRead.textContent = String(read);
    var statEarned = $("stat-earned"); if (statEarned) statEarned.textContent = String(inviteData.totalEarned || 0);
    var list = $("friend-list");
    if (list) {
      list.innerHTML = friends.map(function (f) {
        var initial = esc((f.name || ui.friend).charAt(0).toUpperCase() || "?");
        var label = f.status === "rewarded" ? ui.rewarded : f.status === "read" ? ui.read : f.status === "joined" ? ui.joined : ui.waiting;
        return '<li class="friend-row"><span class="friend-ava">' + initial + '</span><span class="friend-name">' + esc(f.name || ui.friend) + '</span><span class="friend-status">' + esc(label) + "</span></li>";
      }).join("");
    }
    var copyCode = $("copy-code");
    var copyLink = $("copy-link");
    if (copyCode) copyCode.addEventListener("click", function () { copyText(inviteData.code, copyCode); });
    if (copyLink) copyLink.addEventListener("click", function () { copyText(inviteData.link, copyLink); });
    document.querySelectorAll("[data-share-invite]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = msgEl ? msgEl.textContent : inviteData.link;
        var url = inviteData.link;
        var target = btn.getAttribute("data-share-invite");
        var shareUrl = target === "line"
          ? "https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text)
          : "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url) + "&quote=" + encodeURIComponent(text);
        window.open(shareUrl, "_blank", "noopener,width=640,height=560");
      });
    });
  }).catch(function () {});
})();
