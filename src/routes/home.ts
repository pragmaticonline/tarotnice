// Home / draw screen: quota row, daily card block, ask form with
// topic chips, the draw stage (slots + deck mount), and Ngern with
// the speech bubble. The shuffle/fan/pick/flip choreography lives in
// public/app/draw.js; this file owns the static structure it builds on.
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { isInviteCode } from "../lib/invite";
import { PACK_LIST } from "../lib/stripe";
import { computeStreak, localDayString } from "../lib/streaks";
import { headerHtml, pageShell, siteFooterHtml, type HeaderAccount } from "./shell";

export type HomeOpts = {
  uiLang?: UiLang;
  origin?: string;
  streakDays?: string[];
  /** Turnstile site key (public). Empty/undefined renders no widget. */
  turnstileSiteKey?: string;
  /** Invite landing banner (design board 2) when arriving via /r/NICE-XXXX. */
  invite?: { code: string; inviterName: string | null } | null;
  /** Server-rendered header initial + token balance (no first-paint flash). */
  account?: HeaderAccount;
};

export type Topic = "love" | "career" | "money" | "health" | "general";

export const TOPICS: { code: Topic; labelKey: "topicLove" | "topicCareer" | "topicMoney" | "topicHealth" | "topicGeneral" }[] = [
  { code: "love", labelKey: "topicLove" },
  { code: "career", labelKey: "topicCareer" },
  { code: "money", labelKey: "topicMoney" },
  { code: "health", labelKey: "topicHealth" },
  { code: "general", labelKey: "topicGeneral" },
];

// Ngern sitting, inlined (from public/mascot/ngern-sitting.svg) so the
// prototype's cat animations can target .eyes/.head/.tail in page CSS.
export const NGERN_SITTING_SVG = `<svg class="ngern" width="120" height="142" viewBox="0 0 120 142" role="img" aria-label="Ngern the Korat cat"><defs><linearGradient id="ngFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d2df"/><stop offset=".55" stop-color="#93a1b8"/><stop offset="1" stop-color="#6f7d96"/></linearGradient><radialGradient id="ngEye" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#d9e98a"/><stop offset=".55" stop-color="#8cc25e"/><stop offset="1" stop-color="#4f8a3d"/></radialGradient></defs><g class="tail"><path d="M84 132C103 133 109 118 103 104C101 99 98 97 96 98" fill="none" stroke="url(#ngFur)" stroke-width="7" stroke-linecap="round"/></g><path d="M35 136C25 121 28 94 37 78C41 68 46 60 60 60C74 60 79 68 83 78C92 94 95 121 85 136Z" fill="url(#ngFur)"/><path d="M51 70C46 92 49 116 55 132H65C71 116 74 92 69 70Z" fill="#c9d2df" opacity=".55"/><path d="M59.5 98V134" stroke="#6f7d96" stroke-width="1.2" opacity=".5"/><ellipse cx="52" cy="135" rx="7.5" ry="4" fill="#c9d2df"/><ellipse cx="67" cy="135" rx="7.5" ry="4" fill="#c9d2df"/><path d="M43 74Q60 83 77 74" fill="none" stroke="#b0832f" stroke-width="2.2" stroke-linecap="round"/><rect x="56.5" y="77.5" width="7" height="10" rx="1.4" fill="#4a3d78" stroke="#b0832f" stroke-width="1" transform="rotate(-6 60 82)"/><g class="head"><path d="M37 30C31 18 31 9 34 3C43 7 51 14 54 22Z" fill="url(#ngFur)"/><path d="M83 30C89 18 89 9 86 3C77 7 69 14 66 22Z" fill="url(#ngFur)"/><path d="M39 26C36 18 36 12 37 9C42 12 47 16 49 21Z" fill="#e3b3bb" opacity=".75"/><path d="M81 26C84 18 84 12 83 9C78 12 73 16 71 21Z" fill="#e3b3bb" opacity=".75"/><path d="M60 68C45 68 29 58 29 41C29 30 34 23 41 21C49 18 55 21 60 25C65 21 71 18 79 21C86 23 91 30 91 41C91 58 75 68 60 68Z" fill="url(#ngFur)"/><path d="M60 25C57 30 57 36 60 40C63 36 63 30 60 25Z" fill="#c9d2df" opacity=".5"/><g class="eyes"><path d="M40 43C40 37 44 34 48 34C53 34 56 38 56 43C56 48 52 50 48 50C44 50 40 48 40 43Z" fill="url(#ngEye)"/><path d="M64 43C64 38 67 34 72 34C76 34 80 37 80 43C80 48 76 50 72 50C68 50 64 48 64 43Z" fill="url(#ngEye)"/><path d="M48 36.5C46.6 39 46.6 47 48 49.5C49.4 47 49.4 39 48 36.5ZM72 36.5C70.6 39 70.6 47 72 49.5C73.4 47 73.4 39 72 36.5Z" class="pupil" fill="#1c2419"/><circle cx="50.5" cy="39.5" r="1.7" fill="#fff"/><circle cx="74.5" cy="39.5" r="1.7" fill="#fff"/><path d="M40 42C41 36 45 34 48 34C52 34 55 36 56 40M64 40C65 36 68 34 72 34C75 34 79 36 80 42" fill="none" stroke="#3b4256" stroke-width="1.3" stroke-linecap="round"/></g><path d="M57.5 55.5h5C62.5 57 61 58.5 60 58.5S57.5 57 57.5 55.5Z" fill="#5c647c"/><path d="M60 58.5v1.5M60 60c-1 1.8-3 2.3-4.5 1.6M60 60c1 1.8 3 2.3 4.5 1.6" fill="none" stroke="#5c647c" stroke-width="1.1" stroke-linecap="round"/><g stroke="#c9d2df" stroke-width=".8" stroke-linecap="round" opacity=".9"><path d="M50 57L34 54M50 59L35 60M76 54L86 57M70 57L86 54M70 59L85 60"/></g></g></svg>`;

function quotaRow(ui: UiLang): string {
  const d = t(ui);
  // Loading line (never a wrong count) until home.js paints fresh
  // /api/me/summary numbers. Dots reuse the .wdots pulse pattern.
  return `<span class="quota" role="status"><span class="moonstone" data-quota-gem hidden aria-hidden="true"></span><span data-quota-label>${escapeHtml(d.quotaLoading)}<span class="wdots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span></span>`;
}

export function homePage(opts: HomeOpts = {}): string {
  const ui = opts.uiLang ?? "en";
  const d = t(ui);
  const origin = opts.origin ?? "";
  const streak = computeStreak(opts.streakDays ?? [], localDayString());
  const head = headerHtml({ ui, streak, path: "/", account: opts.account });
  const steps = `<ol class="steps" aria-label="Steps">
<li class="step on" data-step-ind="1"><span class="step-bar"></span><span class="step-label">1 ${escapeHtml(d.stepAsk)}</span></li>
<li class="step" data-step-ind="2"><span class="step-bar"></span><span class="step-label">2 ${escapeHtml(d.stepDraw)}</span></li>
<li class="step" data-step-ind="3"><span class="step-bar"></span><span class="step-label">3 ${escapeHtml(d.stepRead)}</span></li>
</ol>`;
  const invite = opts.invite && isInviteCode(opts.invite.code) ? opts.invite : null;
  const inviteBanner = invite
    ? `<section class="invite-banner" aria-label="Invite">
<p class="invite-who">${escapeHtml(
        invite.inviterName
          ? (ui === "th" ? `${invite.inviterName} \u0e0a\u0e27\u0e19\u0e04\u0e38\u0e13\u0e21\u0e32\u0e14\u0e39\u0e14\u0e27\u0e07` : `${invite.inviterName} invited you to a reading`)
          : d.inviteBannerTitle,
      )}</p>
<p class="invite-sub">${escapeHtml(d.inviteBannerSub)}</p>
<p class="invite-code"><span>${escapeHtml(d.inviteCodeLabel)}</span> <b>${escapeHtml(invite.code)}</b> <span>${escapeHtml(d.inviteCodeSaved)}</span></p>
</section>
`
    : "";
  const body = `<main>
${inviteBanner}${steps}
<section id="step-ask" data-step="1">
<div class="guide guide-ask s-idle" id="guide-ask"><span class="ngern-wrap">${NGERN_SITTING_SVG}</span><p class="bubble">${escapeHtml(d.hintIdle)}</p></div>
<form id="ask-form" action="/api/readings" method="post" data-need="${escapeHtml(d.hintNeed)}">
<label class="ask-label" id="ask-label" for="q">${escapeHtml(d.ask)}</label>
<p class="muted fresh-ask-row" id="fresh-ask-row" hidden><button type="button" class="linklike" id="fresh-ask-link">${escapeHtml(d.freshAskLink)}</button></p>
<div class="q-wrap"><textarea id="q" name="question" rows="3" maxlength="300" placeholder="${escapeHtml(d.placeholder)}"></textarea><span class="q-inside"><span id="q-count">0</span>/300</span></div>
<p class="quota-line">${quotaRow(ui)}</p>
<p class="muted">${escapeHtml(d.eachReadingLine)}</p>
<button class="btn btn-primary" type="submit">${escapeHtml(d.shuffleCards)} <span class="shuffle-cost" aria-hidden="true">| <span class="moonstone"></span> <span class="shuffle-price">5 ${escapeHtml(d.tokensUnit)}</span></span></button>
<p class="muted">${escapeHtml(d.notSureAsk)}</p>
<div class="suggest-chips">${TOPICS.map((topic) => {
    const samples: Record<string, [string, string]> = {
      love: ["Will my relationship move forward?", "\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e21\u0e1e\u0e31\u0e19\u0e18\u0e4c\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19\u0e08\u0e30\u0e40\u0e14\u0e34\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e48\u0e2d\u0e44\u0e2b\u0e21"],
      career: ["Should I take the new job?", "\u0e09\u0e31\u0e19\u0e04\u0e27\u0e23\u0e23\u0e31\u0e1a\u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e44\u0e2b\u0e21"],
      money: ["Will my finances improve this month?", "\u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e08\u0e30\u0e14\u0e35\u0e02\u0e36\u0e49\u0e19\u0e44\u0e2b\u0e21"],
      health: ["How can I feel less stressed?", "\u0e09\u0e31\u0e19\u0e08\u0e30\u0e40\u0e04\u0e23\u0e35\u0e22\u0e14\u0e19\u0e49\u0e2d\u0e22\u0e25\u0e07\u0e44\u0e14\u0e49\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23"],
      general: ["What should I focus on this week?", "\u0e2a\u0e31\u0e1b\u0e14\u0e32\u0e2b\u0e4c\u0e19\u0e35\u0e49\u0e09\u0e31\u0e19\u0e04\u0e27\u0e23\u0e42\u0e1f\u0e01\u0e31\u0e2a\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e2d\u0e30\u0e44\u0e23"],
    };
    const sample = samples[topic.code][ui === "th" ? 1 : 0];
    return `<button type="button" class="suggest-chip" data-suggest="${escapeHtml(sample)}" data-topic="${topic.code}">${escapeHtml(sample)}</button>`;
  }).join("")}</div>
${opts.turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(opts.turnstileSiteKey)}" data-size="invisible"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" defer></script>` : ""}
</form>
</section>
<section id="step-draw" data-step="2" hidden>
<div class="draw-top"><button type="button" class="draw-back" id="draw-back" aria-label="Back">\u2190</button><p class="draw-q" id="draw-q"></p></div>
<div id="draw-stage" class="stage" aria-live="polite"><div class="slots"><span class="slot"></span><span class="slot"></span><span class="slot"></span></div><div class="deck" id="deck"></div></div>
<div id="guide" class="guide s-idle"><span class="ngern-wrap">${NGERN_SITTING_SVG.replaceAll("ngFur", "ngFurD").replaceAll("ngEye", "ngEyeD")}</span><p class="bubble">${escapeHtml(d.hintIdle)}</p></div>
</section>
<section id="step-read" data-step="3" hidden>
<p class="read-eyebrow" id="read-eyebrow"></p>
<h1 class="draw-q read-q" id="read-q"></h1>
<div class="read-cards" id="read-cards"></div>
<div id="reading" class="reading"></div>
<div class="followup-box" id="followup-box" hidden>
<label for="followup-q">${escapeHtml(d.followUpLabel)}</label>
<textarea id="followup-q" rows="2" maxlength="300"></textarea>
<button class="btn btn-primary" type="button" id="followup-ask">${escapeHtml(d.askNgernTokens)}</button>
</div>
<div class="guest-gate" id="guest-gate" hidden>
<h2>${escapeHtml(d.guestGateTitle)}</h2>
<p>${escapeHtml(d.guestGateText)}</p>
<p class="guest-gate-actions"><a class="btn btn-primary" href="/sign-in">${escapeHtml(d.signInToKeep)}</a><a class="btn btn-outline" href="/register">${escapeHtml(d.createAccountHeading)}</a></p>
</div>
<div class="sheet" id="pack-sheet" hidden>
<div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="pack-sheet-title">
<p class="drawer-back-row"><button type="button" id="pack-sheet-close" aria-label="Close">&times;</button></p>
<h2 id="pack-sheet-title">${escapeHtml(d.topUpTitle)}</h2>
<p data-pack-balance></p>
<p class="muted" data-pack-pending-wrap hidden>${escapeHtml(d.waitingToAsk)} &ldquo;<span data-pack-pending></span>&rdquo;</p>
<div data-pack-list></div>
<div class="redeem-box">
<h3>${escapeHtml(d.redeemTitle)}</h3>
<p>${escapeHtml(d.redeemHint)}</p>
<div class="redeem-row"><input id="sheet-code" maxlength="32" autocomplete="off" placeholder="NICE-XXXX"><button type="button" class="btn btn-outline" id="sheet-apply">${escapeHtml(d.redeemBtn)}</button></div>
<p class="auth-err" id="sheet-code-msg" role="alert"></p>
<p id="sheet-code-applied" hidden></p>
<p><button type="button" class="linklike" id="sheet-code-remove" hidden>${escapeHtml(d.removeBtn)}</button></p>
</div>
<p><button type="button" class="btn btn-primary" id="pack-pay">${escapeHtml(d.payAndAsk)}</button></p>
<p class="muted">${escapeHtml(d.secureLine)} \u00b7 PromptPay \u00b7 Visa \u00b7 Mastercard</p>
<p><a href="/invite">${escapeHtml(d.orInviteFree)}</a></p>
<p data-pack-guest hidden><a class="btn btn-primary" href="/sign-in">${escapeHtml(d.signInToKeep)}</a></p>
</div>
</div>
<script>window.__tnPacks=${JSON.stringify(PACK_LIST.map((p) => ({ id: p.id, tokens: p.tokens, thb: p.thb })))};window.__tnSheet=${JSON.stringify({ mostPopular: d.mostPopular, redeemOk: d.redeemOk, redeemInvalid: d.redeemInvalid, redeemExpired: d.redeemExpired, redeemUsed: d.redeemUsed, redeemOwn: d.redeemOwn, readingsCount: d.readingsCount, topUpSub: d.topUpSub })};</script>
</section>
</main>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#org`, name: "TarotNice", url: origin, logo: `${origin}/mascot/ngern-head-mark.svg` },
      { "@type": "WebSite", url: origin, name: "TarotNice", publisher: { "@id": `${origin}/#org` }, inLanguage: ["th", "en"] },
    ],
  }).replace(/</g, "\\u003c");
  return pageShell({
    title: `TarotNice \u2014 ${d.homeTitle}`,
    lang: ui,
    origin,
    canonicalPath: "/",
    description: d.homeLede,
    extraHead: `<script src="/app/home.js" defer></script><script src="/app/draw.js" defer></script><script src="/app/ask.js" defer></script><script src="/app/share.js" defer></script>`,
    jsonLd,
    body: `${head}${body}${siteFooterHtml(ui, "/")}`,
  });
}
