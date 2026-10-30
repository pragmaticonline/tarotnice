// History: reverse-chron readings list (cursor pages of 30) and the
// per-reading detail with full text, journal editor, share, delete.
// Deletes and journal writes queue offline (public/app/history.js) and
// flush in order when the network returns.
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { headerHtml, pageShell, siteFooterHtml } from "./shell";
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

function stampLabel(ui: UiLang, createdAt: number): string {
  try {
    const f = new Intl.DateTimeFormat(ui === "th" ? "th-TH" : "en-GB", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
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
}): string {
  const d = t(opts.ui);
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/history" });
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
      const searchText = `${item.question} ${item.summary ?? ""} ${names}`.toLowerCase();
      parts.push(
        `<li class="history-item" data-reading-item data-topic="${escapeHtml(item.topic)}" data-search="${escapeHtml(searchText)}">` +
          `<a class="history-link" href="/history/${escapeHtml(item.id)}">` +
          `<span class="hist-thumbs">${thumbs}</span>` +
          `<span class="hist-main"><span class="hist-meta"><span class="topic-pill">${escapeHtml(item.topicLabel)}</span><span class="hist-date">${escapeHtml(stampLabel(opts.ui, item.createdAt))}</span>${item.status !== "complete" ? `<span class="history-status">${escapeHtml(item.status)}</span>` : ""}</span>` +
          `<span class="history-q">&ldquo;${escapeHtml(item.question)}&rdquo;</span>` +
          (item.summary ? `<span class="history-sum">${escapeHtml(item.summary)}</span>` : "") +
          (names ? `<span class="hist-cards">${escapeHtml(names)}</span>` : "") +
          `</span><span class="hist-chev" aria-hidden="true">&rsaquo;</span></a></li>`,
      );
    }
    if (lastMonth) parts.push(`</ol></section>`);
    list =
      `<div class="hist-tools"><label class="hist-search"><span aria-hidden="true">&#128269;</span><input type="search" data-history-search placeholder="${escapeHtml(d.searchQuestions)}" aria-label="${escapeHtml(d.searchQuestions)}"></label>${chips}</div>` +
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
      `<p class="muted">${escapeHtml(fmt(d.readingsCount, { n: opts.items.length }))}</p></div>` +
      `<a class="btn btn-primary" href="/">+ ${escapeHtml(d.newReading)}</a></div>${list}</main>${siteFooterHtml(opts.ui, "/history")}<script type="module" src="/app/history.js"></script>`,
  });
}

function richText(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
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
}): string {
  const d = t(opts.ui);
  const r = opts.reading;
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/history" });
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
    const rest = blocks.slice(1).map((b) => {
      const nl = b.indexOf("\n");
      if (nl > 0) {
        const first = b.slice(0, nl);
        const body = b.slice(nl + 1);
        return `<h3 class="detail-sub">${richText(first)}</h3><p>${richText(body)}</p>`;
      }
      return `<p>${richText(b)}</p>`;
    }).join("");
    readingHtml =
      `<section class="panel-card detail-overview"><h2>${escapeHtml(d.overviewTitle)}</h2>` +
      (r.summary ? `<p class="detail-lead"><b>${escapeHtml(r.summary)}</b></p>` : "") +
      `<p>${richText(overview)}</p></section>` +
      (rest ? `<section class="panel-card"><h2>${escapeHtml(d.eachCardTitle)}</h2>${rest}</section>` : "");
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
      `<div class="actions"><button class="btn" type="button" data-share-reading>${escapeHtml(d.share)}</button>` +
      `<button class="btn btn-outline" type="button" data-delete-reading>${escapeHtml(d.deleteReading)}</button></div>` +
      `</main>${siteFooterHtml(opts.ui, "/history")}` +
      `<script src="/app/share.js" defer></script><script type="module" src="/app/history.js"></script>`,
  });
}
