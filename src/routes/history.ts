// History: reverse-chron readings list (cursor pages of 30) and the
// per-reading detail with full text, journal editor, share, delete.
// Deletes and journal writes queue offline (public/app/history.js) and
// flush in order when the network returns.
import { escapeHtml } from "../lib/html";
import { t, type UiLang } from "../lib/i18n";
import { brandHtml, headerHtml, pageShell, siteFooterHtml } from "./shell";
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

export function historyPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  items: HistoryItem[];
  nextCursor: number | null;
}): string {
  const d = t(opts.ui);
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/history" });
  const list =
    opts.items.length === 0
      ? `<p class="empty">${escapeHtml(d.emptyHistory)}</p><p><a class="btn" href="/">${escapeHtml(d.shuffle)}</a></p>`
      : `<ol class="history-list">${opts.items
          .map(
            (item) =>
              `<li class="history-item" data-reading="${escapeHtml(item.id)}"><a class="history-link" href="/history/${escapeHtml(item.id)}"><span class="history-day">${escapeHtml(item.day)}</span><span class="history-topic">${escapeHtml(item.topicLabel)}</span><span class="history-q">${escapeHtml(item.question)}</span>${item.summary ? `<span class="history-sum">${escapeHtml(item.summary)}</span>` : ""}${item.status !== "complete" ? `<span class="history-status">${escapeHtml(item.status)}</span>` : ""}</a></li>`,
          )
          .join("")}</ol>` +
        (opts.nextCursor !== null
          ? `<p><a class="btn btn-outline" href="/history?cursor=${opts.nextCursor}">${escapeHtml(d.loadMore)}</a></p>`
          : "");
  return pageShell({
    title: `${d.historyTitle} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body: `${head}<main><h1 class="display">${escapeHtml(d.historyTitle)}</h1>${list}</main>${siteFooterHtml(opts.ui, "/history")}<script type="module" src="/app/history.js"></script>`,
  });
}

export function historyDetailPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  reading: {
    id: string;
    topicLabel: string;
    question: string;
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
      (card) =>
        `<figure class="detail-card"><img src="${escapeHtml(card.image)}" srcset="${escapeHtml(card.image2x)} 2x" alt="${escapeHtml(card.name)}"${card.reversed ? ' class="rev"' : ""}><figcaption>${escapeHtml(card.name)}${card.reversed ? ` (${escapeHtml(card.reversedLabel)})` : ""}</figcaption></figure>`,
    )
    .join("");
  return pageShell({
    title: `${d.yourReading} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body:
      `${head}<main class="reading-detail" data-reading="${escapeHtml(r.id)}">` +
      `<p><a class="btn-outline btn" href="/history">&larr; ${escapeHtml(d.historyTitle)}</a></p>` +
      `<p class="topic-chip">${escapeHtml(r.topicLabel)}</p>` +
      `<blockquote class="question">&ldquo;${escapeHtml(r.question)}&rdquo;</blockquote>` +
      `<div class="detail-cards">${cards}</div>` +
      (r.aiText ? `<div class="rc on"><p>${escapeHtml(r.aiText)}</p></div>` : "") +
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
