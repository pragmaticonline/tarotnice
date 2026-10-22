// Daily card, site-wide: header pill (gold dot until drawn) + centred
// modal. Tap the card in the modal to flip/draw it; Share and Ask a
// question sit under it. Auto-opens once per Bangkok day on home only.
(function () {
  "use strict";

  function uiLang() {
    return document.documentElement.lang === "th" ? "th" : "en";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }
  function bangkokToday() {
    try {
      var parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      var m = {};
      parts.forEach(function (p) { m[p.type] = p.value; });
      return { key: m.year + "-" + m.month + "-" + m.day, dom: Number(m.day) };
    } catch (e) {
      var d = new Date();
      return { key: d.toISOString().slice(0, 10), dom: d.getDate() };
    }
  }
  function lsGet(k) { try { return localStorage.getItem("tarotnice:" + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem("tarotnice:" + k, v); } catch (e) {} }

  var state = null; // today's daily payload (with .card) when drawn
  var loaded = false;
  var lastFocus = null;

  var STR = {
    en: { title: "Daily card", reveal: "Tap to reveal", share: "Share", ask: "Ask a question", close: "Close" },
    th: {
      title: "\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19",
      reveal: "\u0e41\u0e15\u0e30\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1b\u0e34\u0e14\u0e44\u0e1e\u0e48",
      share: "\u0e41\u0e0a\u0e23\u0e4c\u0e14\u0e27\u0e07",
      ask: "\u0e16\u0e32\u0e21\u0e04\u0e33\u0e16\u0e32\u0e21",
      close: "\u0e1b\u0e34\u0e14",
    },
  };
  function t() { return STR[uiLang()] || STR.en; }

  function paintDot() {
    var dot = document.querySelector("[data-daily-dot]");
    if (!dot) return;
    var drawn = (state && state.card) || lsGet("daily-drawn") === bangkokToday().key;
    dot.hidden = !!drawn;
  }

  function faceHtml(daily, lang) {
    var lucky = daily.luckyColour || {};
    var colour = lang === "th" ? lucky.th || "" : lucky.en || "";
    return (
      '<div class="daily-face"><img src="' + esc(daily.card.image) + '" srcset="' +
      esc(daily.card.image2x) + ' 2x" alt="' + esc(daily.card.name) + '"' +
      (daily.card.reversed ? ' class="rev"' : "") + ">" +
      '<div class="daily-body"><p class="daily-name">' + esc(daily.card.name) +
      (daily.card.reversed ? (lang === "th" ? " (\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27)" : " (reversed)") : "") + "</p>" +
      '<p class="daily-msg">' + esc(daily.message) + "</p>" +
      (colour ? '<p class="daily-lucky">' + esc(colour) + "</p>" : "") +
      "</div></div>"
    );
  }

  async function ensureSummary() {
    var res = await fetch("/api/me/summary", { credentials: "include" });
    var data = await res.json();
    if (!data.user) {
      await fetch("/api/auth/sign-in/anonymous", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: "{}",
      });
      res = await fetch("/api/me/summary", { credentials: "include" });
      data = await res.json();
    }
    return data;
  }

  async function loadState() {
    if (loaded) return state;
    try {
      var data = await ensureSummary();
      if (data.today && data.today.daily && data.today.daily.card) {
        state = data.today.daily;
        lsSet("daily-drawn", bangkokToday().key);
      }
    } catch (e) {}
    loaded = true;
    paintDot();
    return state;
  }

  function buildModal() {
    var sheet = document.getElementById("daily-sheet");
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "daily-sheet";
    sheet.className = "sheet daily-sheet";
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="panel daily-panel" role="dialog" aria-modal="true" aria-label="' + esc(t().title) + '">' +
      '<div class="daily-modal-head"><h2 class="daily-modal-title"></h2>' +
      '<button type="button" class="daily-x" aria-label="' + esc(t().close) + '">\u00d7</button></div>' +
      '<div class="daily-modal-body"></div>' +
      '<div class="daily-modal-actions">' +
      '<button type="button" class="btn btn-outline daily-m-share">' + esc(t().share) + "</button>" +
      '<button type="button" class="btn daily-m-ask">' + esc(t().ask) + "</button></div></div>";
    document.body.appendChild(sheet);
    sheet.querySelector(".daily-x").addEventListener("click", close);
    sheet.addEventListener("click", function (e) { if (e.target === sheet) close(); });
    document.addEventListener("keydown", function (e) {
      if (sheet.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") trapTab(e, sheet);
    });
    sheet.querySelector(".daily-m-share").addEventListener("click", function () {
      if (window.TarotShare) window.TarotShare.open("daily", null);
    });
    sheet.querySelector(".daily-m-ask").addEventListener("click", function () {
      close();
      var q = document.getElementById("q");
      if (q) {
        q.scrollIntoView({ block: "center" });
        q.focus();
      } else {
        location.href = "/?focus=q";
      }
    });
    return sheet;
  }

  function trapTab(e, sheet) {
    var items = sheet.querySelectorAll("button, [href], textarea, input");
    var list = [];
    items.forEach(function (n) { if (!n.hidden && n.offsetParent !== null) list.push(n); });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function renderBody(sheet) {
    var body = sheet.querySelector(".daily-modal-body");
    var shareBtn = sheet.querySelector(".daily-m-share");
    var lang = uiLang();
    if (state && state.card) {
      shareBtn.hidden = false;
      body.innerHTML = faceHtml(state, lang);
      return;
    }
    shareBtn.hidden = true;
    body.innerHTML =
      '<button type="button" class="daily-tap" id="daily-reveal"><span class="card-back" aria-hidden="true"></span><span>' +
      esc(t().reveal) + "</span></button>";
    var btn = document.getElementById("daily-reveal");
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      try {
        var res = await fetch("/api/daily", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang: uiLang() }),
        });
        if (!res.ok) throw new Error("draw failed");
        state = await res.json();
        loaded = true;
        lsSet("daily-drawn", bangkokToday().key);
        paintDot();
        renderBody(sheet);
      } catch (e) {
        btn.disabled = false;
      }
    });
  }

  async function open() {
    var sheet = buildModal();
    lastFocus = document.activeElement;
    var today = bangkokToday();
    sheet.querySelector(".daily-modal-title").textContent =
      uiLang() === "th"
        ? t().title + " \u00b7 \u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 " + today.dom
        : t().title + " \u00b7 Day " + today.dom;
    sheet.hidden = false;
    renderBody(sheet);
    await loadState();
    if (!sheet.hidden) renderBody(sheet);
    var x = sheet.querySelector(".daily-x");
    if (x) x.focus();
  }

  function close() {
    var sheet = document.getElementById("daily-sheet");
    if (sheet) sheet.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setState(daily) {
    if (daily && daily.card) {
      state = daily;
      loaded = true;
      lsSet("daily-drawn", bangkokToday().key);
      paintDot();
    }
  }

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-daily-btn]") : null;
    if (b) open();
  });

  paintDot();
  // Auto-open once per day, home only.
  if (location.pathname === "/" && lsGet("daily-auto") !== bangkokToday().key) {
    lsSet("daily-auto", bangkokToday().key);
    setTimeout(function () { open(); }, 900);
  }

  window.TarotDaily = { open: open, close: close, setState: setState };
})();
