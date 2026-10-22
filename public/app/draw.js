// The draw: 78-card shuffle, two-arc fan, pick 3, flip, stream.
// Ported from designs/prototype.html (shuffle/pick/geom) with real
// card art and server-drawn cards: visual picks map onto the server's
// cards in pick order, so a refresh can never re-roll.
//
// window.TarotDraw.run(stage, opts) where opts =
// { cards: [{image, image2x, name, reversed} x3], lang, readingId,
//   onEvent(name, detail) } \u2014 events: picked(n), revealed, streamed,
//   failed, done. Reduced-motion and screen-reader paths included.
(function () {
  "use strict";

  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function geom(W) {
    var cw = Math.min(104, Math.max(60, W / 5.4));
    var ch = cw * 1.75; // real art ratio (1537x2689)
    var droop = ch * 0.18;
    // Step 2 (wizard): three slots at the top, deck/fan below them;
    // picked cards are dealt up into the slots.
    var slotY = 10;
    var deckY = slotY + ch + 18 + ch * 0.62;
    return {
      cw: cw, ch: ch, slotY: slotY, deckY: deckY, droop: droop,
      H: deckY + ch + droop + 16,
      slotX: [W / 2 - cw * 1.75, W / 2, W / 2 + cw * 1.75],
    };
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function place(card, x, y, r, s, z, instant) {
    var inner = card.firstChild;
    card.style.zIndex = z == null ? 10 : z;
    var t = "translate(" + x + "px," + y + "px) rotate(" + (r || 0) + "deg) scale(" + (s || 1) + ")";
    if (instant) {
      var prev = inner.style.transition;
      inner.style.transition = "none";
      card.style.transform = t;
      void card.offsetWidth;
      inner.style.transition = prev;
    } else {
      card.style.transform = t;
    }
  }

  function announce(stage, msg) {
    var live = stage.querySelector("[data-live]");
    if (live) live.textContent = msg;
  }

  function setGuide(state) {
    var g = document.getElementById("guide");
    if (g) g.className = "guide s-" + state;
  }

  function bubble(msg) {
    var b = document.querySelector("#guide .bubble");
    if (b && msg) b.textContent = msg;
  }

  async function run(stage, opts) {
    var cards = opts.cards;
    var lang = opts.lang === "th" ? "th" : "en";
    var onEvent = opts.onEvent || function () {};
    // Resolved at the end of reveal(): callers must not stream the
    // reading (or show any card name) before the user has picked
    // three cards and watched them flip (SPEC \u00a78.2 steps 4-6).
    var finishRun = function () {};
    var finished = new Promise(function (resolve) { finishRun = resolve; });
    var W = stage.clientWidth || 360;
    var G = geom(W);
    var cx = W / 2;
    stage.style.height = G.H + "px";
    // No auto-scroll: the page must not jump when shuffling starts;
    // the header stays on screen (the wizard already scrolled to top).
    stage.innerHTML = '<p class="sr" data-live aria-live="polite"></p>';

    var deckPos = function (c, i) {
      return { x: cx - G.cw / 2 - i * 0.12, y: G.deckY, r: 0 };
    };

    // Build the 78-card deck (backs out; faces lazy until picked).
    var deck = [];
    for (var i = 0; i < 78; i++) {
      (function (i) {
        var card = el("button", "card", '<span class="inner"><span class="back"></span><span class="front"></span></span>');
        card.type = "button";
        card.style.width = G.cw + "px";
        card.style.height = G.ch + "px";
        card.setAttribute("aria-label", lang === "th" ? "\u0e44\u0e1e\u0e48\u0e43\u0e1a\u0e17\u0e35\u0e48 " + (i + 1) + " \u0e08\u0e32\u0e01 78" : "Card " + (i + 1) + " of 78");
        var p = deckPos(card, i);
        place(card, p.x, p.y, 0, 1, 10 + i, true);
        card.addEventListener("click", function () {
          pick(card);
        });
        stage.appendChild(card);
        deck.push(card);
      })(i);
    }
    // Slot frames.
    for (var s = 0; s < 3; s++) {
      var f = el("span", "slotframe");
      f.style.cssText = "left:" + (G.slotX[s] - G.cw / 2) + "px;top:" + G.slotY + "px;width:" + G.cw + "px;height:" + G.ch + "px";
      stage.appendChild(f);
    }

    var state = "idle";
    var picked = [];
    var serverIdx = 0;

    function faceHtml(server) {
      return '<span class="fx"><img src="' + esc(server.image) + '" srcset="' + esc(server.image2x || "") +
        ' 2x" alt="' + esc(server.name) + '" loading="eager" draggable="false">' +
        (server.reversed ? "" : "") + "</span>";
    }

    async function shuffle() {
      state = "shuffling";
      setGuide("shuffling");
      bubble(lang === "th" ? "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48\u2026" : "Shuffling\u2026");
      if (REDUCED) {
        fan();
        return;
      }
      for (var round = 0; round < 3; round++) {
        var off = G.cw * 1.1;
        deck.forEach(function (card, i) {
          var half = i < 39 ? -1 : 1;
          var p = deckPos(card, i);
          place(card, p.x + half * off, p.y, half * 9, 1, 10 + i);
        });
        await wait(420);
        // Riffle: interleave the two halves back, bottom-up,
        // alternating sides (prototype shuffle()).
        var first = deck.slice(0, 39);
        var second = deck.slice(39);
        var merged = [];
        for (var k = 0; k < 39; k++) {
          if (first[k]) merged.push(first[k]);
          if (second[k]) merged.push(second[k]);
        }
        merged.forEach(function (card, i) {
          var p = deckPos(card, i);
          card.style.transitionDelay = i * 7 + "ms";
          place(card, p.x, p.y, 0, 1, 10 + i);
        });
        deck = merged;
        await wait(420 + deck.length * 7);
        deck.forEach(function (card) {
          card.style.transitionDelay = "";
        });
      }
      // Overhand cut: top half lifts and drops under.
      var top = deck.slice(0, 39);
      top.forEach(function (card, i) {
        var p = deckPos(card, i);
        place(card, p.x, p.y - G.ch * 0.55, 4, 1, 200 + i);
      });
      await wait(380);
      deck.forEach(function (card, i) {
        var p = deckPos(card, i);
        place(card, p.x, p.y, 0, 1, 10 + i);
      });
      await wait(450);
      fan();
    }

    function fan() {
      state = "fan";
      // Prototype geometry (designs/prototype.html): two arcs of 39,
      // span 110\u00b0, edges normalised by sin(span/2) so the outermost
      // cards stay inside the stage; back row sits 0.62*ch higher,
      // both arcs sag by droop toward the edges.
      var span = 110 * (Math.PI / 180);
      var maxX = (W - G.cw * 1.75) / 2;
      var smax = Math.sin(span / 2);
      var droopDenom = 1 - Math.cos(span / 2);
      var n = deck.length;
      var half = Math.ceil(n / 2);
      deck.forEach(function (card, i) {
        var row = i < half ? 0 : 1;
        var k = row === 0 ? i : i - half;
        var m = row === 0 ? half : n - half;
        var a = -span / 2 + (span * k) / (m - 1);
        var x = cx - G.cw / 2 + (maxX * Math.sin(a)) / smax;
        var y = G.deckY - (row === 0 ? G.ch * 0.62 : 0) + (G.droop * (1 - Math.cos(a))) / droopDenom;
        card._fan = { x: x, y: y, a: (a * 180) / Math.PI / 2 };
        if (!REDUCED) card.style.transitionDelay = i * 7 + "ms";
        place(card, x, y, card._fan.a, 1, row * 100 + k);
        card.classList.add("pickable");
        card.tabIndex = 0;
      });
      var total = REDUCED ? 0 : 600 + n * 7;
      setTimeout(function () {
        deck.forEach(function (card) {
          card.style.transitionDelay = "";
        });
        state = "picking";
        setGuide("picking");
        updatePickHint(3);
      }, total);
    }

    function updatePickHint(left) {
      var first = left === 3;
      var msg = lang === "th"
        ? (first ? "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1e\u0e48 " + left + " \u0e43\u0e1a" : "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1e\u0e48\u0e2d\u0e35\u0e01 " + left + " \u0e43\u0e1a")
        : (first ? "Choose 3 cards" : "Choose " + left + " more card" + (left === 1 ? "" : "s"));
      bubble(msg);
      announce(stage, msg);
    }

    async function pick(card) {
      if (state !== "picking" || card.classList.contains("picked")) return;
      if (picked.length >= 3) return;
      var slot = picked.length;
      picked.push(card);
      card.classList.add("picked");
      card.classList.remove("pickable");
      card.tabIndex = -1;
      if (navigator.vibrate) {
        try {
          navigator.vibrate(8);
        } catch (e) {}
      }
      // Map the visual pick onto the next server card.
      var server = cards[serverIdx++];
      card._server = server;
      var front = card.querySelector(".front");
      front.innerHTML = faceHtml(server);
      if (server.reversed) front.classList.add("rev");
      place(card, G.slotX[slot] - G.cw / 2, G.slotY, 0, 1, 200 + slot);
      announce(stage, server.name);
      onEvent("picked", { n: picked.length, name: server.name });
      var left = 3 - picked.length;
      if (left > 0) {
        updatePickHint(left);
      } else {
        reveal();
      }
    }

    async function reveal() {
      state = "reveal";
      setGuide("reveal");
      bubble(lang === "th" ? "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e1b\u0e34\u0e14\u0e44\u0e1e\u0e48\u2026" : "Turning the cards\u2026");
      deck.forEach(function (card, i) {
        if (picked.indexOf(card) >= 0) return;
        card.classList.remove("pickable");
        card.tabIndex = -1;
        if (!REDUCED) card.style.transitionDelay = i * 4 + "ms";
        var p = deckPos(card, i);
        place(card, p.x, p.y + G.H, 0, 0.6, 5);
      });
      await wait(REDUCED ? 60 : 700);
      deck.forEach(function (card) {
        card.style.transitionDelay = "";
        if (picked.indexOf(card) < 0) card.style.display = "none";
      });
      for (var k = 0; k < picked.length; k++) {
        if (!REDUCED) await wait(650);
        picked[k].classList.add("flipped");
        var name = picked[k]._server.name + (picked[k]._server.reversed ? (lang === "th" ? " (\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27)" : " (reversed)") : "");
        announce(stage, name);
        onEvent("revealed", { n: k + 1, name: name });
      }
      state = "done";
      setGuide("done");
      onEvent("revealed-all", {});
      finishRun({ picked: picked, serverCards: cards });
    }

    // Touch lift before the pick lands.
    stage.addEventListener("pointerdown", function (e) {
      var card = e.target && e.target.closest ? e.target.closest(".card.pickable") : null;
      if (card && state === "picking") card.classList.add("lift");
    });
    stage.addEventListener("pointerup", function (e) {
      var cards2 = stage.querySelectorAll(".card.lift");
      for (var i = 0; i < cards2.length; i++) cards2[i].classList.remove("lift");
    });
    stage.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && document.activeElement && document.activeElement.classList.contains("pickable")) {
        e.preventDefault();
        pick(document.activeElement);
      }
    });

    await wait(60);
    await shuffle();
    return finished;
  }

  // Render the three cards + stream the synthesis into mount.
  function renderReading(mount, reading, lang, streamUrl, opts) {
    opts = opts || {};
    mount.innerHTML = "";
    // No per-card name blocks here any more: names sit under the
    // card images in step 3, and each card paragraph names itself.
    mount.appendChild(el("h2", "sec-h", lang === "th" ? "\u0e44\u0e1e\u0e48\u0e17\u0e35\u0e25\u0e30\u0e43\u0e1a" : "Card by card"));
    var synth = el("div", "rc rtext", "");
    synth.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-fq]") : null;
      if (b && opts.onFollowUp) opts.onFollowUp(decodeURIComponent(b.getAttribute("data-fq") || ""));
    });
    // Waiting state until the first streamed words arrive.
    synth.innerHTML =
      '<div class="reading-wait" role="status"><span class="spinner" aria-hidden="true"></span>' +
      "<span>" + (lang === "th" ? "\u0e40\u0e07\u0e34\u0e19\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e43\u0e2b\u0e49\u0e04\u0e38\u0e13" : "Ngern is reading your cards") +
      '<span class="wdots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span></div>' +
      '<div class="rw-lines" aria-hidden="true"><span></span><span></span><span></span></div>';
    mount.appendChild(synth);
    setTimeout(function () {
      synth.classList.add("on");
    }, 250 * 4);

    // Render the streamed answer as paragraphs: blank-line separated
    // blocks become <p>, **bold** markers become <b>. Falls back to
    // single-newline splits when the model forgets the blank lines.
    function renderSynth() {
      var blocks = full.split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
      if (blocks.length <= 1) {
        blocks = full.split(/\n/).map(function (b) { return b.trim(); }).filter(Boolean);
      }
      // The Summary line moves up into At-a-glance as its lead.
      var summaryText = "";
      var sIdx = -1;
      blocks.forEach(function (b, i) { if (/^(SUMMARY:|\u0e2a\u0e23\u0e38\u0e1b:)/i.test(b)) sIdx = i; });
      if (sIdx >= 0) {
        summaryText = blocks[sIdx].replace(/^(SUMMARY:|\u0e2a\u0e23\u0e38\u0e1b:)\s*/i, "");
        blocks.splice(sIdx, 1);
      }
      var usedCard = {};
      var glanceDone = false;
      var out = blocks.map(function (b, bi) {
        var html = esc(b).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
        var cm = b.match(/^\*\*([^*]+)\*\*\s*:?\s*([\s\S]*)$/);
        if (cm) {
          var card = (reading.cards || []).find(function (c) {
            return c.name && (cm[1] === c.name || cm[1].indexOf(c.name) === 0) && !usedCard[c.name];
          });
          if (card) {
            usedCard[card.name] = true;
            var kw = (card.keywords || []).join(" \u00b7 ");
            return '<div class="sec card-row"><img class="card-thumb' + (card.reversed ? " rev" : "") + '" src="' + esc(card.image) + '" alt="">' +
              '<div class="card-row-body"><h3>' + esc(card.name) + (card.reversed ? (lang === "th" ? " (\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27)" : " (reversed)") : "") + "</h3>" +
              (kw ? '<p class="kw-line">' + esc(kw) + "</p>" : "") +
              "<p>" + esc(cm[2]).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") + "</p></div></div>";
          }
        }
        if (!glanceDone && bi === 0 && !/^(\*\*)?(\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48|\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33|What to do|Advice|Guidance|\u0e25\u0e2d\u0e07\u0e16\u0e32\u0e21|Explore)/.test(b)) {
          glanceDone = true;
          var gHtml = esc(b.replace(/^(\*\*)?(Overview|\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21)(\*\*)?\s*:?\s*\n?/, "")).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
          return '<div class="sec sec-glance"><h2 class="sec-title">' +
            (lang === "th" ? "\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21" : "At a glance") + "</h2>" +
            (summaryText ? '<p class="glance-lead">' + esc(summaryText) + "</p>" : "") +
            '<p class="glance-text">' + gHtml + "</p></div>";
        }
        if (/^\*\*(\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33|Guidance)/.test(b) || /^Guidance:/.test(b)) {
          var gTitle = (b.match(/^\*\*([^*]+)\*\*/) || b.match(/^([^:\n]+):/) || [])[1] || "Guidance";
          var gBody = b.replace(/^\*\*[^*]+\*\*:?\s*/, "").replace(/^[^:\n]+:\s*/, "");
          return '<div class="sec sec-guidance"><h2 class="sec-title">' + esc(gTitle) + "</h2><p>" +
            esc(gBody).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") + "</p></div>";
        }
        if (/^(\*\*)?(\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e17\u0e33\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22|\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33|What to do|Advice)/.test(b)) {
          var title = (b.match(/^\*\*([^*]+)\*\*/) || b.match(/^([^:\n]+):/) || [])[1] || "What to do";
          var bodyText = b.replace(/^\*\*[^*]+\*\*:?\s*/, "").replace(/^[^:\n]+:\s*/, "");
          var items = bodyText.split(/\s\u00b7\s|\n-\s*/).map(function (x) { return x.trim().replace(/^-\s*/, ""); }).filter(Boolean);
          if (items.length > 1) {
            return '<div class="sec sec-advice"><h2 class="sec-title">' + esc(title) + "</h2><ol>" +
              items.map(function (x) { return "<li>" + esc(x).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") + "</li>"; }).join("") + "</ol></div>";
          }
          return '<div class="sec sec-advice"><h2 class="sec-title">' + esc(title) + "</h2><p>" +
            esc(b.replace(/^\*\*[^*]+\*\*:?\s*/, "")).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") + "</p></div>";
        }
        if (/^(\*\*)?(\u0e25\u0e2d\u0e07\u0e16\u0e32\u0e21\u0e15\u0e48\u0e2d|Explore further)/.test(b)) {
          var fTitle = (b.match(/^\*\*([^*]+)\*\*/) || b.match(/^([^:\n]+):/) || [])[1] || "Explore further";
          var fItems = b.replace(/^\*\*[^*]+\*\*:?\s*/, "").replace(/^[^:\n]+:\s*/, "")
            .split(/\n/).map(function (x) { return x.replace(/^-\s*/, "").trim(); }).filter(Boolean);
          return '<div class="sec sec-follow"><h2 class="sec-title">' + esc(fTitle) + '</h2><div class="follow-btns">' +
            fItems.map(function (q) {
              return '<button type="button" class="follow-btn" data-fq="' + encodeURIComponent(q) + '">' + esc(q) + "</button>";
            }).join("") + "</div></div>";
        }
        if (/^\*\*(\u0e04\u0e33\u0e40\u0e15\u0e37\u0e2d\u0e19\u0e08\u0e32\u0e01\u0e44\u0e1e\u0e48|Warning)/.test(b)) {
          return '<p class="sec sec-warning">' + html + "</p>";
        }
        return "<p>" + html + "</p>";
      }).join("");
      if (summaryText && !glanceDone) {
        out += '<p class="sec sec-summary">' + esc(summaryText) + "</p>";
      }
      synth.innerHTML = out;
    }

    var es = new EventSource(streamUrl);
    var full = "";
    es.addEventListener("delta", function (e) {
      try {
        full += JSON.parse(e.data);
        renderSynth();
      } catch (err) {}
    });
    es.addEventListener("done", function (e) {
      es.close();
      var summary = "";
      try {
        summary = JSON.parse(e.data).summary || "";
      } catch (err) {}
      (opts.onDone || function () {})(summary, full);
    });
    es.addEventListener("error", function (e) {
      try {
        var err = JSON.parse(e.data || "{}");
        if (err.error) {
          es.close();
          (opts.onError || function () {})(err.error);
          return;
        }
      } catch (err2) {}
      // Network drop mid-stream: close; partial text stays.
      es.close();
      (opts.onError || function () {})(full ? "interrupted" : "reading_failed");
    });
    return es;
  }

  // Idle stage: the stacked 78-card deck and slot frames are visible
  // from page load (prototype build()), before any question is asked.
  // run() rebuilds the identical stack when a reading starts.
  function idle(stage, lang) {
    if (!stage || stage.querySelector(".card")) return;
    var W = stage.clientWidth || 360;
    var G = geom(W);
    var cx = W / 2;
    stage.style.height = G.H + "px";
    stage.innerHTML = '<p class="sr" data-live aria-live="polite"></p>';
    for (var s = 0; s < 3; s++) {
      var f = el("span", "slotframe");
      f.style.cssText = "left:" + (G.slotX[s] - G.cw / 2) + "px;top:" + G.slotY + "px;width:" + G.cw + "px;height:" + G.ch + "px";
      stage.appendChild(f);
    }
    for (var i = 0; i < 78; i++) {
      var card = el("button", "card", '<span class="inner"><span class="back"></span><span class="front"></span></span>');
      card.type = "button";
      card.tabIndex = -1;
      card.style.width = G.cw + "px";
      card.style.height = G.ch + "px";
      card.setAttribute("aria-hidden", "true");
      place(card, cx - G.cw / 2 - i * 0.12, G.deckY, 0, 1, 10 + i, true);
      stage.appendChild(card);
    }
  }

  window.TarotDraw = { run: run, renderReading: renderReading, idle: idle };
})();
