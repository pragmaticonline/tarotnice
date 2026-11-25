// My journey: collection group toggles + invite-link copy.
// Day/month/suit navigation is server-rendered links; check-in claim
// lives below (no page reload).
(function () {
  "use strict";

  function init() {
    document.querySelectorAll("[data-coll-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") !== "false";
        var next = !open;
        btn.setAttribute("aria-expanded", next ? "true" : "false");
        var grid = btn.parentElement ? btn.parentElement.querySelector("[data-coll-grid]") : null;
        if (grid) grid.hidden = !next;
        var chev = btn.querySelector("[data-coll-chevron]");
        if (chev) chev.style.transform = next ? "" : "rotate(-90deg)";
      });
    });
    document.querySelectorAll("[data-copy-invite]").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy-invite") || "";
        var done = function () {
          var old = btn.textContent;
          btn.textContent = btn.getAttribute("data-copied") || "Copied";
          setTimeout(function () { btn.textContent = old; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(done);
        } else { done(); }
      });
    });
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
    ["[data-checkin-dot]", "[data-checkin-dot-menu]", "[data-checkin-claim]"].forEach(function (sel) {
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
    var stamp = document.querySelector('[data-ci-stamp][data-state="today"]');
    if (stamp) {
      stamp.setAttribute("data-state", "gotToday");
      stamp.style.background = "#4a3d78";
      stamp.style.border = "2px solid #4a3d78";
      stamp.style.animation = "none";
      var kids = stamp.children;
      if (kids && kids.length >= 3) {
        kids[0].style.color = "#f3dca6";
        kids[2].style.color = "#fffaf2";
      }
      var icon = stamp.querySelector("[data-ci-icon]");
      if (icon) {
        icon.textContent = "\u2713";
        icon.style.background = "#f3dca6";
        icon.style.color = "#4a3d78";
        icon.style.border = "0";
      }
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
