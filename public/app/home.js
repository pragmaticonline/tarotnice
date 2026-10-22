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
        ? "เหลือ " + remaining + "/3 คำถามวันนี้"
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
      (daily.card.reversed ? (lang === "th" ? " (กลับหัว)" : " (reversed)") : "") + "</p>" +
      "<p class="daily-msg">" + esc(daily.message) + "</p>" +
      (colour ? '<p class="daily-lucky">' + esc(colour) + "</p>" : "") +
      "</div></div>"
    );
  }

  function paintDaily(daily, lang) {
    var box = document.getElementById("daily");
    if (!box) return;
    if (daily && daily.card) {
      box.innerHTML = dailyCardHtml(daily, lang);
      return;
    }
    var prompt = lang === "th" ? "ไพ่ประจำวันของคุณ" : "Your card for today";
    var tap = lang === "th" ? "แตะเพื่อเปิดไพ่" : "Tap to reveal";
    box.innerHTML =
      '<p class="daily-prompt">' + esc(prompt) + "</p>" +
      '<button type="button" class="daily-tap" id="daily-tap"><span class="card-back" aria-hidden="true"></span><span>' +
      esc(tap) + "</span></button>";
    var btn = document.getElementById("daily-tap");
    if (btn) {
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
          box.innerHTML = dailyCardHtml(data, data.lang || uiLang());
          if (data.streak) paintStreak(data.streak);
        } catch (e) {
          btn.disabled = false;
        }
      });
    }
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
