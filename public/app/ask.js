// Ask flow: submit question -> POST /api/readings -> collapse the
// form -> TarotDraw shuffle/fan/pick/flip -> stream the reading.
// Crisis replies and quota/rate-limit states render in place; failed
// readings offer Try again on the same cards.
(function () {
  "use strict";

  function uiLang() {
    return document.documentElement.lang === "th" ? "th" : "en";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function setGuide(state) {
    var g = document.getElementById("guide");
    if (g) g.className = "guide s-" + state;
  }
  function bubble(msg) {
    // Route to the visible step's cat: step 1 owns #guide-ask, the
    // draw and reading steps own #guide. (The old step-draw check was
    // true on both step 1 and step 3, and raced the 280ms step-2→3
    // transition — completion text landed on a hidden cat while
    // step 1 kept stale wait lines.)
    var askSec = document.querySelector('[data-step="1"]');
    var onAsk = !askSec || askSec.hidden === false;
    var b = document.querySelector(onAsk ? "#guide-ask .bubble" : "#guide .bubble");
    if (b && msg) b.textContent = msg;
  }

  // Wizard navigation: 1 ask -> 2 draw -> 3 reading, same URL.
  function showStep(n, push) {
    [1, 2, 3].forEach(function (k) {
      var sec = document.querySelector('[data-step="' + k + '"]');
      if (sec) sec.hidden = k !== n;
      var ind = document.querySelector('[data-step-ind="' + k + '"]');
      if (ind) {
        ind.classList.toggle("on", k <= n);
        var lbl = ind.querySelector(".step-label");
        if (lbl) {
          if (!lbl.dataset.base) lbl.dataset.base = lbl.textContent.replace(/^[0-9]+\s*/, "");
          lbl.textContent = (k < n ? "\u2713 " : k === n ? k + " \u00b7 " : k + " ") + lbl.dataset.base;
        }
      }
    });
    if (push) {
      try { history.pushState({ step: n }, ""); } catch (e) {}
    }
    window.scrollTo(0, 0);
  }
  var annoyedTimer = null;

  function sleepNgern() {
    document.querySelectorAll("#guide .ngern-wrap, #guide-ask .ngern-wrap").forEach(function (wrap) {
      // Remember the awake cat so a poke can wake her briefly.
      if (!wrap.dataset.awake && wrap.querySelector(".ngern")) wrap.dataset.awake = wrap.innerHTML;
      wrap.innerHTML = '<img src="/mascot/ngern-sleeping.svg" alt="Ngern the Korat cat" width="120" height="120">';
    });
    setGuide("sleep");
    var ga = document.getElementById("guide-ask");
    if (ga) ga.className = "guide guide-ask s-sleep";
  }

  // Clicking the sleeping cat: she wakes, complains, and goes back
  // to sleep a couple of seconds later.
  function pokeSleep(wrap) {
    var guide = wrap.closest ? wrap.closest(".guide") : null;
    if (!guide || !guide.classList.contains("s-sleep")) return;
    if (wrap.dataset.awake) wrap.innerHTML = wrap.dataset.awake;
    guide.classList.remove("s-sleep");
    guide.classList.add("s-done");
    var b = guide.querySelector(".bubble");
    if (b) b.textContent = uiLang() === "th"
      ? "\u0e40\u0e2e\u0e49\u0e22! \u0e01\u0e33\u0e25\u0e31\u0e07\u0e19\u0e2d\u0e19\u0e2d\u0e22\u0e39\u0e48\u0e40\u0e25\u0e22 \u0e02\u0e2d\u0e2d\u0e35\u0e01\u0e41\u0e1b\u0e4a\u0e1a\u0e19\u0e30\u2026"
      : "Hey! I was sleeping\u2026 five more minutes\u2026";
    clearTimeout(annoyedTimer);
    annoyedTimer = setTimeout(function () {
      sleepNgern();
      bubble(t("sleep"));
    }, 2400);
  }

  // Every few idle minutes a mouse dashes across the home guide and
  // Ngern's pupils glance after it: toward entry, across, then release.
  // Idle-only (step 1, s-idle, no nudge in progress, tab visible) and
  // skipped entirely under prefers-reduced-motion.
  var MOUSE_SVG = '<svg viewBox="0 0 64 26" aria-hidden="true"><path d="M8 21Q2 19 5 8" stroke="#8a93a8" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="16" rx="20" ry="9" fill="#8a93a8"/><circle cx="49" cy="11" r="8" fill="#8a93a8"/><circle cx="44" cy="4" r="4.5" fill="#8a93a8"/><circle cx="44" cy="4" r="2" fill="#e3b3bb"/><circle cx="51.5" cy="10" r="1.6" fill="#1c2419"/></svg>';
  var MOUSE_WAIT = 5 * 60 * 1000;
  var MOUSE_RUN = 3600;
  function mouseRun() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var askSec = document.querySelector('[data-step="1"]');
    var guide = document.getElementById("guide-ask");
    if (!askSec || askSec.hidden !== false) return;
    if (!guide || !guide.classList.contains("s-idle") || guide.classList.contains("s-nudge")) return;
    if (document.visibilityState === "hidden") return;
    if (guide.querySelector(".mouse-run")) return;
    var fromLeft = Math.random() < 0.5;
    var m = document.createElement("div");
    m.className = "mouse-run " + (fromLeft ? "ltr" : "rtl");
    m.setAttribute("aria-hidden", "true");
    m.innerHTML = MOUSE_SVG;
    guide.appendChild(m);
    var pupils = guide.querySelectorAll(".pupil");
    var look = function (x) {
      for (var i = 0; i < pupils.length; i++) pupils[i].style.transform = "translate(" + x + "px,1px)";
    };
    look(fromLeft ? -3.5 : 3.5);
    setTimeout(function () { look(fromLeft ? 3.5 : -3.5); }, MOUSE_RUN / 2);
    setTimeout(function () {
      for (var i = 0; i < pupils.length; i++) pupils[i].style.transform = "";
      if (m.parentNode) m.parentNode.removeChild(m);
      else if (m.remove) m.remove();
    }, MOUSE_RUN + 200);
  }

  // Tapping the idle home cat: a playful hurry-up that yields back to
  // the idle hint. Gated on s-idle so shuffling, waiting and sleeping
  // states keep their own bubble text.
  var hurryTimer = null;
  function pokeIdle(wrap) {
    var guide = wrap.closest ? wrap.closest("#guide-ask") : null;
    if (!guide || !guide.classList.contains("s-idle")) return;
    bubble(t("hurry"));
    if (guide.classList.add) guide.classList.add("s-nudge");
    if (hurryTimer) clearTimeout(hurryTimer);
    hurryTimer = setTimeout(function () {
      hurryTimer = null;
      if (guide.classList.remove) guide.classList.remove("s-nudge");
      if (idleBubble) bubble(idleBubble);
    }, 2500);
  }

  var STR = {
    en: {
      need: "Type your question first, then shuffle.",
      slowDown: "Too many questions from this connection right now. Wait a little while, then try again.",
      disclaimer: "Tarotnice readings are provided for entertainment, reflection, and personal insight only. They are not professional advice of any kind, including medical, psychological, legal, financial, or business advice. Please use your own judgment; any decision or action you take based on a reading is at your own discretion and solely your responsibility. For important matters, consult a qualified professional. Tarotnice hopes these readings help you see new possibilities and understand yourself better. Ultimately, the power to choose your path is always yours.",
      slowDay: "This connection has reached today's question limit. It resets at midnight (Bangkok time).",
      sleep: "Ngern is resting now. New questions tomorrow.",
      hurry: "Take your time \u2014 but the cards are waiting. Type your question below!",
      browse: "Browse the card library",
      crisis: "Support",
      retry: "Try again",
      followUp: "Follow up",
      followUpOn: "This is a follow-up on \u201c{q}\u201d",
      blocked: "Please try again in a moment.",
      failed: "Ngern couldn't read the cards right now. Try again \u2014 your question is saved on the same cards.",
      noModel: "Readings are warming up. Your cards are drawn \u2014 please try again in a bit.",
      newIn: "New questions in ",
      shareToday: "Share today's reading",
      needTokens: "You're out of free tokens for today",
      needTokensText: "Each question costs 5 tokens. Packs start at 50 tokens — pay by PromptPay QR or card.",
      buyTokens: "Get tokens",
      registerFirst: "Create a free account to keep asking",
      registerFirstText: "Today's free question is used. Create a free account to use tokens for more questions — your reading moves into your account automatically.",
      registerCta: "Create free account",
      signInCta: "Sign in",
      lineFriend: "Add \"Nong Ngern\" (Tarotnice) on LINE for a chance to receive free token codes on special occasions!",
      lineFriendCta: "Add as a friend",
    },
    th: {
      need: "\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e16\u0e32\u0e21\u0e01\u0e48\u0e2d\u0e19\u0e19\u0e30 \u0e41\u0e25\u0e49\u0e27\u0e04\u0e48\u0e2d\u0e22\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48",
      slowDown: "\u0e16\u0e32\u0e21\u0e15\u0e34\u0e14\u0e46 \u0e01\u0e31\u0e19\u0e40\u0e22\u0e2d\u0e30\u0e44\u0e1b\u0e19\u0e34\u0e14 \u0e23\u0e2d\u0e2a\u0e31\u0e01\u0e41\u0e1b\u0e4a\u0e1a\u0e41\u0e25\u0e49\u0e27\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48\u0e19\u0e30",
      slowDay: "\u0e01\u0e32\u0e23\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e15\u0e48\u0e2d\u0e19\u0e35\u0e49\u0e16\u0e36\u0e07\u0e08\u0e33\u0e19\u0e27\u0e19\u0e04\u0e33\u0e16\u0e32\u0e21\u0e2a\u0e39\u0e07\u0e2a\u0e38\u0e14\u0e02\u0e2d\u0e07\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e41\u0e25\u0e49\u0e27 \u0e23\u0e35\u0e40\u0e0b\u0e47\u0e15\u0e40\u0e17\u0e35\u0e48\u0e22\u0e07\u0e04\u0e37\u0e19 (\u0e40\u0e27\u0e25\u0e32\u0e1b\u0e23\u0e30\u0e40\u0e17\u0e28\u0e44\u0e17\u0e22)",
      sleep: "\u0e40\u0e07\u0e34\u0e19\u0e02\u0e2d\u0e1e\u0e31\u0e01\u0e01\u0e48\u0e2d\u0e19\u0e19\u0e30 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e21\u0e48\u0e1e\u0e23\u0e38\u0e48\u0e07\u0e19\u0e35\u0e49",
      hurry: "\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e23\u0e35\u0e1a \u2014 \u0e41\u0e15\u0e48\u0e44\u0e1e\u0e48\u0e23\u0e2d\u0e2d\u0e22\u0e39\u0e48 \u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e16\u0e32\u0e21\u0e14\u0e49\u0e32\u0e19\u0e25\u0e48\u0e32\u0e07\u0e40\u0e25\u0e22",
      browse: "\u0e40\u0e1b\u0e34\u0e14\u0e2b\u0e49\u0e2d\u0e07\u0e2a\u0e21\u0e38\u0e14\u0e44\u0e1e\u0e48",
      crisis: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e43\u0e08",
      retry: "\u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07",
      disclaimer: "\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e08\u0e32\u0e01 Tarotnice \u0e21\u0e35\u0e44\u0e27\u0e49\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1a\u0e31\u0e19\u0e40\u0e17\u0e34\u0e07 \u0e01\u0e32\u0e23\u0e17\u0e1a\u0e17\u0e27\u0e19\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07 \u0e41\u0e25\u0e30\u0e21\u0e38\u0e21\u0e21\u0e2d\u0e07\u0e2a\u0e48\u0e27\u0e19\u0e1a\u0e38\u0e04\u0e04\u0e25\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19 \u0e44\u0e21\u0e48\u0e16\u0e37\u0e2d\u0e40\u0e1b\u0e47\u0e19\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33\u0e17\u0e32\u0e07\u0e27\u0e34\u0e0a\u0e32\u0e0a\u0e35\u0e1e\u0e43\u0e19\u0e14\u0e49\u0e32\u0e19\u0e43\u0e14 \u0e46 \u0e17\u0e31\u0e49\u0e07\u0e14\u0e49\u0e32\u0e19\u0e01\u0e32\u0e23\u0e41\u0e1e\u0e17\u0e22\u0e4c \u0e08\u0e34\u0e15\u0e27\u0e34\u0e17\u0e22\u0e32 \u0e01\u0e0e\u0e2b\u0e21\u0e32\u0e22 \u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19 \u0e2b\u0e23\u0e37\u0e2d\u0e18\u0e38\u0e23\u0e01\u0e34\u0e08 \u0e42\u0e1b\u0e23\u0e14\u0e43\u0e0a\u0e49\u0e27\u0e34\u0e08\u0e32\u0e23\u0e13\u0e0d\u0e32\u0e13\u0e02\u0e2d\u0e07\u0e17\u0e48\u0e32\u0e19\u0e40\u0e2d\u0e07 \u0e01\u0e32\u0e23\u0e15\u0e31\u0e14\u0e2a\u0e34\u0e19\u0e43\u0e08\u0e2b\u0e23\u0e37\u0e2d\u0e01\u0e32\u0e23\u0e01\u0e23\u0e30\u0e17\u0e33\u0e43\u0e14 \u0e46 \u0e17\u0e35\u0e48\u0e40\u0e01\u0e34\u0e14\u0e08\u0e32\u0e01\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e19\u0e35\u0e49 \u0e16\u0e37\u0e2d\u0e40\u0e1b\u0e47\u0e19\u0e14\u0e38\u0e25\u0e22\u0e1e\u0e34\u0e19\u0e34\u0e08\u0e41\u0e25\u0e30\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e1a\u0e1c\u0e34\u0e14\u0e0a\u0e2d\u0e1a\u0e02\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e41\u0e15\u0e48\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e1c\u0e39\u0e49\u0e40\u0e14\u0e35\u0e22\u0e27 Tarotnice \u0e44\u0e21\u0e48\u0e21\u0e35\u0e2a\u0e48\u0e27\u0e19\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e02\u0e49\u0e2d\u0e07\u0e41\u0e25\u0e30\u0e44\u0e21\u0e48\u0e23\u0e31\u0e1a\u0e1c\u0e34\u0e14\u0e0a\u0e2d\u0e1a\u0e15\u0e48\u0e2d\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c \u0e04\u0e27\u0e32\u0e21\u0e2a\u0e39\u0e0d\u0e40\u0e2a\u0e35\u0e22 \u0e2b\u0e23\u0e37\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e35\u0e22\u0e2b\u0e32\u0e22\u0e43\u0e14 \u0e46 \u0e17\u0e35\u0e48\u0e40\u0e01\u0e34\u0e14\u0e02\u0e36\u0e49\u0e19\u0e08\u0e32\u0e01\u0e01\u0e32\u0e23\u0e19\u0e33\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e44\u0e1b\u0e43\u0e0a\u0e49 \u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e2a\u0e33\u0e04\u0e31\u0e0d \u0e40\u0e23\u0e32\u0e41\u0e19\u0e30\u0e19\u0e33\u0e43\u0e2b\u0e49\u0e1b\u0e23\u0e36\u0e01\u0e29\u0e32\u0e1c\u0e39\u0e49\u0e40\u0e0a\u0e35\u0e48\u0e22\u0e27\u0e0a\u0e32\u0e0d\u0e43\u0e19\u0e14\u0e49\u0e32\u0e19\u0e19\u0e31\u0e49\u0e19\u0e42\u0e14\u0e22\u0e15\u0e23\u0e07 Tarotnice \u0e2b\u0e27\u0e31\u0e07\u0e27\u0e48\u0e32\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e19\u0e35\u0e49\u0e08\u0e30\u0e0a\u0e48\u0e27\u0e22\u0e43\u0e2b\u0e49\u0e04\u0e38\u0e13\u0e40\u0e2b\u0e47\u0e19\u0e04\u0e27\u0e32\u0e21\u0e40\u0e1b\u0e47\u0e19\u0e44\u0e1b\u0e44\u0e14\u0e49\u0e43\u0e2b\u0e21\u0e48 \u0e46 \u0e41\u0e25\u0e30\u0e40\u0e02\u0e49\u0e32\u0e43\u0e08\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07\u0e21\u0e32\u0e01\u0e02\u0e36\u0e49\u0e19 \u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22\u0e41\u0e25\u0e49\u0e27 \u0e2d\u0e33\u0e19\u0e32\u0e08\u0e43\u0e19\u0e01\u0e32\u0e23\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07\u0e40\u0e1b\u0e47\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e40\u0e2a\u0e21\u0e2d",
      followUp: "\u0e16\u0e32\u0e21\u0e15\u0e48\u0e2d",
      followUpOn: "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e15\u0e48\u0e2d\u0e08\u0e32\u0e01 \u201c{q}\u201d",
      blocked: "\u0e02\u0e2d\u0e2d\u0e20\u0e31\u0e22 \u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e43\u0e19\u0e2d\u0e35\u0e01\u0e2a\u0e31\u0e01\u0e04\u0e23\u0e39\u0e48",
      failed: "\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49 \u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e2d\u0e22\u0e39\u0e48\u0e01\u0e31\u0e1a\u0e44\u0e1e\u0e48\u0e0a\u0e38\u0e14\u0e40\u0e14\u0e34\u0e21",
      noModel: "\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e15\u0e31\u0e27 \u0e44\u0e1e\u0e48\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e08\u0e31\u0e48\u0e27\u0e41\u0e25\u0e49\u0e27 \u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e43\u0e19\u0e2d\u0e35\u0e01\u0e2a\u0e31\u0e01\u0e04\u0e23\u0e39\u0e48",
      newIn: "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e21\u0e48\u0e43\u0e19\u0e2d\u0e35\u0e01 ",
      shareToday: "\u0e41\u0e0a\u0e23\u0e4c\u0e14\u0e27\u0e07\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49",
      needTokens: "\u0e43\u0e0a\u0e49\u0e42\u0e17\u0e40\u0e04\u0e19\u0e1f\u0e23\u0e35\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e2b\u0e21\u0e14\u0e41\u0e25\u0e49\u0e27 \u0e40\u0e15\u0e34\u0e21\u0e42\u0e17\u0e40\u0e04\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e16\u0e32\u0e21\u0e15\u0e48\u0e2d\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22",
      needTokensText: "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e25\u0e30 5 \u0e42\u0e17\u0e40\u0e04\u0e19 \u0e41\u0e1e\u0e47\u0e01\u0e40\u0e23\u0e34\u0e48\u0e21\u0e15\u0e49\u0e19 50 \u0e42\u0e17\u0e40\u0e04\u0e19 \u0e08\u0e48\u0e32\u0e22\u0e14\u0e49\u0e27\u0e22 PromptPay \u0e2b\u0e23\u0e37\u0e2d\u0e1a\u0e31\u0e15\u0e23\u0e44\u0e14\u0e49",
      buyTokens: "\u0e40\u0e15\u0e34\u0e21\u0e42\u0e17\u0e40\u0e04\u0e19",
      registerFirst: "\u0e2a\u0e21\u0e31\u0e04\u0e23\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e01\u0e48\u0e2d\u0e19\u0e16\u0e32\u0e21\u0e15\u0e48\u0e2d\u0e19\u0e30",
      registerFirstText: "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e1f\u0e23\u0e35\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e43\u0e0a\u0e49\u0e2b\u0e21\u0e14\u0e41\u0e25\u0e49\u0e27 \u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e0a\u0e49\u0e42\u0e17\u0e40\u0e04\u0e19\u0e16\u0e32\u0e21\u0e15\u0e48\u0e2d \u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e17\u0e35\u0e48\u0e1c\u0e48\u0e32\u0e19\u0e21\u0e32\u0e08\u0e30\u0e22\u0e49\u0e32\u0e22\u0e40\u0e02\u0e49\u0e32\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e43\u0e2b\u0e49\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34",
      registerCta: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35",
      signInCta: "\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a",
      lineFriend: "\u0e40\u0e1e\u0e34\u0e48\u0e21 \"Nong Ngern\" (Tarotnice) \u0e40\u0e1b\u0e47\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e1a\u0e19 LINE \u0e23\u0e31\u0e1a\u0e42\u0e2d\u0e01\u0e32\u0e2a\u0e44\u0e14\u0e49\u0e23\u0e2b\u0e31\u0e2a\u0e42\u0e17\u0e40\u0e04\u0e47\u0e19\u0e1f\u0e23\u0e35\u0e43\u0e19\u0e42\u0e2d\u0e01\u0e32\u0e2a\u0e1e\u0e34\u0e40\u0e28\u0e29!",
      lineFriendCta: "\u0e40\u0e1e\u0e34\u0e48\u0e40\u0e1b\u0e47\u0e19\u0e40\u0e1b\u0e47\u0e37\u0e48\u0e19\u0e40\u0e1b\u0e47\u0e37\u0e48\u0e19",
    },
  };
  function t(k) {
    return (STR[uiLang()] || STR.en)[k];
  }

  function stripEdgeQuotes(s) {
    return String(s == null ? "" : s).replace(/^[\s\u201c\u201d"']+|[\s\u201c\u201d"']+$/g, "");
  }
  // The ask-form label names the reading a follow-up continues, so a
  // follow-up never looks like a fresh question. The server-rendered
  // default is captured on first use and restored for fresh asks.
  function setFollowupLabel(original) {
    var q = stripEdgeQuotes(original);
    if (!q) return;
    var lbl = document.getElementById("ask-label");
    if (!lbl) return;
    if (!lbl.dataset.followDefault) lbl.dataset.followDefault = lbl.textContent;
    var tpl = t("followUpOn") || "This is a follow-up on \u201c{q}\u201d";
    lbl.textContent = tpl.replace("{q}", q);
    var row = document.getElementById("fresh-ask-row");
    if (row) row.hidden = false;
  }
  function resetAskLabel() {
    var lbl = document.getElementById("ask-label");
    if (lbl && lbl.dataset.followDefault) lbl.textContent = lbl.dataset.followDefault;
    var row = document.getElementById("fresh-ask-row");
    if (row) row.hidden = true;
  }
  // True fresh start, like a first visit: step 1, default label, empty
  // question, no topic chip, idle Ngern. Both fresh entries ("Ask a
  // different question instead?" and "Ask something new") use it.
  function freshStart() {
    showStep(1);
    resetAskLabel();
    window.__tnTopic = "general";
    document.querySelectorAll("[data-suggest].on").forEach(function (x) { x.classList.remove("on"); });
    var qf = document.getElementById("q");
    if (qf) { qf.value = ""; qf.focus(); }
    var ce = document.getElementById("q-count");
    if (ce) ce.textContent = "0";
    if (window.TarotHome) window.TarotHome.refresh();
    if (cannotAfford()) {
      // No tokens to ask with: leave the resting state alone (no idle
      // bubble over a sleeping cat) and route to top-up like any other
      // ask attempt. The box above is already empty, so nothing is
      // saved as a pending question.
      gateInsufficient();
      return;
    }
    if (sleeping) {
      // Quota-exhausted with tokens in hand: the staged question above
      // is clean; the resting cat, bubble and countdown stay as they are.
      return;
    }
    if (idleBubble) bubble(idleBubble);
  }
  function currentReadingQuestion() {
    var rq = document.getElementById("read-q");
    return rq ? stripEdgeQuotes(rq.textContent) : "";
  }

  function countdown(resetsAt) {
    var left = Math.max(0, resetsAt - Date.now());
    var h = Math.floor(left / 3600000);
    var m = Math.floor((left % 3600000) / 60000);
    return h + ":" + String(m).padStart(2, "0");
  }

  // Whether the ask step is parked in quota-exhausted sleep. Only
  // sleepMode sets it; only wakeMode clears it. The form stays enabled
  // throughout: the submit and document-click gates route every tap
  // while gated, so no tap ever lands on a dead control.
  var sleeping = false;
  // The idle hint, captured at init so wakeMode can restore it after
  // sleepMode overwrote the bubble.
  var idleBubble = null;

  function sleepMode(resetsAt) {
    sleeping = true;
    sleepNgern();
    bubble(t("sleep"));
    var mount = null; // sleep state stays on step 1 now
    var html = "<p>" + esc(t("sleep")) + "</p>";
    if (resetsAt) html += '<p class="countdown">' + esc(t("newIn")) + esc(countdown(resetsAt)) + "</p>";
    html += '<p><a class="btn btn-outline" href="/cards">' + esc(t("browse")) + "</a></p>";
    if (mount) mount.innerHTML = html;
    else bubble(t("sleep"));
  }

  // Quota reset while the tab stayed open: undo sleepMode (wake
  // Ngern, restore the idle hint) so the fresh quota from
  // TarotHome.refresh() is actually askable.
  function wakeMode() {
    if (!sleeping) return;
    sleeping = false;
    document.querySelectorAll("#guide .ngern-wrap, #guide-ask .ngern-wrap").forEach(function (wrap) {
      if (wrap.dataset.awake) wrap.innerHTML = wrap.dataset.awake;
    });
    var g = document.getElementById("guide");
    if (g) g.className = "guide s-idle";
    var ga = document.getElementById("guide-ask");
    if (ga) ga.className = "guide guide-ask s-idle";
    if (idleBubble) bubble(idleBubble);
  }

  function collapseForm(question, topicLabel) {
    var form = document.getElementById("ask-form");
    if (!form) return;
    var wrap = document.createElement("div");
    wrap.className = "asked";
    wrap.innerHTML = '<p class="topic-chip">' + esc(topicLabel) + "</p>" +
      '<blockquote class="question">&ldquo;' + esc(question) + "&rdquo;</blockquote>";
    form.replaceWith(wrap);
  }

  // Under-5-tokens gate: with no question left (tokens remaining < 1
  // question), trying to ask routes out instead of failing at the
  // server. Guests go to sign-in with billing as the return (after
  // login they land on billing to top up); registered users go
  // straight to billing. The typed question is kept in sessionStorage
  // and restored when they come back to the ask box.
  var lastSummary = null;
  function summaryData() {
    return lastSummary || (window.TarotHome && window.TarotHome.data) || null;
  }
  function cannotAfford() {
    var d = summaryData();
    if (!d || d.openReading) return false;
    if (d.tokens) return (d.tokens.remaining || 0) < 1;
    return false;
  }
  function savePendingQuestion() {
    try {
      var q = document.getElementById("q");
      var v = q && q.value ? String(q.value).trim() : "";
      if (v) window.sessionStorage.setItem("tarotnice:pending-question", v);
    } catch (e) {}
  }
  function gateInsufficient() {
    savePendingQuestion();
    var d = summaryData();
    var reg = (d && d.user && !d.user.isAnonymous) || window.__tnRegistered;
    // Guests go straight to sign-in: the sheet's only guest action is a
    // sign-in link to the same destination. Registered users get the
    // top-up sheet (packs + redeem) while it is in the page.
    if (!reg) { location.href = "/sign-in?return=%2Fbilling"; return; }
    var sheet = document.getElementById("pack-sheet");
    if (sheet) { openPackSheet(); return; }
    location.href = "/billing";
  }

  // --- Top-up pack sheet (design boards: Top up / pack dialog) ---
  var sheetPack = "standard";
  var sheetCode = null;
  function openPackSheet() {
    var sheet = document.getElementById("pack-sheet");
    if (!sheet) return;
    var d = summaryData();
    var reg = (d && d.user && !d.user.isAnonymous) || window.__tnRegistered;
    var strings = window.__tnSheet || {};
    var balance = d && d.tokens ? Math.max(0, (d.tokens.balance || 0)) : 0;
    var bal = sheet.querySelector("[data-pack-balance]");
    if (bal) bal.textContent = (strings.topUpSub || "You have {n} tokens.").replace("{n}", String(balance));
    var pending = "";
    try { pending = window.sessionStorage.getItem("tarotnice:pending-question") || ""; } catch (e) {}
    var wrap = sheet.querySelector("[data-pack-pending-wrap]");
    var pEl = sheet.querySelector("[data-pack-pending]");
    if (wrap && pEl) { wrap.hidden = !pending; pEl.textContent = pending; }
    var guest = sheet.querySelector("[data-pack-guest]");
    if (guest) guest.hidden = !!reg;
    var pay = document.getElementById("pack-pay");
    if (pay) pay.hidden = !reg;
    var list = sheet.querySelector("[data-pack-list]");
    if (list && window.__tnPacks) {
      list.innerHTML = window.__tnPacks.map(function (p) {
        var popular = p.id === "standard";
        return '<label class="pack-radio' + (sheetPack === p.id ? " on" : "") + '">' +
          '<input type="radio" name="sheet-pack" value="' + esc(p.id) + '"' + (sheetPack === p.id ? " checked" : "") + ">" +
          "<span><b>" + p.tokens + " tokens</b> \u00b7 " + (strings.readingsCount || "{n} readings").replace("{n}", String(p.tokens / 5)) +
          (popular ? ' <span class="pack-badge">' + esc(strings.mostPopular || "Most popular") + "</span>" : "") +
          "</span><b>\u0e3f" + p.thb + "</b></label>";
      }).join("");
      list.querySelectorAll('input[name="sheet-pack"]').forEach(function (r) {
        r.addEventListener("change", function () {
          sheetPack = r.value;
          list.querySelectorAll(".pack-radio").forEach(function (x) { x.classList.toggle("on", x.contains(r)); });
        });
      });
    }
    sheet.hidden = false;
  }
  function closePackSheet() {
    var sheet = document.getElementById("pack-sheet");
    if (sheet) sheet.hidden = true;
  }
  function restorePendingQuestion() {
    try {
      var v = window.sessionStorage.getItem("tarotnice:pending-question");
      var q = document.getElementById("q");
      if (v && q && !q.value) q.value = v;
    } catch (e) {}
  }
  function clearPendingQuestion() {
    try { window.sessionStorage.removeItem("tarotnice:pending-question"); } catch (e) {}
  }

  function topicLabel(code) {
    var input = document.querySelector('#ask-form input[name="topic"][value="' + code + '"]');
    if (!input) return code;
    var span = input.parentElement.querySelector("span");
    return span ? span.textContent : code;
  }

  async function postReading(payload) {
    var res = await fetch("/api/readings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {}
    return { status: res.status, data: data || {} };
  }

  function readingMount() {
    var mount = document.getElementById("reading");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "reading";
      mount.className = "reading";
      var stage = document.getElementById("draw-stage");
      if (stage && stage.parentElement) stage.parentElement.insertBefore(mount, stage.nextSibling);
      else document.querySelector("main").appendChild(mount);
    }
    mount.innerHTML = "";
    return mount;
  }

  function againButton(mount, reading, remaining) {
    var row = document.createElement("div");
    row.className = "actions";
    if (window.TarotShare) {
      var share = document.createElement("button");
      share.type = "button";
      share.className = "btn";
      share.textContent = uiLang() === "th" ? "\u0e41\u0e0a\u0e23\u0e4c\u0e14\u0e27\u0e07" : "Share";
      share.addEventListener("click", function () {
        window.TarotShare.open("reading", reading.id);
      });
      row.appendChild(share);
    }
    // Always offer Ask again — even at 0 remaining. Hiding it stranded
    // free users after their daily question; asking again routes
    // through the normal login/buy flow on submit instead.
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline";
    btn.textContent = remaining > 0 ? t("followUp") + " (" + remaining + ")" : t("followUp");
    btn.addEventListener("click", function () {
      var orig = currentReadingQuestion();
      var q = document.getElementById("q");
      if (q) q.value = "";
      setFollowupLabel(orig);
      var form = document.getElementById("ask-form");
      var submitBtn = form && form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = false;
      showStep(1);
      if (window.TarotHome) window.TarotHome.refresh();
      if (q) q.focus();
    });
    row.appendChild(btn);
    mount.appendChild(row);
    // Post-reading LINE friend card: only after a reading, never on
    // the homepage, never as an unsolicited pop-up.
    var card = document.createElement("section");
    card.className = "line-friend-card";
    var p = document.createElement("p");
    p.textContent = t("lineFriend");
    var add = document.createElement("a");
    add.className = "btn line-add-btn";
    add.href = "https://line.me/R/add/@tarotnice";
    add.target = "_blank";
    add.rel = "noopener";
    add.textContent = t("lineFriendCta");
    card.appendChild(p);
    card.appendChild(add);
    mount.appendChild(card);
    var sd = summaryData();
    var guest = !sd || !sd.user || sd.user.isAnonymous;
    var gg = document.getElementById("guest-gate");
    if (gg) gg.hidden = !guest;
    if (remaining <= 0) sleepMode(null);
  }

  async function streamInto(mount, reading, lang, onDone) {
    window.TarotDraw.renderReading(mount, reading, lang, "/api/readings/" + reading.id + "/stream", {
      onDone: function (summary, full) {
        // Actions first, then the disclaimer above the footer
        // (layout order: Share/Ask again, then disclaimer).
        (onDone || function () {})(summary, full);
        var disc = document.createElement("p");
        disc.className = "disclaimer";
        disc.textContent = t("disclaimer");
        mount.appendChild(disc);
      },
      onFollowUp: function (question) {
        var orig = currentReadingQuestion();
        showStep(1);
        setFollowupLabel(orig);
        var q = document.getElementById("q");
        if (q) {
          q.value = question;
          q.focus();
        }
        // The finished reading left the submit button disabled
        // (submit() disables it; only Ask again re-enabled it).
        var form = document.getElementById("ask-form");
        var submitBtn = form && form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = false;
        if (window.TarotHome) window.TarotHome.refresh();
      },
      // "Ask something new" under Explore further: leave the reading
      // behind and start over like a first visit.
      onFreshAsk: function () {
        freshStart();
      },
      onError: function (kind) {
        var msg = document.createElement("p");
        msg.className = "reading-err";
        if (kind === "model_unset") {
          msg.textContent = t("noModel");
          mount.appendChild(msg);
          return;
        }
        msg.textContent = t("failed");
        mount.appendChild(msg);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn";
        btn.textContent = t("retry");
        btn.addEventListener("click", async function () {
          btn.disabled = true;
          try {
            var rr = await fetch("/api/readings/" + reading.id + "/retry", { method: "POST", credentials: "include" });
            if (rr.status === 402) {
              msg.textContent = t("needTokens");
              btn.textContent = t("buyTokens");
              btn.disabled = false;
              btn.addEventListener("click", function () { location.href = "/billing"; });
              return;
            }
            if (rr.status === 403) {
              msg.textContent = t("registerFirst");
              btn.textContent = t("registerCta");
              btn.disabled = false;
              btn.addEventListener("click", function () { location.href = "/register"; });
              return;
            }
          } catch (e) {}
          msg.remove();
          btn.remove();
          streamInto(mount, reading, lang, onDone);
        });
        mount.appendChild(btn);
      },
    });
  }

  function enterDraw(question, topicText) {
    var chip = document.getElementById("draw-topic");
    if (chip) chip.textContent = topicText;
    var dq = document.getElementById("draw-q");
    if (dq) dq.textContent = "\u201c" + question + "\u201d";
    showStep(2, true);
  }

  function enterRead(question, topicText, cards) {
    var eb = document.getElementById("read-eyebrow");
    if (eb) eb.textContent = uiLang() === "th" ? "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13" : "Your question";
    // Smooth handoff: fade/slide the current step out, then the
    // reading step in (cards stagger in below).
    var current = document.querySelector("[data-step]:not([hidden])");
    if (current && !current.hidden && current.getAttribute("data-step") !== "3") {
      current.classList.add("step-out");
      setTimeout(function () {
        current.classList.remove("step-out");
        showStep(3, true);
        var readSec = document.getElementById("step-read");
        if (readSec) {
          readSec.classList.add("step-in");
          setTimeout(function () { readSec.classList.remove("step-in"); }, 500);
        }
      }, 280);
    } else {
      showStep(3, true);
    }
    var rq = document.getElementById("read-q");
    if (rq) rq.textContent = "\u201c" + question + "\u201d";
    var row = document.getElementById("read-cards");
    if (row) {
      var cardWord = uiLang() === "th" ? "\u0e43\u0e1a\u0e17\u0e35\u0e48" : "Card";
      row.innerHTML = (cards || []).map(function (c, i) {
        return '<figure class="read-card"><img src="' + esc(c.image) + '" srcset="' + esc(c.image2x || "") + ' 2x" alt="' + esc(c.name) + '"' +
          (c.reversed ? ' class="rev"' : "") + ">" +
          "<figcaption><span class=\"rc-num\">" + cardWord + " " + (i + 1) + '</span><span class="rc-name">' + esc(c.name) + "</span></figcaption></figure>";
      }).join("");
    }
  }

  // While the reading request is in flight, Ngern gets ready:
  // shuffling animation + a rotating bubble, cleared on every exit.
  var waitTimer = null;
  function startWait() {
    var ga = document.getElementById("guide-ask");
    if (ga) ga.className = "guide guide-ask s-shuffling";
    var lines = uiLang() === "th"
      ? ["\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e43\u0e2b\u0e49\u0e04\u0e38\u0e13\u2026", "\u0e2d\u0e38\u0e48\u0e19\u0e2a\u0e33\u0e23\u0e31\u0e1a\u0e44\u0e1e\u0e48\u0e2a\u0e31\u0e01\u0e04\u0e23\u0e39\u0e48\u2026", "\u0e16\u0e32\u0e21\u0e44\u0e1e\u0e48\u0e27\u0e48\u0e32\u0e2d\u0e22\u0e32\u0e01\u0e1a\u0e2d\u0e01\u0e2d\u0e30\u0e44\u0e23\u0e04\u0e38\u0e13\u2026"]
      : ["Getting your reading ready\u2026", "Warming up the deck\u2026", "Asking the cards about you\u2026"];
    var i = 0;
    bubble(lines[0]);
    waitTimer = setInterval(function () {
      i = (i + 1) % lines.length;
      bubble(lines[i]);
    }, 1600);
  }
  function stopWait() {
    if (waitTimer) clearInterval(waitTimer);
    waitTimer = null;
    var ga = document.getElementById("guide-ask");
    if (ga && ga.classList.contains("s-shuffling")) ga.className = "guide guide-ask s-idle";
    // The wait lines ("Warming up the deck…") would otherwise linger
    // in the step-1 bubble: returning via a follow-up or Ask again
    // showed a working cat over an idle form.
    if (idleBubble) bubble(idleBubble);
  }

  async function submit(form) {
    if (cannotAfford()) { gateInsufficient(); return; }
    var q = document.getElementById("q");
    var question = ((q && q.value) || "").trim();
    if (!question) {
      if (q) {
        q.classList.add("need");
        q.focus();
      }
      bubble(t("need"));
      return;
    }
    var topicInput = form.querySelector('input[name="topic"]:checked');
    var topic = topicInput ? topicInput.value : (window.__tnTopic || "general");
    var lang = uiLang();
    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    // Turnstile renders here once the owner provides a site key (M5);
    // the server skips verification while no secret is configured.
    var token = "";
    try {
      if (window.turnstile && document.querySelector(".cf-turnstile")) {
        token = window.turnstile.getResponse() || "";
      }
    } catch (e) {}
    startWait();
    var res;
    try {
      res = await postReading({ question: question, topic: topic, lang: lang, turnstileToken: token });
    } catch (e) {
      stopWait();
      if (btn) btn.disabled = false;
      return;
    }
    stopWait();
    if (res.status === 400) {
      if (q) {
        q.classList.add("need");
        q.focus();
      }
      bubble(t("need"));
      if (btn) btn.disabled = false;
      return;
    }
    stopWait();
    if (res.status === 403 && res.data && res.data.error === "registration_required") {
      // Out of free tokens as a guest: sign-in, then billing to top up.
      savePendingQuestion();
      location.href = "/sign-in?return=%2Fbilling";
      return;
    }
    if (res.status === 402) {
      // Registered but short: straight to billing, question kept.
      savePendingQuestion();
      location.href = "/billing";
      return;
    }
    if (res.status === 403) {
      // Bot check / forbidden: not a question problem, say so.
      bubble(t("blocked"));
      if (btn) btn.disabled = false;
      return;
    }
    stopWait();
    if (res.data && res.data.crisis) {
      setGuide("done");
      enterRead(question, topicLabel(topic), []);
      var mount = readingMount();
      mount.innerHTML = '<div class="rc on"><b>' + esc(t("crisis")) + "</b><p>" + esc(res.data.message) + "</p></div>";
      if (btn) btn.disabled = false;
      return;
    }
    stopWait();
    if (res.status === 402 || res.status === 403) {
      // Token metering: out of free tokens. 402 = registered but the
      // wallet is short (buy prompt); 403 = needs an account first.
      // Show the upsell instead of parking the cat for the day.
      var mount3 = readingMount();
      if (res.status === 403) {
        bubble(t("registerFirst"));
        mount3.innerHTML =
          '<div class="rc on"><b>' + esc(t("registerFirst")) + "</b><p>" + esc(t("registerFirstText")) + "</p>" +
          '<p><a class="btn btn-primary" href="/register">' + esc(t("registerCta")) + "</a> " +
          '<a class="btn btn-outline" href="/sign-in">' + esc(t("signInCta")) + "</a></p></div>";
      } else {
        bubble(t("needTokens"));
        mount3.innerHTML =
          '<div class="rc on"><b>' + esc(t("needTokens")) + "</b><p>" + esc(t("needTokensText")) + "</p>" +
          '<p><a class="btn btn-primary" href="/billing">' + esc(t("buyTokens")) + "</a></p></div>";
      }
      if (btn) btn.disabled = false;
      return;
    }
    stopWait();
    if (res.status === 429) {
      // Two different 429s: the daily quota (cat sleeps) and the
      // per-connection rate backstop (just slow down). Only the
      // quota one means no tries remain.
      if (res.data && res.data.error === "rate_limited") {
        bubble(t("slowDown"));
        if (btn) btn.disabled = false;
        return;
      }
      var resetsAt = (res.data && res.data.resetsAt) || null;
      sleepMode(resetsAt);
      if (window.TarotHome) window.TarotHome.refresh();
      return;
    }
    stopWait();
    if (res.status !== 200 || !res.data.id) {
      if (btn) btn.disabled = false;
      return;
    }
    // The draw response carries ids only (SPEC §12): map them onto
    // library data now; faces render one by one as cards flip.
    var byId = {};
    try {
      var listRes = await fetch("/api/cards?lang=" + lang, { credentials: "include" });
      var list = await listRes.json();
      (list.cards || []).forEach(function (card) { byId[card.id] = card; });
    } catch (e) {}
    clearPendingQuestion();
    var enriched = (res.data.cards || []).map(function (drawn) {
      var view = byId[drawn.id] || {};
      return {
        id: drawn.id,
        name: view.nameEn || view.name || "",
        keywords: ((drawn.reversed ? view.keywordsReversed : view.keywordsUpright) || []).slice(0, 3),
        image: view.image || "",
        image2x: view.image2x || "",
        reversed: !!drawn.reversed,
      };
    });
    var reading = { id: res.data.id, cards: enriched };
    // A resumed draw keeps its original question on screen.
    var shownQ = res.data.resumed && res.data.question ? res.data.question : question;
    var shownTopic = topicLabel(res.data.resumed && res.data.topic ? res.data.topic : topic);
    enterDraw(shownQ, shownTopic);
    var stage = document.getElementById("draw-stage");
    try {
      await window.TarotDraw.run(stage, {
        cards: reading.cards,
        lang: lang,
        readingId: reading.id,
        onEvent: function () {},
      });
    } catch (e) {
      if (btn) btn.disabled = false;
      return;
    }
    enterRead(shownQ, shownTopic, reading.cards);
    var mount2 = readingMount();
    bubble(lang === "th" ? "\u0e19\u0e35\u0e48\u0e04\u0e37\u0e2d\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13" : "Here is your reading");
    streamInto(mount2, reading, lang, function () {
      if (window.TarotHome) window.TarotHome.refresh();
      var left = typeof res.data.remaining === "number" ? res.data.remaining : 1;
      againButton(mount2, reading, left);
    });
  }

  function init() {
    var form = document.getElementById("ask-form");
    if (!form || !window.TarotDraw) return;
    var idleEl = document.querySelector("#guide-ask .bubble");
    if (idleEl) idleBubble = idleEl.textContent;
    document.querySelectorAll("#guide .ngern-wrap, #guide-ask .ngern-wrap").forEach(function (wrap) {
      wrap.addEventListener("click", function () { pokeSleep(wrap); pokeIdle(wrap); });
    });
    // Occasional mouse visitor while the home cat waits idly.
    setInterval(mouseRun, MOUSE_WAIT);
    var back = document.getElementById("draw-back");
    if (back) back.addEventListener("click", function () {
      if (history.state && history.state.step) history.back();
      else { showStep(1); if (window.TarotHome) window.TarotHome.refresh(); }
    });
    window.addEventListener("popstate", function () {
      showStep(1);
      if (window.TarotHome) window.TarotHome.refresh();
    });
    if (/[?&]focus=q/.test(location.search)) {
      var q0 = document.getElementById("q");
      if (q0) q0.focus();
    }
    // Sleep state from the start when no questions remain. Token
    // balances count too: an out-of-free-tokens user with tokens (or
    // referral balance) can still ask — the server charges at draw time.
    function outOfQuestions(d) {
      if (!d || !d.quota) return false;
      // An unfinished reading from today is always resumable — never
      // lock the form (and strand that reading) just because its spend
      // already used up the day's questions.
      if (d.openReading) return false;
      if (d.tokens) return (d.tokens.remaining || 0) <= 0;
      return d.quota.used >= (d.quota.limit || 3);
    }
    var data = window.TarotHome && window.TarotHome.data;
    if (data) lastSummary = data;
    // When the wallet cannot cover a question, keep the form clickable
    // (visual rest only) so a tap can route to login/billing; the old
    // full sleep disabled the very controls the user taps.
    function applyOutOfQuestions(d) {
      if (d.tokens && (d.tokens.remaining || 0) < 1 && !d.openReading) {
        bubble(t("sleep"));
        if (window.TarotHome && window.TarotHome.sleepNgern) window.TarotHome.sleepNgern();
      } else {
        sleepMode(d.quota.resetsAt || null);
      }
    }
    if (outOfQuestions(data)) {
      applyOutOfQuestions(data);
    }
    restorePendingQuestion();
    // History-detail follow-up prefill (/?prefill=...).
    try {
      var pre = new URLSearchParams(location.search).get("prefill");
      var qPre = document.getElementById("q");
      if (pre && qPre && !qPre.value) qPre.value = pre;
    } catch (e) {}
    // Suggestion chips + 300-char counter + topic tracking.
    var qEl = document.getElementById("q");
    var countEl = document.getElementById("q-count");
    function syncCount() { if (countEl && qEl) countEl.textContent = String(qEl.value.length); }
    if (qEl) { qEl.addEventListener("input", syncCount); syncCount(); }
    document.querySelectorAll("[data-suggest]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll("[data-suggest]").forEach(function (x) { x.classList.toggle("on", x === chip); });
        window.__tnTopic = chip.getAttribute("data-topic") || "general";
        resetAskLabel();
        if (qEl) { qEl.value = chip.getAttribute("data-suggest") || ""; syncCount(); qEl.focus(); }
      });
    });
    // "Ask a different question instead?" under a follow-up label:
    // drop the follow-up context and start over like a first visit.
    var freshLink = document.getElementById("fresh-ask-link");
    if (freshLink) freshLink.addEventListener("click", freshStart);
    // Pack sheet controls.
    var sheetClose = document.getElementById("pack-sheet-close");
    if (sheetClose) sheetClose.addEventListener("click", closePackSheet);
    var sheetEl = document.getElementById("pack-sheet");
    if (sheetEl) sheetEl.addEventListener("click", function (e) { if (e.target === sheetEl) closePackSheet(); });
    var applyBtn = document.getElementById("sheet-apply");
    if (applyBtn) applyBtn.addEventListener("click", async function () {
      var input = document.getElementById("sheet-code");
      var msg = document.getElementById("sheet-code-msg");
      var strings = window.__tnSheet || {};
      try {
        var res = await fetch("/api/me/redeem/validate", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: input ? input.value : "" }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.ok) {
          sheetCode = data.code;
          var applied = document.getElementById("sheet-code-applied");
          if (applied) { applied.hidden = false; applied.textContent = (strings.redeemOk || "{code} redeemed").replace("{code}", data.code).replace("{bonus}", String(data.bonus)); }
          var rm = document.getElementById("sheet-code-remove"); if (rm) rm.hidden = false;
          if (msg) msg.textContent = "";
        } else if (msg) {
          msg.textContent = data.error === "expired_code" ? (strings.redeemExpired || "Expired") : data.error === "already_used" ? (strings.redeemUsed || "Already used") : data.error === "own_code" ? (strings.redeemOwn || "Own code") : (strings.redeemInvalid || "Invalid code");
        }
      } catch (e) {}
    });
    var removeBtn = document.getElementById("sheet-code-remove");
    if (removeBtn) removeBtn.addEventListener("click", function () {
      sheetCode = null;
      var applied = document.getElementById("sheet-code-applied"); if (applied) applied.hidden = true;
      removeBtn.hidden = true;
      var input = document.getElementById("sheet-code"); if (input) input.value = "";
    });
    var payBtn = document.getElementById("pack-pay");
    if (payBtn) payBtn.addEventListener("click", async function () {
      savePendingQuestion();
      payBtn.disabled = true;
      try {
        var res = await fetch("/api/billing/checkout", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pack: sheetPack, code: sheetCode || undefined, return: "/?paid=1" }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (data.url) { location.href = data.url; return; }
      } catch (e) {}
      payBtn.disabled = false;
    });
    document.addEventListener("click", function (e) {
      // Shuffle, the input box, and the suggested-question chips all
      // live in #ask-form and share this path. Sleeping taps count too:
      // the form stays enabled so they arrive here instead of dying.
      if (!cannotAfford() && !sleeping) return;
      var inForm = e.target && e.target.closest && e.target.closest("#ask-form");
      if (inForm) { e.preventDefault(); gateInsufficient(); }
    }, true);
    document.addEventListener("tarot:summary", function (e) {
      var d = (e && e.detail) || {};
      if (d && (d.tokens || d.user)) lastSummary = d;
      // Returning from a pack purchase with a question waiting: ask it.
      if (/[?&]paid=1/.test(location.search) && !window.__tnAutoAsked) {
        window.__tnAutoAsked = true;
        try {
          var pendingQ = window.sessionStorage.getItem("tarotnice:pending-question");
          var qPaid = document.getElementById("q");
          if (pendingQ && qPaid) {
            qPaid.value = pendingQ;
            if (!outOfQuestions(d)) {
              var paidForm = document.getElementById("ask-form");
              if (paidForm) submit(paidForm);
            }
          }
        } catch (err) {}
      }
      if (!d.quota || !document.getElementById("ask-form")) return;
      if (outOfQuestions(d)) {
        applyOutOfQuestions(d);
      } else {
        wakeMode();
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submit(form);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
