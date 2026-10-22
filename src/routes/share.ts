// Public shared pages: /r/:shareId (reading), /d/:shareId (daily).
// noindex. Shows card images + names, the one-line summary (never the
// full reading), the question only when the owner opted in, Ngern,
// and the "get your own free reading" CTA carrying ?ref=.
import { escapeHtml } from "../lib/html";
import { t, type UiLang } from "../lib/i18n";
import { brandHtml, pageShell } from "./shell";

export type LandingCard = {
  image: string;
  image2x: string;
  name: string;
  reversed: boolean;
  reversedLabel: string;
};

export function shareLandingPage(opts: {
  kind: "reading" | "daily";
  origin: string;
  shareId: string;
  ui: UiLang;
  cards: LandingCard[];
  summary: string;
  question: string | null;
  ogImage: string;
}): string {
  const d = t(opts.ui);
  const cta = `/?ref=${encodeURIComponent(opts.shareId)}`;
  const cards = opts.cards
    .map(
      (card) =>
        `<figure class="land-card"><img src="${escapeHtml(card.image)}" srcset="${escapeHtml(card.image2x)} 2x" alt="${escapeHtml(card.name)}" loading="eager"${card.reversed ? ' class="rev"' : ""}><figcaption>${escapeHtml(card.name)}${card.reversed ? ` (${escapeHtml(card.reversedLabel)})` : ""}</figcaption></figure>`,
    )
    .join("");
  return pageShell({
    title: `TarotNice \u2014 ${d.shareCta}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    description: opts.summary,
    ogImage: opts.ogImage,
    ogLocale: opts.ui === "th" ? "th_TH" : "en_US",
    body:
      `<header class="site-head">${brandHtml()}</header>` +
      `<main class="landing"><div class="land-cards">${cards}</div>` +
      (opts.question ? `<blockquote class="question">&ldquo;${escapeHtml(opts.question)}&rdquo;</blockquote>` : "") +
      `<p class="land-summary">${escapeHtml(opts.summary)}</p>` +
      `<div class="land-ngern"><img src="/mascot/ngern-sitting.svg" alt="Ngern the Korat cat" width="96" height="96"></div>` +
      `<a class="btn btn-primary" href="${cta}" data-share-cta>${escapeHtml(opts.ui === "th" ? "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e1f\u0e23\u0e35" : "Get your own free reading")}</a></main>`,
  });
}

/** Friendly 410 for unshared/unknown share links. */
export function unsharedPage(origin: string, ui: UiLang): string {
  const msg =
    ui === "th"
      ? "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e19\u0e35\u0e49\u0e16\u0e39\u0e01\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01\u0e01\u0e32\u0e23\u0e41\u0e0a\u0e23\u0e4c\u0e41\u0e25\u0e49\u0e27 \u0e41\u0e15\u0e48\u0e14\u0e27\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e23\u0e2d\u0e2d\u0e22\u0e39\u0e48"
      : "This share was removed, but your own reading is waiting.";
  const cta = ui === "th" ? "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e1f\u0e23\u0e35" : "Get your own free reading";
  return pageShell({
    title: "TarotNice",
    lang: ui,
    origin,
    noindex: true,
    body: `<header class="site-head">${brandHtml()}</header><main class="landing"><p class="land-summary">${escapeHtml(msg)}</p><a class="btn btn-primary" href="/">${escapeHtml(cta)}</a></main>`,
  });
}
