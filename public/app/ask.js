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
    var b = document.querySelector("#guide .bubble");
    if (b && msg) b.textContent = msg;
  }
  function sleepNgern() {
    var img = document.querySelector("#guide img");
    if (img) img.src = "/mascot/ngern-sleeping.svg";
    setGuide("sleep");
  }

  var STR = {
    en: {
      need: "Type your question first, then shuffle.",
      sleep: "Ngern is resting now. New questions tomorrow.",
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
      sleep: "\u0e40\u0e07\u0e34\u0e19\u0e02\u0e2d\u0e1e\u0e31\u0e01\u0e01\u0e48\u0e2d\u0e19\u0e19\u0e30 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e21\u0e48\u0e1e\u0e23\u0e38\u0e48\u0e07\u0e19\u0e35\u0e49",
      browse: "\u0e40\u0e1b\u0e34\u0e14\u0e2b\u0e49\u0e2d\u0e07\u0e2a\u0e21\u0e38\u0e14\u0e44\u0e1e\u0e48",
      crisis: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e43\u0e08",
      retry: "\u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07",
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

  function sleepMode(resetsAt) {
    var form = document.getElementById("ask-form");
    if (form) {
      form.querySelectorAll("textarea,button,input").forEach(function (n) {
        n.disabled = true;
      });
    }
    sleepNgern();
    var mount = document.getElementById("reading");
    var html = "<p>" + esc(t("sleep")) + "</p>";
    if (resetsAt) html += '<p class="countdown">' + esc(t("newIn")) + esc(countdown(resetsAt)) + "</p>";
    html += '<p><a class="btn btn-outline" href="/cards">' + esc(t("browse")) + "</a></p>";
    if (mount) mount.innerHTML = html;
    else bubble(t("sleep"));
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
    btn.textContent = t("again");
    btn.addEventListener("click", function () {
      location.reload();
    });
    row.appendChild(btn);
    mount.appendChild(row);
  }

  async function streamInto(mount, reading, lang, onDone) {
    window.TarotDraw.renderReading(mount, reading, lang, "/api/readings/" + reading.id + "/stream", {
      onDone: onDone,
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
    var res;
    try {
      res = await postReading({ question: question, topic: topic, lang: lang, turnstileToken: token });
    } catch (e) {
      if (btn) btn.disabled = false;
      return;
    }
    if (res.status === 400) {
      if (q) {
        q.classList.add("need");
        q.focus();
      }
      bubble(t("need"));
      if (btn) btn.disabled = false;
      return;
    }
    if (res.status === 403) {
      // Bot check / forbidden: not a question problem, say so.
      bubble(t("blocked"));
      if (btn) btn.disabled = false;
      return;
    }
    if (res.data && res.data.crisis) {
      collapseForm(question, topicLabel(topic));
      setGuide("done");
      var mount = readingMount();
      mount.innerHTML = '<div class="rc on"><b>' + esc(t("crisis")) + "</b><p>" + esc(res.data.message) + "</p></div>";
      if (btn) btn.disabled = false;
      return;
    }
    if (res.status === 429) {
      var resetsAt = (res.data && res.data.resetsAt) || null;
      sleepMode(resetsAt);
      if (window.TarotHome) window.TarotHome.refresh();
      return;
    }
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
        name: view.name || "",
        image: view.image || "",
        image2x: view.image2x || "",
        reversed: !!drawn.reversed,
      };
    });
    var reading = { id: res.data.id, cards: enriched };
    // A resumed draw keeps its original question on screen.
    collapseForm(res.data.resumed && res.data.question ? res.data.question : question,
      topicLabel(res.data.resumed && res.data.topic ? res.data.topic : topic));
    var stage = document.getElementById("draw-stage");
    var mount2 = readingMount();
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
    bubble(lang === "th" ? "\u0e19\u0e35\u0e48\u0e04\u0e37\u0e2d\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13" : "Here is your reading");
    streamInto(mount2, reading, lang, function () {
      if (window.TarotHome) window.TarotHome.refresh();
      var left = typeof res.data.remaining === "number" ? res.data.remaining - 1 : 1;
      againButton(mount2, reading, left);
    });
  }

  function init() {
    var form = document.getElementById("ask-form");
    if (!form || !window.TarotDraw) return;
    var idleStage = document.getElementById("draw-stage");
    if (idleStage && window.TarotDraw.idle) window.TarotDraw.idle(idleStage, uiLang());
    // Sleep state from the start when no questions remain.
    var data = window.TarotHome && window.TarotHome.data;
    if (data && data.quota && data.quota.used >= (data.quota.limit || 3)) {
      sleepMode(data.quota.resetsAt || null);
    }
    document.addEventListener("tarot:summary", function (e) {
      var d = (e && e.detail) || {};
      if (d.quota && d.quota.used >= (d.quota.limit || 3) && document.getElementById("ask-form")) {
        sleepMode(d.quota.resetsAt || null);
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
