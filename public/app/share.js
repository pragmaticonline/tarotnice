// Share sheet: bottom sheet with the story preview, private-by-default
// question toggle, and one-tap targets (native, LINE, Facebook, X,
// Instagram, save, copy). Every tap is logged for virality metrics.
(function () {
  "use strict";

  function uiLang() {
    return document.documentElement.lang === "th" ? "th" : "en";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function mode() {
    return document.documentElement.getAttribute("data-mode") === "night" ? "night" : "day";
  }

  var STR = {
    en: {
      title: "Share your reading", loading: "Preparing your image\u2026",
      save: "Save image", copy: "Copy link", copied: "Copied!", native: "More\u2026",
      igNote: "Instagram: save the image, then post it as a Story or post.",
      inapp: "You are in an in-app browser: Save the image or Copy the link, then share from your browser app.",
    },
    th: {
      title: "\u0e41\u0e0a\u0e23\u0e4c\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22", loading: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e20\u0e32\u0e1e\u0e43\u0e2b\u0e49\u0e04\u0e38\u0e13\u2026",
      save: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e20\u0e32\u0e1e", copy: "\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e25\u0e34\u0e07\u0e01\u0e4c", copied: "\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e41\u0e25\u0e49\u0e27!", native: "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e40\u0e15\u0e34\u0e21\u2026",
      igNote: "Instagram: \u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e20\u0e32\u0e1e \u0e41\u0e25\u0e49\u0e27\u0e42\u0e1e\u0e2a\u0e15\u0e4c\u0e40\u0e1b\u0e47\u0e19\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e48\u0e2b\u0e23\u0e37\u0e2d\u0e42\u0e1e\u0e2a\u0e15\u0e4c",
      inapp: "\u0e04\u0e38\u0e13\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e40\u0e1a\u0e23\u0e32\u0e27\u0e4c\u0e40\u0e0b\u0e2d\u0e23\u0e4c\u0e02\u0e2d\u0e07\u0e41\u0e2d\u0e1b: \u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e20\u0e32\u0e1e\u0e2b\u0e23\u0e37\u0e2d\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e25\u0e34\u0e07\u0e01\u0e4c \u0e41\u0e25\u0e49\u0e27\u0e44\u0e1b\u0e41\u0e0a\u0e23\u0e4c\u0e08\u0e32\u0e01\u0e41\u0e2d\u0e1b\u0e40\u0e1a\u0e23\u0e32\u0e27\u0e4c\u0e40\u0e0b\u0e2d\u0e23\u0e4c",
    },
  };
  function t(k) {
    return (STR[uiLang()] || STR.en)[k];
  }

  function beacon(event, extra) {
    try {
      fetch("/_t/events", {
        method: "POST", credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ event: event }, extra || {})),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  function logShare(shareId, target) {
    try {
      fetch("/api/shares", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId: shareId, target: target }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  function inAppBrowser() {
    var ua = navigator.userAgent || "";
    return /Line\/|FBAN\/|FB_IAB\/|FBAV\/|Instagram/i.test(ua);
  }

  async function createShare(kind, ref, showQuestion) {
    var res = await fetch("/api/share", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: kind, ref: ref || null, showQuestion: !!showQuestion, mode: mode() }),
    });
    if (!res.ok) throw new Error("share failed: " + res.status);
    return res.json();
  }

  async function shareNative(share, previewUrl) {
    try {
      var files = [];
      if (navigator.canShare) {
        var img = await fetch(previewUrl, { credentials: "include" });
        var blob = await img.blob();
        var file = new File([blob], "tarotnice.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) files = [file];
      }
      await navigator.share({ title: "TarotNice", text: share.url, url: share.url, files: files.length ? files : undefined });
      logShare(share.shareId, "native");
    } catch (e) {
      /* dismissed */
    }
  }

  function openSheet(kind, ref) {
    var lang = uiLang();
    beacon("share_open", { kind: kind });
    var old = document.getElementById("share-sheet");
    if (old) old.remove();
    var sheet = document.createElement("div");
    sheet.id = "share-sheet";
    sheet.className = "sheet";
    sheet.innerHTML =
      '<div class="panel" role="dialog" aria-modal="true" aria-label="' + esc(t("title")) + '">' +
      '<h2>' + esc(t("title")) + "</h2>" +
      '<div class="story-wrap"><div class="story-loading" role="status"><span class="spinner" aria-hidden="true"></span><span>' + esc(t("loading")) + '</span></div><img class="story" alt=""></div>' +
      '<div class="targets"></div>' +
      (inAppBrowser() ? '<p class="inapp-note">' + esc(t("inapp")) + "</p>" : "") +
      '<p class="ig-note">' + esc(t("igNote")) + "</p>" +
      "</div>";
    document.body.appendChild(sheet);

    var share = null;
    var img = sheet.querySelector(".story");
    var loader = sheet.querySelector(".story-loading");
    var targets = sheet.querySelector(".targets");
    img.addEventListener("load", function () {
      img.classList.add("loaded");
      if (loader) loader.hidden = true;
    });

    async function load() {
      try {
        share = await createShare(kind, ref, true);
      } catch (e) {
        sheet.remove();
        return;
      }
      img.src = share.storyImageUrl;
      img.alt = "TarotNice";
      renderTargets();
    }

    function link(href, label, target) {
      var a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "target";
      a.textContent = label;
      a.addEventListener("click", function () {
        logShare(share.shareId, target);
      });
      return a;
    }

    function button(label, target, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "target";
      b.textContent = label;
      b.addEventListener("click", function () {
        fn();
      });
      return b;
    }

    function renderTargets() {
      targets.innerHTML = "";
      var text = encodeURIComponent(share.url);
      targets.appendChild(link("https://line.me/R/share?text=" + text, "LINE", "line"));
      targets.appendChild(link("https://www.facebook.com/sharer/sharer.php?u=" + text, "Facebook", "facebook"));
      targets.appendChild(link("https://twitter.com/intent/tweet?url=" + text, "X", "x"));
      if (navigator.share) {
        targets.appendChild(button(t("native"), "native", function () {
          shareNative(share, share.storyImageUrl);
        }));
      }
      var save = document.createElement("a");
      save.href = share.storyImageUrl;
      save.download = "tarotnice.png";
      save.className = "target";
      save.textContent = t("save");
      save.addEventListener("click", function () {
        logShare(share.shareId, "save");
      });
      targets.appendChild(save);
      var copy = button(t("copy"), "copy", function () {
        var done = function () {
          copy.textContent = t("copied");
          setTimeout(function () {
            copy.textContent = t("copy");
          }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(share.url).then(done, done);
        } else {
          done();
        }
        logShare(share.shareId, "copy");
      });
      targets.appendChild(copy);
    }

    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) close();
    });
    document.addEventListener("keydown", function esc2(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", esc2);
      }
    });
    function close() {
      sheet.remove();
    }
    load();
  }

  window.TarotShare = { open: openSheet };
})();
