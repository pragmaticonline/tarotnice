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
  // Bangkok calendar day ("YYYY-MM-DD"). Bangkok is fixed UTC+7, no
  // DST — the same rule the server uses for quota boundaries. The
  // previous code stored a UTC day here, which flips at the wrong
  // midnight (up to 7h early).
  function bangkokDayString(now) {
    return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
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
    lsSet("quota", JSON.stringify({ day: bangkokDayString(Date.now()), used: quota.used || 0 }));
    var row = document.querySelector(".quota");
    if (!row) return;
    var label = row.querySelector("[data-quota-label]");
    if (label) {
      var limit = quota.limit || 3;
      label.textContent = uiLang() === "th"
        ? "\u0e40\u0e2b\u0e25\u0e37\u0e2d " + remaining + "/" + limit + " \u0e04\u0e33\u0e16\u0e32\u0e21\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49"
        : remaining + " of " + limit + " questions left today";
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

  // Quota is per Bangkok day, but this tab used to fetch it once
  // per page load — a tab left open overnight kept showing
  // yesterday's remaining count. Re-arm a one-shot refresh for the
  // next server reset, and refresh whenever the tab becomes visible
  // again (throttled so rapid tab-switching stays cheap).
  var resetTimer = null;
  var lastLoad = 0;
  function armReset(resetsAt) {
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = null;
    if (typeof resetsAt !== "number" || !(resetsAt > 0)) return;
    var delay = resetsAt - Date.now() + 2000;
    if (delay < 0) delay = 0;
    // setTimeout caps at ~24.8 days; a quota reset is hours away.
    resetTimer = setTimeout(function () { load(); }, Math.min(delay, 86400000));
  }
  function load() {
    lastLoad = Date.now();
    return summary()
      .then(function (data) {
        window.TarotHome.data = data;
        paintStreak(data.streak);
        paintQuota(data.quota);
        armReset(data.quota && data.quota.resetsAt);
        try {
          var e = new CustomEvent("tarot:summary", { detail: data });
          document.dispatchEvent(e);
        } catch (err) {}
      })
      .catch(function () {});
  }
  function maybeRefresh() {
    // Visible again after >60s away: the day may have rolled over.
    if (Date.now() - lastLoad > 60000) load();
  }

  window.TarotHome = window.TarotHome || {};
  window.TarotHome.refresh = load;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") maybeRefresh();
  });
  window.addEventListener("focus", maybeRefresh);
  window.addEventListener("pageshow", maybeRefresh);
  load();
})();
