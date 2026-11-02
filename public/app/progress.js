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
