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
      again: "Ask again",
      blocked: "Please try again in a moment.",
      failed: "Ngern couldn't read the cards right now. Try again \u2014 your question is saved on the same cards.",
      noModel: "Readings are warming up. Your cards are drawn \u2014 please try again in a bit.",
      newIn: "New questions in ",
      shareToday: "Share today's reading",
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
      again: "\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e21\u0e48",
      blocked: "\u0e02\u0e2d\u0e2d\u0e20\u0e31\u0e22 \u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e43\u0e19\u0e2d\u0e35\u0e01\u0e2a\u0e31\u0e01\u0e04\u0e23\u0e39\u0e48",
      failed: "\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49 \u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e2d\u0e22\u0e39\u0e48\u0e01\u0e31\u0e1a\u0e44\u0e1e\u0e48\u0e0a\u0e38\u0e14\u0e40\u0e14\u0e34\u0e21",
      noModel: "\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e15\u0e31\u0e27 \u0e44\u0e1e\u0e48\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e08\u0e31\u0e48\u0e27\u0e41\u0e25\u0e49\u0e27 \u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e43\u0e19\u0e2d\u0e35\u0e01\u0e2a\u0e31\u0e01\u0e04\u0e23\u0e39\u0e48",
      newIn: "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e21\u0e48\u0e43\u0e19\u0e2d\u0e35\u0e01 ",
      shareToday: "\u0e41\u0e0a\u0e23\u0e4c\u0e14\u0e27\u0e07\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49",
    },
  };
  function t(k) {
    return (STR[uiLang()] || STR.en)[k];
  }

  function countdown(resetsAt) {
    var left = Math.max(0, resetsAt - Date.now());
    var h = Math.floor(left / 3600000);
    var m = Math.floor((left % 3600000) / 60000);
    return h + ":" + String(m).padStart(2, "0");
  }

  // Whether the ask step is parked in quota-exhausted sleep. Only
  // sleepMode sets it; only wakeMode clears it — so a refresh that
  // lands mid-submit never re-enables the in-flight submit button.
  var sleeping = false;
  // The idle hint, captured at init so wakeMode can restore it after
  // sleepMode overwrote the bubble.
  var idleBubble = null;

  function sleepMode(resetsAt) {
    sleeping = true;
    var form = document.getElementById("ask-form");
    if (form) {
      form.querySelectorAll("textarea,button,input").forEach(function (n) {
        n.disabled = true;
      });
    }
    sleepNgern();
    bubble(t("sleep"));
    var mount = null; // sleep state stays on step 1 now
    var html = "<p>" + esc(t("sleep")) + "</p>";
    if (resetsAt) html += '<p class="countdown">' + esc(t("newIn")) + esc(countdown(resetsAt)) + "</p>";
    html += '<p><a class="btn btn-outline" href="/cards">' + esc(t("browse")) + "</a></p>";
    if (mount) mount.innerHTML = html;
    else bubble(t("sleep"));
  }

  // Quota reset while the tab stayed open: undo sleepMode (re-enable
  // the form, wake Ngern, restore the idle hint) so the fresh quota
  // from TarotHome.refresh() is actually askable.
  function wakeMode() {
    if (!sleeping) return;
    sleeping = false;
    var form = document.getElementById("ask-form");
    if (form) {
      form.querySelectorAll("textarea,button,input").forEach(function (n) {
        n.disabled = false;
      });
    }
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
    if (remaining <= 0) {
      mount.appendChild(row);
      sleepMode(null);
      return;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline";
    btn.textContent = t("again") + " (" + remaining + ")";
    btn.addEventListener("click", function () {
      var q = document.getElementById("q");
      if (q) q.value = "";
      var form = document.getElementById("ask-form");
      var submitBtn = form && form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = false;
      showStep(1);
      if (window.TarotHome) window.TarotHome.refresh();
      if (q) q.focus();
    });
    row.appendChild(btn);
    mount.appendChild(row);
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
        showStep(1);
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
            await fetch("/api/readings/" + reading.id + "/retry", { method: "POST", credentials: "include" });
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
    var topic = topicInput ? topicInput.value : "general";
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
    // Sleep state from the start when no questions remain.
    var data = window.TarotHome && window.TarotHome.data;
    if (data && data.quota && data.quota.used >= (data.quota.limit || 3)) {
      sleepMode(data.quota.resetsAt || null);
    }
    document.addEventListener("tarot:summary", function (e) {
      var d = (e && e.detail) || {};
      if (!d.quota || !document.getElementById("ask-form")) return;
      if (d.quota.used >= (d.quota.limit || 3)) {
        sleepMode(d.quota.resetsAt || null);
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
