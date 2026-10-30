// Billing page: balance header, pack cards, and the Transactions /
// Referrals history (design boards 1 + token spec). Client behaviour
// (tabs, filters, copy, buy) lives in public/app/billing.js; this file
// renders structure only, with live data loaded from the JSON APIs.
import { escapeHtml } from "../lib/html";
import { t, type UiLang } from "../lib/i18n";
import { PACK_LIST, tokensConfigured, type StripeEnv } from "../lib/stripe";
import { headerHtml, pageShell, siteFooterHtml } from "./shell";

/** Same-origin return path for post-billing navigation. Single leading
 * slash only (mirrors nicelingo). */
export function safeReturnPath(raw: string | undefined | null): string {
  if (typeof raw !== "string" || !/^\/(?!\/)[^\s\\"<>\\]*$/.test(raw)) {
    return "/";
  }
  return raw;
}

/** Stripe success/cancel URLs carrying the return target through checkout. */
export function checkoutReturnUrls(
  origin: string,
  rawReturn: string | undefined | null,
): { successUrl: string; cancelUrl: string } {
  const ret = encodeURIComponent(safeReturnPath(rawReturn));
  return {
    successUrl: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}&return=${ret}`,
    cancelUrl: `${origin}/billing/cancel?return=${ret}`,
  };
}

export function billingPage(opts: {
  ui: UiLang;
  origin: string;
  env: StripeEnv;
  /** Current balances for the header (server-rendered, no flash). */
  balance: number;
  freeLeft: number;
}): string {
  const d = t(opts.ui);
  const configured = tokensConfigured(opts.env);
  const packs = PACK_LIST.map((pack) => {
    const note = pack.promptPayOnly ? d.promptPayOnlyNote : d.cardAlsoNote;
    return `<li class="pack">
<p class="pack-tokens"><b>${pack.tokens}</b> ${escapeHtml(d.tokensUnit)}</p>
<p class="pack-price">\u0e3f${pack.thb}</p>
<p class="pack-note">${escapeHtml(note)}</p>
<button type="button" class="btn" data-buy="${pack.id}">${escapeHtml(d.buyBtn)}</button>
</li>`;
  }).join("\n");
  const body = `<main>
${headerHtml({ ui: opts.ui, streak: { current: 0, longest: 0, activeToday: false }, path: "/billing" })}
<h1 class="display">${escapeHtml(d.billingTitle)}</h1>
<section class="balance-card" aria-label="${escapeHtml(d.billingBalance)}">
<p class="balance-row"><span>${escapeHtml(d.billingBalance)}</span><b id="balance-value">${opts.balance}</b></p>
<p class="balance-row"><span>${escapeHtml(d.freeTodayLabel)}</span><b id="free-value">${opts.freeLeft}/5</b></p>
</section>
${configured ? `<h2>${escapeHtml(d.packsTitle)}</h2>
<ul class="packs">${packs}</ul>` : ""}
<section class="history" aria-label="${escapeHtml(d.historyTxTitle)}">
<div class="tabs" role="tablist">
<button type="button" role="tab" aria-selected="true" data-tab="tx">${escapeHtml(d.txTab)}</button>
<button type="button" role="tab" aria-selected="false" data-tab="ref">${escapeHtml(d.refTab)}</button>
</div>
<div class="tab-panel" data-panel="tx">
<div class="filters" role="group" aria-label="Filter">
<button type="button" data-filter="all" aria-pressed="true">${escapeHtml(d.filterAll)}</button>
<button type="button" data-filter="topup" aria-pressed="false">${escapeHtml(d.filterTopup)}</button>
<button type="button" data-filter="daily" aria-pressed="false">${escapeHtml(d.filterDaily)}</button>
<button type="button" data-filter="reading" aria-pressed="false">${escapeHtml(d.filterReading)}</button>
</div>
<ul class="tx-list" id="tx-list"></ul>
<p class="tx-empty" id="tx-empty" hidden>${escapeHtml(d.txEmpty)}</p>
<button type="button" class="btn btn-outline" id="tx-more" hidden>${escapeHtml(d.loadMoreBtn)}</button>
</div>
<div class="tab-panel" data-panel="ref" hidden>
<h2>${escapeHtml(d.inviteTitle)}</h2>
<p class="invite-sub">${escapeHtml(d.inviteSub)}</p>
<div class="invite-gets">
<div><h3>${escapeHtml(d.inviteYouGet)}</h3><p>${escapeHtml(d.inviteYouGetText)}</p></div>
<div><h3>${escapeHtml(d.inviteFriendGets)}</h3><p>${escapeHtml(d.inviteFriendGetsText)}</p></div>
</div>
<p class="invite-code-label">${escapeHtml(d.inviteYourCode)}</p>
<p class="invite-code-row"><b id="invite-code"></b> <button type="button" class="btn btn-outline" id="copy-code">${escapeHtml(d.copyBtn)}</button></p>
<p class="invite-link-row"><span id="invite-link"></span> <button type="button" class="btn btn-outline" id="copy-link">${escapeHtml(d.copyLinkBtn)}</button></p>
<h3>${escapeHtml(d.shareWithFriends)}</h3>
<p class="share-row">
<button type="button" class="btn btn-outline" data-share-invite="line">LINE</button>
<button type="button" class="btn btn-outline" data-share-invite="facebook">Facebook</button>
<a class="btn btn-outline" id="invite-image" href="/invite.png" download>${escapeHtml(d.share)} · 1080</a>
</p>
<p class="msg-label">${escapeHtml(d.messagePreviewLabel)}</p>
<p class="msg-preview" id="invite-message"></p>
<h3>${escapeHtml(d.howItWorks)}</h3>
<ol class="how-steps">
<li>${escapeHtml(d.howStep1)}</li>
<li>${escapeHtml(d.howStep2)}</li>
<li>${escapeHtml(d.howStep3)}</li>
</ol>
<h3>${escapeHtml(d.yourFriends)} <span id="friends-counts"></span></h3>
<p class="friends-progress" id="friends-progress"></p>
<ul class="friend-list" id="friend-list"></ul>
<p class="invite-terms">${escapeHtml(d.inviteTermsLine)}</p>
</div>
</section>
</main>`;
  return pageShell({
    title: `TarotNice — ${d.billingTitle}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    extraHead: `<script src="/app/billing.js" defer></script>`,
    body: `${body}${siteFooterHtml(opts.ui, "/billing")}`,
  });
}

export function billingSuccessPage(opts: {
  ui: UiLang;
  origin: string;
  returnTo: string;
  state: "verified" | "pending" | "failed";
}): string {
  const d = t(opts.ui);
  const text = opts.state === "verified" ? d.successVerified : opts.state === "pending" ? d.successPending : d.successFailed;
  const body = `<main>
${headerHtml({ ui: opts.ui, streak: { current: 0, longest: 0, activeToday: false }, path: "/billing" })}
<h1 class="display">${escapeHtml(d.successTitle)}</h1>
<p>${escapeHtml(text)}</p>
<p><a class="btn btn-primary" href="${escapeHtml(opts.returnTo)}">${escapeHtml(d.askMoreCta)}</a></p>
<p><a href="/billing">${escapeHtml(d.backToBilling)}</a></p>
</main>`;
  return pageShell({
    title: `TarotNice — ${d.successTitle}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body: `${body}${siteFooterHtml(opts.ui, "/billing")}`,
  });
}

export function billingCancelPage(opts: { ui: UiLang; origin: string; returnTo: string }): string {
  const d = t(opts.ui);
  const body = `<main>
${headerHtml({ ui: opts.ui, streak: { current: 0, longest: 0, activeToday: false }, path: "/billing" })}
<h1 class="display">${escapeHtml(d.cancelTitle)}</h1>
<p>${escapeHtml(d.cancelText)}</p>
<p><a class="btn btn-primary" href="/billing">${escapeHtml(d.backToBilling)}</a></p>
<p><a href="${escapeHtml(opts.returnTo)}">${escapeHtml(d.backToHome)}</a></p>
</main>`;
  return pageShell({
    title: `TarotNice — ${d.cancelTitle}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body: `${body}${siteFooterHtml(opts.ui, "/billing")}`,
  });
}
