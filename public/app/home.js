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
