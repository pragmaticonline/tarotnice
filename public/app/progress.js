// TarotProgress: milestone badge sharing (text via the native sheet,
// clipboard fallback) on the progress page.
(function () {
  "use strict";

  function uiLang() {
    return document.documentElement.lang === "th" ? "th" : "en";
  }

  async function shareBadge(key, label) {
    // Preferred path: the in-app share sheet (badge story/OG images
    // via kind:'badge'). Text share is the fallback.
    if (window.TarotShare && typeof window.TarotShare.open === "function") {
      window.TarotShare.open("badge", key);
      return;
    }
    var text = "TarotNice \u2014 " + label + " \u2713 https://tarotnice.com";
    try {
      if (navigator.share) {
        await navigator.share({ title: "TarotNice", text: text });
        return;
      }
      throw new Error("no native share");
    } catch (e) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        /* clipboard unavailable: nothing to do */
      }
    }
    try {
      fetch("/_t/events", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "share_open", kind: "badge", detail: key, lang: uiLang() }),
        keepalive: true,
      }).catch(function () {});
    } catch (_) {}
  }

  function selectDay(day) {
    document.querySelectorAll("[data-cal-day]").forEach(function (c) {
      c.classList.toggle("sel", c.getAttribute("data-cal-day") === day);
    });
    var title = document.querySelector("[data-journey-day-title]");
    if (title) title.textContent = day || "";
    var any = false;
    document.querySelectorAll("[data-entry-day]").forEach(function (e) {
      var show = e.getAttribute("data-entry-day") === day;
      e.hidden = !show;
      if (show) any = true;
    });
    var empty = document.querySelector("[data-journey-empty]");
    if (empty) empty.hidden = any;
  }

  function init() {
    var cells = document.querySelectorAll("[data-cal-day]");
    cells.forEach(function (c) {
      c.addEventListener("click", function () { selectDay(c.getAttribute("data-cal-day")); });
    });
    if (cells.length) selectDay(cells[cells.length - 1].getAttribute("data-cal-day"));
    var buttons = document.querySelectorAll("[data-share-badge]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          shareBadge(btn.getAttribute("data-share-badge") || "", btn.textContent || "");
        });
      })(buttons[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// Daily check-in claim (no page reload): on success the today stamp flips
// to claimed, the gold button becomes the green done box, a toast shows,
// the header balance ticks +1, and every red dot disappears.
(function () {
  "use strict";

  function bumpCounts() {
    var sels = ["[data-token-count]", "[data-drawer-tokens]", "[data-drawer-wallet-count]", "[data-drawer-wallet-balance]"];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var n = parseInt((el.textContent || "").replace(/[^0-9]/g, ""), 10);
        if (!isNaN(n)) el.textContent = String(n + 1);
      });
    });
  }

  function hideDots() {
    ["[data-checkin-dot]", "[data-checkin-dot-menu]"].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.hidden = true; });
    });
    document.querySelectorAll("[data-drawer-open]").forEach(function (btn) {
      var label = btn.getAttribute("data-menu-label");
      if (label) btn.setAttribute("aria-label", label);
    });
  }

  function applyClaimed(total) {
    var card = document.getElementById("ci-card");
    if (card) card.setAttribute("data-claimed", "true");
    var stamp = document.querySelector('.ci-stamp[data-state="today"]');
    if (stamp) {
      stamp.setAttribute("data-state", "gotToday");
      var icon = stamp.querySelector("[data-ci-icon]");
      if (icon) icon.textContent = "\u2713";
      var doneAria = stamp.getAttribute("data-aria-done");
      if (doneAria) stamp.setAttribute("aria-label", doneAria);
    }
    var btn = document.getElementById("ci-claim");
    if (btn) btn.hidden = true;
    var done = document.getElementById("ci-done");
    if (done) done.hidden = false;
    if (typeof total === "number") {
      var t = document.getElementById("ci-total");
      if (t) t.textContent = String(total);
    }
    var toast = document.getElementById("ci-toast");
    if (toast) {
      var tpl = toast.getAttribute("data-template") || "";
      toast.textContent = tpl.replace("{n}", String(typeof total === "number" ? total : ""));
      toast.hidden = false;
      setTimeout(function () { toast.hidden = true; }, 2500);
    }
    bumpCounts();
    hideDots();
  }

  function initCheckin() {
    var btn = document.getElementById("ci-claim");
    if (!btn || btn.dataset.ciBound) return;
    btn.dataset.ciBound = "1";
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      btn.disabled = true;
      fetch("/api/checkin/claim", { method: "POST", credentials: "include" })
        .then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function (data) {
          if (data && (data.ok || data.alreadyClaimed)) {
            applyClaimed(typeof data.total === "number" ? data.total : undefined);
          } else {
            btn.disabled = false;
          }
        })
        .catch(function () { btn.disabled = false; });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCheckin);
  } else {
    initCheckin();
  }
})();
