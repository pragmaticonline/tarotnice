// Card library: /cards index (groups: major + 4 suits) and the
// per-card detail. Only reviewed entries are indexable; drafts render
// with noindex until the owner approves them (content/REVIEW.md).
import { escapeHtml } from "../lib/html";
import { t, type UiLang } from "../lib/i18n";
import { brandHtml, headerHtml, pageShell, siteFooterHtml } from "./shell";
import type { StreakInfo } from "../lib/streaks";

export type LibraryCard = {
  id: number;
  slug: string;
  name: string;
  image: string;
  image2x: string;
  reviewed: boolean;
};

export type LibraryGroup = { title: string; cards: LibraryCard[] };

export function cardsPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  groups: LibraryGroup[];
}): string {
  const d = t(opts.ui);
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/cards" });
  const groups = opts.groups
    .map(
      (g) =>
        `<section class="lib-group"><h2>${escapeHtml(g.title)}</h2><div class="lib-grid">` +
        g.cards
          .map(
            (card) =>
              `<a class="lib-card" href="/cards/${escapeHtml(card.slug)}"><img src="${escapeHtml(card.image)}" loading="lazy" alt="${escapeHtml(card.name)}"><span>${escapeHtml(card.name)}</span>${card.reviewed ? "" : ` <em class="draft">${escapeHtml(d.draftNote)}</em>`}</a>`,
          )
          .join("") +
        `</div></section>`,
    )
    .join("");
  return pageShell({
    title: `${d.cardsTitle} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    canonicalPath: "/cards",
    description: d.cardsLede,
    body: `${head}<main><h1 class="display">${escapeHtml(d.cardsTitle)}</h1><p class="muted">${escapeHtml(d.cardsLede)}</p>${groups}</main>${siteFooterHtml(opts.ui, "/cards")}`,
  });
}

export type LibraryDetail = {
  slug: string;
  name: string;
  image: string;
  image2x: string;
  reviewed: boolean;
  keywordsUpright: string[];
  keywordsReversed: string[];
  upright: string;
  reversed: string;
  notes: { label: string; text: string }[];
  prev: { slug: string; name: string } | null;
  next: { slug: string; name: string } | null;
};

export function cardDetailPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  card: LibraryDetail;
}): string {
  const d = t(opts.ui);
  const card = opts.card;
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/cards" });
  const notes = card.notes
    .map((n) => `<section class="meaning-note"><h2>${escapeHtml(n.label)}</h2><p>${escapeHtml(n.text)}</p></section>`)
    .join("");
  const nav =
    `<nav class="card-nav">` +
    (card.prev ? `<a href="/cards/${escapeHtml(card.prev.slug)}">&larr; ${escapeHtml(card.prev.name)}</a>` : `<span></span>`) +
    (card.next ? `<a href="/cards/${escapeHtml(card.next.slug)}">${escapeHtml(card.next.name)} &rarr;</a>` : `<span></span>`) +
    `</nav>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: card.name,
    inLanguage: opts.ui,
    publisher: { "@type": "Organization", name: "TarotNice" },
  }).replace(/</g, "\\u003c");
  return pageShell({
    title: `${card.name} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    canonicalPath: `/cards/${card.slug}`,
    description: card.upright.slice(0, 160),
    noindex: !card.reviewed,
    jsonLd,
    body:
      `${head}<main class="card-detail"><p><a class="btn-outline btn" href="/cards">&larr; ${escapeHtml(d.cardsTitle)}</a></p>` +
      `<h1 class="display">${escapeHtml(card.name)}</h1>` +
      (card.reviewed ? "" : `<p class="draft-line">${escapeHtml(d.draftNote)}</p>`) +
      `<img class="detail-art" src="${escapeHtml(card.image)}" srcset="${escapeHtml(card.image2x)} 2x" alt="${escapeHtml(card.name)}">` +
      `<section class="meaning-note"><h2>${escapeHtml(d.upright)}</h2><p>${escapeHtml(card.upright)}</p><p class="keywords">${escapeHtml(card.keywordsUpright.join(" · "))}</p></section>` +
      `<section class="meaning-note"><h2>${escapeHtml(d.reversed)}</h2><p>${escapeHtml(card.reversed)}</p><p class="keywords">${escapeHtml(card.keywordsReversed.join(" · "))}</p></section>` +
      notes +
      nav +
      `</main>${siteFooterHtml(opts.ui, "/cards")}`,
  });
}
