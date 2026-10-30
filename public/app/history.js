// TarotHistory: journal editor, delete, and share wiring on the reading
// detail page. Journal saves and deletes go through the offline queue
// (sync-queue.js) and flush in order when the network returns.
import { createQueue } from "./sync-queue.js";

var STR = {
  en: { saved: "Saved", saveFailed: "Could not save — will retry when online.", confirmDelete: "Delete this reading?", deleteFailed: "Could not delete — will retry when online." },
  th: { saved: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e41\u0e25\u0e49\u0e27", saveFailed: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49 \u0e08\u0e30\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e2d\u0e2d\u0e19\u0e44\u0e25\u0e19\u0e4c", confirmDelete: "\u0e25\u0e1a\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e19\u0e35\u0e49?", deleteFailed: "\u0e25\u0e1a\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49 \u0e08\u0e30\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e2d\u0e2d\u0e19\u0e44\u0e25\u0e19\u0e4c" },
};

function lang() {
  return document.documentElement.lang === "th" ? "th" : "en";
}
function t(key) {
  return (STR[lang()] || STR.en)[key];
}

var queue = createQueue(window.localStorage);

function postItem(wrapped) {
  // sync-queue wraps enqueued payloads as { activity, ... }.
  var item = wrapped.activity || wrapped;
  if (item.op === "journal") {
    return fetch("/api/readings/" + encodeURIComponent(item.id) + "/journal", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journal: item.journal }),
    }).then(function (res) {
      if (!res.ok) throw new Error("journal failed: " + res.status);
    });
  }
  return fetch("/api/readings/" + encodeURIComponent(item.id), {
    method: "DELETE",
    credentials: "include",
  }).then(function (res) {
    if (!res.ok && res.status !== 404) throw new Error("delete failed: " + res.status);
  });
}

async function flush() {
  try {
    await queue.flush(postItem);
  } catch {
    /* stays queued for next time */
  }
}

function currentId() {
  var main = document.querySelector("main.reading-detail[data-reading]");
  return main ? main.getAttribute("data-reading") : null;
}

function initDetail(id) {
  var form = document.getElementById("journal-form");
  if (form) {
    var area = document.getElementById("journal");
    var ok = form.querySelector("[data-journal-ok]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var value = area ? area.value : "";
      postItem({ op: "journal", id: id, journal: value })
        .then(function () {
          if (ok) {
            ok.hidden = false;
            setTimeout(function () {
              ok.hidden = true;
            }, 2000);
          }
          flush();
        })
        .catch(function () {
          queue.enqueue({ op: "journal", id: id, journal: value });
          if (ok) {
            ok.hidden = false;
            ok.textContent = t("saveFailed");
          }
        });
    });
  }
  var shareBtn = document.querySelector("[data-share-reading]");
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      if (window.TarotShare) window.TarotShare.open("reading", id);
    });
  }
  var delBtn = document.querySelector("[data-delete-reading]");
  if (delBtn) {
    delBtn.addEventListener("click", function () {
      if (!window.confirm(t("confirmDelete"))) return;
      postItem({ op: "delete", id: id })
        .then(function () {
          window.location.href = "/history";
        })
        .catch(function () {
          queue.enqueue({ op: "delete", id: id });
          window.alert(t("deleteFailed"));
          window.location.href = "/history";
        });
    });
  }
}

function initHistoryFilter() {
  var search = document.querySelector("[data-history-search]");
  if (!search) return;
  var chips = document.querySelectorAll("[data-topic-filter]");
  var items = document.querySelectorAll("[data-reading-item]");
  var groups = document.querySelectorAll("[data-month-group]");
  var none = document.querySelector("[data-history-none]");
  var topic = "all";
  function apply() {
    var q = (search.value || "").toLowerCase().trim();
    var anyVisible = false;
    items.forEach(function (item) {
      var okTopic = topic === "all" || item.getAttribute("data-topic") === topic;
      var okSearch = !q || (item.getAttribute("data-search") || "").includes(q);
      var show = okTopic && okSearch;
      item.hidden = !show;
      if (show) anyVisible = true;
    });
    groups.forEach(function (g) {
      var has = g.querySelector("[data-reading-item]:not([hidden])");
      g.hidden = !has;
    });
    if (none) none.hidden = anyVisible;
  }
  search.addEventListener("input", apply);
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.remove("on"); });
      chip.classList.add("on");
      topic = chip.getAttribute("data-topic-filter") || "all";
      apply();
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    flush();
    initHistoryFilter();
    var id = currentId();
    if (id) initDetail(id);
  });
} else {
  flush();
  initHistoryFilter();
  var syncId = currentId();
  if (syncId) initDetail(syncId);
}
