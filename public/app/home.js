// Home bootstrap: anonymous session, server-wins reconcile of streak
// + quota + daily card, and the tap-to-draw daily flip.
(function () {
  var PREFIX = "tarotnice:";
  function lsGet(k) {
    try {
      return localStorage.getItem(PREFIX + k);
    } catch (e) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(PREFIX + k, v);
    } catch (e) {}
  }
  function uiLang() {
    return document.documentElement.lang === "th" ? "th" : "en";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function paintStreak(streak) {
    var chip = document.querySelector("[data-streak]");
    if (!chip || !streak) return;
    if (streak.current > 0) {
      chip.hidden = false;
      chip.innerHTML = "&#127769; <b>" + streak.current + "</b>";
    }
    try {
      var days = JSON.parse(lsGet("days") || "[]");
      if (streak.activeToday) {
        var today = new Date();
        var ds = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
        if (days.indexOf(ds) < 0) {
          days.push(ds);
          lsSet("days", JSON.stringify(days.slice(-60)));
        }
      }
    } catch (e) {}
  }

  function paintQuota(quota) {
    if (!quota) return;
    var remaining = Math.max(0, (quota.limit || 3) - (quota.used || 0));
    lsSet("quota", JSON.stringify({ day: new Date().toISOString().slice(0, 10), used: quota.used || 0 }));
    var row = document.querySelector(".quota");
    if (!row) return;
    var pips = row.querySelectorAll(".pip");
    for (var i = 0; i < pips.length; i++) {
      pips[i].classList.toggle("on", i < remaining);
    }
    var label = row.querySelector("[data-quota-label]");
    if (label) {
      label.textContent = uiLang() === "th"
        ? "\u0e40\u0e2b\u0e25\u0e37\u0e2d " + remaining + "/3 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49"
        : remaining + " of 3 questions left today";
    }
  }

  function dailyCardHtml(daily, lang) {
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
      "</div>" +
      '<button type="button" class="btn btn-outline daily-share">' +
      (uiLang() === "th" ? "\u0e41\u0e0a\u0e23\u0e4c\u0e14\u0e27\u0e07" : "Share") + "</button></div>"
    );
  }

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".daily-share") : null;
    if (b && window.TarotShare) {
      e.preventDefault();
      window.TarotShare.open("daily", null);
    }
  });

  // Daily card lives in a compact bar; the full card opens in a modal.
  var dailyState = null;

  function dailyModal() {
    var sheet = document.getElementById("daily-sheet");
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "daily-sheet";
    sheet.className = "sheet";
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="panel daily-panel" role="dialog" aria-modal="true" aria-label="Daily card">' +
      '<button type="button" class="btn btn-outline daily-close"></button>' +
      '<div class="daily-modal-body"></div></div>';
    document.body.appendChild(sheet);
    sheet.querySelector(".daily-close").textContent = uiLang() === "th" ? "\u0e1b\u0e34\u0e14" : "Close";
    sheet.querySelector(".daily-close").addEventListener("click", closeDaily);
    sheet.addEventListener("click", function (e) { if (e.target === sheet) closeDaily(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !sheet.hidden) closeDaily(); });
    return sheet;
  }

  function closeDaily() {
    var sheet = document.getElementById("daily-sheet");
    if (sheet) sheet.hidden = true;
  }

  function openDaily() {
    var sheet = dailyModal();
    var body = sheet.querySelector(".daily-modal-body");
    var lang = uiLang();
    if (dailyState && dailyState.card) {
      body.innerHTML = dailyCardHtml(dailyState, lang);
    } else {
      var prompt = lang === "th" ? "\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13" : "Your card for today";
      var tap = lang === "th" ? "\u0e41\u0e15\u0e30\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1b\u0e34\u0e14\u0e44\u0e1e\u0e48" : "Tap to reveal";
      body.innerHTML =
        '<p class="daily-prompt">' + esc(prompt) + "</p>" +
        '<button type="button" class="daily-tap" id="daily-reveal"><span class="card-back" aria-hidden="true"></span><span>' +
        esc(tap) + "</span></button>";
      var btn = document.getElementById("daily-reveal");
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          var res = await fetch("/api/daily", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lang: uiLang() }),
          });
          if (!res.ok) throw new Error("draw failed");
          var data = await res.json();
          dailyState = data;
          body.innerHTML = dailyCardHtml(data, data.lang || uiLang());
          if (data.streak) paintStreak(data.streak);
          paintDailyBar();
        } catch (e) {
          btn.disabled = false;
        }
      });
    }
    sheet.hidden = false;
    var close = sheet.querySelector(".daily-close");
    if (close) close.focus();
  }

  function paintDailyBar() {
    var box = document.getElementById("daily");
    if (!box) return;
    var lang = uiLang();
    var prompt = lang === "th" ? "\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13" : "Your card for today";
    // Just a button; the card itself opens entirely in the modal.
    var label = prompt + (dailyState && dailyState.card ? " \u00b7 " + dailyState.card.name : "");
    box.innerHTML =
      '<button type="button" class="btn btn-outline daily-open-btn" id="daily-open">' + esc(label) + "</button>";
    var open = document.getElementById("daily-open");
    if (open) open.addEventListener("click", openDaily);
  }

  function paintDaily(daily, lang) {
    var box = document.getElementById("daily");
    if (!box) return;
    dailyState = daily && daily.card ? daily : null;
    paintDailyBar();
  }

  async function summary() {
    var res = await fetch("/api/me/summary", { credentials: "include" });
    var data = await res.json();
    if (!data.user) {
      await fetch("/api/auth/sign-in/anonymous", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      res = await fetch("/api/me/summary", { credentials: "include" });
      data = await res.json();
    }
    return data;
  }

  function load() {
    return summary()
      .then(function (data) {
        window.TarotHome.data = data;
        paintStreak(data.streak);
        paintQuota(data.quota);
        paintDaily(data.today && data.today.daily, (data.prefs && data.prefs.lang) || uiLang());
        try {
          var e = new CustomEvent("tarot:summary", { detail: data });
          document.dispatchEvent(e);
        } catch (err) {}
      })
      .catch(function () {});
  }

  window.TarotHome = window.TarotHome || {};
  window.TarotHome.refresh = load;
  load();
})();
