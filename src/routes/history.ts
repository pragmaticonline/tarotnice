// History: reverse-chron readings list (cursor pages of 30) and the
// per-reading detail with full text, journal editor, share, delete.
// Deletes and journal writes queue offline (public/app/history.js) and
// flush in order when the network returns.
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { headerHtml, pageShell, siteFooterHtml, type HeaderAccount } from "./shell";
import type { StreakInfo } from "../lib/streaks";

export type HistoryItem = {
  id: string;
  day: string;
  topic: string;
  topicLabel: string;
  question: string;
  cards: { name: string; reversed: boolean; image: string; reversedLabel: string }[];
  summary: string | null;
  status: string;
  createdAt: number;
};

const TOPICS = ["love", "career", "money", "health", "general"] as const;

function monthLabel(ui: UiLang, createdAt: number): string {
  try {
    return new Intl.DateTimeFormat(ui === "th" ? "th-TH" : "en-GB", {
      month: "long", year: "numeric", timeZone: "Asia/Bangkok",
    }).format(new Date(createdAt));
  } catch {
    return "";
  }
}

export function readingDateLabel(ui: UiLang, createdAt: number): string {
  return stampLabel(ui, createdAt);
}

/** List preview: older stored summaries carry raw markdown (e.g. a
 *  "**\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21:** ..." lead). Strip markers and
 *  the Overview label so the row shows plain text. */
export function summaryPreview(summary: string | null): string | null {
  if (!summary) return null;
  const clean = summary
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:Overview|\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21)\s*:?\s*/i, "")
    .trim();
  return clean || null;
}

function stampLabel(ui: UiLang, createdAt: number): string {
  try {
    const f = new Intl.DateTimeFormat(ui === "th" ? "th-TH" : "en-GB", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: "Asia/Bangkok",
    });
    return f.format(new Date(createdAt)).replace(",", " \u00b7");
  } catch {
    return "";
  }
}

export function historyPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  items: HistoryItem[];
  nextCursor: number | null;
  /** True total across all pages (board: "24 readings"). */
  total?: number;
  /** Server search term (filters across all readings, not one page). */
  searchQuery?: string;
  /** Server-rendered header initial + token balance (no first-paint flash). */
  account?: HeaderAccount;
}): string {
  const d = t(opts.ui);
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/history", account: opts.account });
  const topicLabels: Record<string, string> = {
    love: d.topicLove, career: d.topicCareer, money: d.topicMoney,
    health: d.topicHealth, general: d.topicGeneral,
  };
  const chips =
    `<div class="hist-chips" role="group">` +
    `<button type="button" class="hist-chip on" data-topic-filter="all">${escapeHtml(d.filterAll)}</button>` +
    TOPICS.map(
      (topic) =>
        `<button type="button" class="hist-chip" data-topic-filter="${topic}">${escapeHtml(topicLabels[topic])}</button>`,
    ).join("") +
    `</div>`;
  let list: string;
  if (opts.items.length === 0) {
    list = `<p class="empty">${escapeHtml(d.emptyHistory)}</p><p><a class="btn" href="/">${escapeHtml(d.shuffle)}</a></p>`;
  } else {
    let lastMonth = "";
    const parts: string[] = [];
    for (const item of opts.items) {
      const month = monthLabel(opts.ui, item.createdAt);
      if (month !== lastMonth) {
        if (lastMonth) parts.push(`</ol></section>`);
        parts.push(`<section class="hist-month" data-month-group><h2 class="hist-month-h">${escapeHtml(month)}</h2><ol class="history-list">`);
        lastMonth = month;
      }
      const names = item.cards
        .map((c) => `${c.name}${c.reversed ? ` (${c.reversedLabel})` : ""}`)
        .join(" \u00b7 ");
      const thumbs = item.cards
        .map((c) => (c.image ? `<img class="hist-thumb" src="${escapeHtml(c.image)}" alt="" loading="lazy">` : ""))
        .join("");
      const preview = summaryPreview(item.summary);
      const searchText = `${item.question} ${preview ?? ""} ${names}`.toLowerCase();
      parts.push(
        `<li class="history-item" data-reading-item data-topic="${escapeHtml(item.topic)}" data-search="${escapeHtml(searchText)}">` +
          `<a class="history-link" href="/history/${escapeHtml(item.id)}">` +
          `<span class="hist-thumbs">${thumbs}</span>` +
          `<span class="hist-main"><span class="hist-meta"><span class="topic-pill">${escapeHtml(item.topicLabel)}</span><span class="hist-date">${escapeHtml(stampLabel(opts.ui, item.createdAt))}</span>${item.status !== "complete" ? `<span class="history-status">${escapeHtml(item.status)}</span>` : ""}</span>` +
          `<span class="history-q">&ldquo;${escapeHtml(item.question)}&rdquo;</span>` +
          (preview ? `<span class="history-sum">${escapeHtml(preview)}</span>` : "") +
          (names ? `<span class="hist-cards">${escapeHtml(names)}</span>` : "") +
          `</span><span class="hist-chev" aria-hidden="true">&rsaquo;</span></a></li>`,
      );
    }
    if (lastMonth) parts.push(`</ol></section>`);
    list =
      `<div class="hist-tools"><label class="hist-search"><span aria-hidden="true">&#128269;</span><input type="search" data-history-search value="${escapeHtml(opts.searchQuery ?? "")}" placeholder="${escapeHtml(d.searchQuestions)}" aria-label="${escapeHtml(d.searchQuestions)}"></label>${chips}</div>` +
      parts.join("") +
      `<p class="empty" data-history-none hidden>${escapeHtml(d.emptyHistory)}</p>` +
      (opts.nextCursor !== null
        ? `<p><a class="btn btn-outline" href="/history?cursor=${opts.nextCursor}">${escapeHtml(d.loadMore)}</a></p>`
        : "");
  }
  return pageShell({
    title: `${d.historyTitle} \u00b7 TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body:
      `${head}<main><div class="hist-head"><div><h1 class="display">${escapeHtml(d.historyTitle)}</h1>` +
      `<p class="muted">${escapeHtml(fmt(d.readingsCount, { n: opts.total ?? opts.items.length }))}</p></div>` +
      `<a class="btn btn-primary" href="/">+ ${escapeHtml(d.newReading)}</a></div>${list}</main>${siteFooterHtml(opts.ui, "/history")}<script type="module" src="/app/history.js"></script>`,
  });
}

function richText(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

// Section labels mirror public/app/draw.js (EN + TH, with or without
// **): the live reading and the history detail must parse the same
// model output the same way.
function sectionTitle(block: string, fallback: string): string {
  const m = block.match(/^\*\*([^*]+)\*\*/) || block.match(/^([^:\n]+):/);
  return (m?.[1] ?? fallback).trim() || fallback;
}

function sectionBody(block: string): string {
  return block.replace(/^\*\*[^*]+\*\*:?\s*/, "").replace(/^[^:\n]+:\s*/, "");
}

type HistorySection = { kind: "card" | "section" | "strip"; html: string };

function renderHistorySection(block: string): HistorySection {
  const b = block;
  if (/^(?:\*\*)?(?:Summary|\u0e2a\u0e23\u0e38\u0e1b)\s*(?:\*\*)?\s*:/i.test(b)) {
    // Already shown as the bold lead: never render twice.
    return { kind: "strip", html: "" };
  }
  if (/^\*\*(\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33|Guidance)/.test(b) || /^Guidance:/.test(b)) {
    return {
      kind: "section",
      html: `<div class="sec sec-guidance"><h2 class="sec-title">${escapeHtml(sectionTitle(b, "Guidance"))}</h2><p>${richText(sectionBody(b))}</p></div>`,
    };
  }
  if (/^(\*\*)?(\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e17\u0e33\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22|\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33|What to do|Advice)/.test(b)) {
    const title = sectionTitle(b, "What to do");
    const items = sectionBody(b)
      .split(/\s\u00b7\s|\n-\s*/)
      .map((x) => x.trim().replace(/^-\s*/, ""))
      .filter(Boolean);
    if (items.length > 1) {
      return {
        kind: "section",
        html: `<div class="sec sec-advice"><h2 class="sec-title">${escapeHtml(title)}</h2><ol>` +
          items.map((x) => `<li>${richText(x)}</li>`).join("") + `</ol></div>`,
      };
    }
    return {
      kind: "section",
      html: `<div class="sec sec-advice"><h2 class="sec-title">${escapeHtml(title)}</h2><p>${richText(sectionBody(b))}</p></div>`,
    };
  }
  if (/^(\*\*)?(\u0e15\u0e48\u0e2d\u0e44\u0e1b|What next)/.test(b)) {
    return {
      kind: "section",
      html: `<div class="sec sec-guidance"><h2 class="sec-title">${escapeHtml(sectionTitle(b, "What next"))}</h2><p>${richText(sectionBody(b))}</p></div>`,
    };
  }
  if (/^(\*\*)?(\u0e25\u0e2d\u0e07\u0e16\u0e32\u0e21\u0e15\u0e48\u0e2d|Explore further)/.test(b)) {
    const title = sectionTitle(b, "Explore further");
    const items = sectionBody(b)
      .split(/\n/)
      .map((x) => x.replace(/^-\s*/, "").trim())
      .filter(Boolean);
    return {
      kind: "section",
      html: `<div class="sec sec-follow"><h2 class="sec-title">${escapeHtml(title)}</h2><div class="follow-btns">` +
        items.map((q) => `<a class="follow-btn" href="/?prefill=${encodeURIComponent(q)}">${escapeHtml(q)}</a>`).join("") +
        `</div></div>`,
    };
  }
  if (/^\*\*(\u0e04\u0e33\u0e40\u0e15\u0e37\u0e2d\u0e19\u0e08\u0e32\u0e01\u0e44\u0e1e\u0e48|Warning)/.test(b)) {
    return { kind: "section", html: `<p class="sec sec-warning">${richText(b)}</p>` };
  }
  const nl = b.indexOf("\n");
  if (nl > 0) {
    const first = b.slice(0, nl);
    const body = b.slice(nl + 1);
    return { kind: "card", html: `<h3 class="detail-sub">${richText(first)}</h3><p>${richText(body)}</p>` };
  }
  return { kind: "card", html: `<p>${richText(b)}</p>` };
}

export function historyDetailPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  reading: {
    id: string;
    topicLabel: string;
    question: string;
    dateLabel?: string;
    positions?: string[];
    summary?: string | null;
    cards: { name: string; image: string; image2x: string; reversed: boolean; reversedLabel: string }[];
    aiText: string | null;
    journal: string | null;
    status: string;
  };
  /** Server-rendered header initial + token balance (no first-paint flash). */
  account?: HeaderAccount;
}): string {
  const d = t(opts.ui);
  const r = opts.reading;
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/history", account: opts.account });
  const cards = r.cards
    .map(
      (card, i) =>
        `<figure class="detail-card">${r.positions?.[i] ? `<span class="detail-pos">${escapeHtml(r.positions[i])}</span>` : ""}<img src="${escapeHtml(card.image)}" srcset="${escapeHtml(card.image2x)} 2x" alt="${escapeHtml(card.name)}"${card.reversed ? ' class="rev"' : ""}><figcaption>${escapeHtml(card.name)}${card.reversed ? ` (${escapeHtml(card.reversedLabel)})` : ""}</figcaption></figure>`,
    )
    .join("");
  let readingHtml = "";
  if (r.aiText) {
    const blocks = r.aiText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const overview = (blocks[0] ?? "").replace(
      /^\s*(?:\*\*)?(?:Overview|\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21)\s*(?:\*\*)?\s*:?\s*(?:\*\*)?\s*\n?/i,
      "",
    );
    const cards: string[] = [];
    const sections: string[] = [];
    for (const b of blocks.slice(1)) {
      const s = renderHistorySection(b);
      if (s.kind === "card") cards.push(s.html);
      else if (s.html) sections.push(s.html);
    }
    readingHtml =
      `<section class="panel-card detail-overview"><h2>${escapeHtml(d.overviewTitle)}</h2>` +
      (r.summary ? `<p class="detail-lead"><b>${escapeHtml(r.summary)}</b></p>` : "") +
      `<p>${richText(overview)}</p></section>` +
      (cards.length ? `<section class="panel-card"><h2>${escapeHtml(d.eachCardTitle)}</h2>${cards.join("")}</section>` : "") +
      (sections.length ? `<div class="rtext">${sections.join("")}</div>` : "");
  }
  return pageShell({
    title: `${d.yourReading} \u00b7 TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body:
      `${head}<main class="reading-detail" data-reading="${escapeHtml(r.id)}">` +
      `<p><a class="back-link" href="/history">&lsaquo; ${escapeHtml(d.historyTitle)}</a></p>` +
      `<p class="hist-meta"><span class="topic-pill">${escapeHtml(r.topicLabel)}</span>${r.dateLabel ? `<span class="hist-date">${escapeHtml(r.dateLabel)}</span>` : ""}</p>` +
      `<blockquote class="question">&ldquo;${escapeHtml(r.question)}&rdquo;</blockquote>` +
      `<div class="detail-cards">${cards}</div>` +
      readingHtml +
      `<form id="journal-form"><label for="journal">${escapeHtml(d.journalLabel)}</label>` +
      `<textarea id="journal" rows="3" maxlength="500">${escapeHtml(r.journal ?? "")}</textarea>` +
      `<button class="btn btn-outline" type="submit">${escapeHtml(d.journalSave)}</button>` +
      `<span class="journal-ok" data-journal-ok hidden>${escapeHtml(d.journalSaved)}</span></form>` +
      `<p class="muted">${escapeHtml(opts.ui === "th" ? "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e01\u0e32\u0e23\u0e17\u0e1a\u0e17\u0e27\u0e19\u0e41\u0e25\u0e30\u0e04\u0e27\u0e32\u0e21\u0e1a\u0e31\u0e19\u0e40\u0e17\u0e34\u0e07 \u0e42\u0e1b\u0e23\u0e14\u0e43\u0e0a\u0e49\u0e27\u0e34\u0e08\u0e32\u0e23\u0e13\u0e0d\u0e32\u0e13\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e40\u0e2d\u0e07" : "For reflection and entertainment. Please use your own judgment.")}</p>` +
      `<div class="actions"><button class="btn" type="button" data-share-reading>${escapeHtml(d.share)}</button>` +
      `<a class="btn btn-outline" href="/?prefill=${encodeURIComponent(r.question)}">${escapeHtml(d.followUpLabel)}</a>` +
      `<button class="btn btn-outline" type="button" data-delete-reading>${escapeHtml(d.deleteReading)}</button></div>` +
      `</main>${siteFooterHtml(opts.ui, "/history")}` +
      `<script src="/app/share.js" defer></script><script type="module" src="/app/history.js"></script>`,
  });
}
