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

export type LibraryGroup = { title: string; key: string; cards: LibraryCard[] };

export function cardsPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  groups: LibraryGroup[];
  /** "" for /cards, "/th" for the Thai URL tree. */
  prefix?: string;
}): string {
  const d = t(opts.ui);
  const prefix = opts.prefix ?? "";
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: `${prefix}/cards` });
  const total = opts.groups.reduce((n, g) => n + g.cards.length, 0);
  const tabs =
    `<button type="button" class="lib-tab on" data-lib-tab="all">${escapeHtml(d.allCards)} ${total}</button>` +
    opts.groups
      .map((g) => `<button type="button" class="lib-tab" data-lib-tab="${escapeHtml(g.key)}">${escapeHtml(g.title)} ${g.cards.length}</button>`)
      .join("");
  const groups = opts.groups
    .map(
      (g) =>
        `<section class="lib-group" data-lib-group="${escapeHtml(g.key)}"><h2>${escapeHtml(g.title)}</h2><div class="lib-grid">` +
        g.cards
          .map(
            (card) =>
              `<a class="lib-card" data-lib-card data-name="${escapeHtml(card.name.toLowerCase())}" href="${prefix}/cards/${escapeHtml(card.slug)}"><img src="${escapeHtml(card.image)}" loading="lazy" alt="${escapeHtml(card.name)}"><span>${escapeHtml(card.name)}</span>${card.reviewed ? "" : ` <em class="draft">${escapeHtml(d.draftNote)}</em>`}</a>`,
          )
          .join("") +
        `</div></section>`,
    )
    .join("");
  const script = `<script>
(function () {
  var tab = "all";
  var input = document.getElementById("lib-search");
  function apply() {
    var q = (input.value || "").trim().toLowerCase();
    var visible = 0;
    document.querySelectorAll("[data-lib-card]").forEach(function (card) {
      var group = card.closest("[data-lib-group]").getAttribute("data-lib-group");
      var show = (tab === "all" || group === tab) && (!q || card.getAttribute("data-name").indexOf(q) >= 0);
      card.hidden = !show;
      if (show) visible++;
    });
    document.querySelectorAll("[data-lib-group]").forEach(function (g) {
      g.hidden = !g.querySelector("[data-lib-card]:not([hidden])");
    });
    var empty = document.getElementById("lib-empty");
    empty.hidden = visible > 0;
    empty.textContent = ${JSON.stringify(d.noCardsMatch)}.replace("{q}", input.value.trim());
  }
  document.querySelectorAll("[data-lib-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      tab = b.getAttribute("data-lib-tab");
      document.querySelectorAll("[data-lib-tab]").forEach(function (x) { x.classList.toggle("on", x === b); });
      apply();
    });
  });
  input.addEventListener("input", apply);
})();
</script>`;
  return pageShell({
    title: `${d.cardsTitle} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    canonicalPath: `${prefix}/cards`,
    description: d.cardsLede,
    body: `${head}<main><h1 class="display">${escapeHtml(d.cardsTitle)}</h1><p class="muted">${escapeHtml(d.cardsLede)}</p><div class="lib-search"><input id="lib-search" type="search" placeholder="${escapeHtml(d.searchCards)}" aria-label="${escapeHtml(d.searchCards)}"></div><div class="lib-tabs">${tabs}</div>${groups}<p class="lib-empty" id="lib-empty" hidden></p></main>${script}${siteFooterHtml(opts.ui, `${prefix}/cards`)}`,
  });
}

export type LibraryDetail = {
  slug: string;
  name: string;
  /** Board eyebrow, e.g. "MAJOR ARCANA · 0". */
  arcanaLabel?: string;
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
  /** "" for /cards, "/th" for the Thai URL tree. */
  prefix?: string;
}): string {
  const d = t(opts.ui);
  const card = opts.card;
  const prefix = opts.prefix ?? "";
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: `${prefix}/cards` });
  const notes = card.notes
    .map((n) => `<section class="meaning-note"><h2>${escapeHtml(n.label)}</h2><p>${escapeHtml(n.text)}</p></section>`)
    .join("");
  const nav =
    `<nav class="card-nav">` +
    (card.prev ? `<a href="${prefix}/cards/${escapeHtml(card.prev.slug)}">&larr; ${escapeHtml(card.prev.name)}</a>` : `<span></span>`) +
    (card.next ? `<a href="${prefix}/cards/${escapeHtml(card.next.slug)}">${escapeHtml(card.next.name)} &rarr;</a>` : `<span></span>`) +
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
    canonicalPath: `${prefix}/cards/${card.slug}`,
    description: card.upright.slice(0, 160),
    noindex: !card.reviewed,
    jsonLd,
    body:
      `${head}<main class="card-detail"><p><a class="btn-outline btn" href="${prefix}/cards">&larr; ${escapeHtml(d.cardsTitle)}</a></p>` +
      (card.arcanaLabel ? `<p class="detail-pos">${escapeHtml(card.arcanaLabel)}</p>` : "") +
      `<h1 class="display">${escapeHtml(card.name)}</h1>` +
      (card.reviewed ? "" : `<p class="draft-line">${escapeHtml(d.draftNote)}</p>`) +
      `<img class="detail-art" src="${escapeHtml(card.image)}" srcset="${escapeHtml(card.image2x)} 2x" alt="${escapeHtml(card.name)}">` +
      `<div class="card-orient" role="group"><button type="button" class="lib-tab on" data-orient="upright">${escapeHtml(d.upright)}</button><button type="button" class="lib-tab" data-orient="reversed">${escapeHtml(d.reversed)}</button></div>` +
      `<section class="meaning-note" data-orient-panel="upright"><p>${escapeHtml(card.upright)}</p><p class="kw-chips">${card.keywordsUpright.map((k) => `<span class="kw-chip">${escapeHtml(k)}</span>`).join("")}</p></section>` +
      `<section class="meaning-note" data-orient-panel="reversed" hidden><p>${escapeHtml(card.reversed)}</p><p class="kw-chips">${card.keywordsReversed.map((k) => `<span class="kw-chip">${escapeHtml(k)}</span>`).join("")}</p></section>` +
      notes +
      `<div class="guest-gate"><p>${escapeHtml(d.drewThisCard)}</p><p><a class="btn btn-primary" href="/">${escapeHtml(d.askNgern)}</a></p></div>` +
      nav +
      `<script>(function(){document.querySelectorAll("[data-orient]").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll("[data-orient]").forEach(function(x){x.classList.toggle("on",x===b)});document.querySelectorAll("[data-orient-panel]").forEach(function(p){p.hidden=p.getAttribute("data-orient-panel")!==b.getAttribute("data-orient")})})})})();</script>` +
      `</main>${siteFooterHtml(opts.ui, `${prefix}/cards`)}`,
  });
}
