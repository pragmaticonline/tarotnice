// Billing page: balance header, pack cards, and the Transactions /
// Referrals history (design boards 1 + token spec). Client behaviour
// (tabs, filters, copy, buy) lives in public/app/billing.js; this file
// renders structure only, with live data loaded from the JSON APIs.
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { PACK_LIST, tokensConfigured, type StripeEnv } from "../lib/stripe";
import { headerHtml, pageShell, siteFooterHtml, type HeaderAccount } from "./shell";

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
  /** Server-rendered header initial + token balance (no first-paint flash). */
  account?: HeaderAccount;
}): string {
  const d = t(opts.ui);
  const configured = tokensConfigured(opts.env);
  const packs = PACK_LIST.map((pack) => {
    const note = pack.promptPayOnly ? d.promptPayOnlyNote : d.cardAlsoNote;
    const readings = pack.tokens / 5;
    const per = (pack.thb / pack.tokens).toFixed(2);
    const badge = pack.id === "premium" ? `<span class="pack-badge">${escapeHtml(d.bestValue)}</span>` : "";
    return `<li class="pack">${badge}
<p class="pack-tokens"><b>${pack.tokens}</b> ${escapeHtml(d.tokensUnit)}</p>
<p class="pack-price">\u0e3f${pack.thb}</p>
<p class="pack-note">${fmt(d.readingsCount, { n: readings })} \u00b7 ${fmt(d.perToken, { x: per })}</p>
<p class="pack-note">${escapeHtml(note)}</p>
<button type="button" class="btn" data-buy="${pack.id}">${escapeHtml(d.buyBtn)}</button>
</li>`;
  }).join("\n");
  const totalTokens = opts.balance + opts.freeLeft;
  const enoughReadings = Math.floor(totalTokens / 5);
  const body = `<main>
${headerHtml({ ui: opts.ui, streak: { current: 0, longest: 0, activeToday: false }, path: "/billing", account: opts.account })}
<h1 class="display">${escapeHtml(d.billingTitle)}</h1>
<section class="balance-card" aria-label="${escapeHtml(d.billingBalance)}">
<p class="balance-row"><span>${escapeHtml(d.billingBalance)}</span><span><span class="moonstone" aria-hidden="true"></span><b id="balance-value">${opts.balance}</b></span></p>
<p>${escapeHtml(fmt(d.enoughFor, { n: enoughReadings }))}</p>
<p class="balance-row"><span>${escapeHtml(d.freeTodayLabel)}</span><b id="free-value">${opts.freeLeft}/5</b></p>
<p class="pack-note">${escapeHtml(d.freeUsedFirst)}</p>
</section>
${configured ? `<h2>${escapeHtml(d.packsTitle)}</h2>
<p class="pack-note">${escapeHtml(d.neverExpire)}</p>
<ul class="packs">${packs}</ul>` : ""}
<section class="redeem-box" aria-label="${escapeHtml(d.redeemTitle)}">
<h2>${escapeHtml(d.redeemTitle)}</h2>
<p>${escapeHtml(d.redeemHint)}</p>
<div class="redeem-row"><input id="redeem-code" maxlength="32" autocomplete="off" placeholder="NICE-XXXX"><button type="button" class="btn" id="redeem-apply">${escapeHtml(d.redeemBtn)}</button></div>
<p class="line-redeem-note">${escapeHtml(d.lineRedeemPre)}<a href="https://line.me/R/add/@tarotnice" target="_blank" rel="noopener">${escapeHtml(d.lineRedeemLink)}</a>${escapeHtml(d.lineRedeemSuff)}</p>
<p class="auth-err" id="redeem-msg" role="alert"></p>
</section>
<script>window.__tnRedeemStrings=${JSON.stringify({ ok: d.redeemOk, invalid: d.redeemInvalid, expired: d.redeemExpired, used: d.redeemUsed, own: d.redeemOwn })};window.__tnTxStrings=${JSON.stringify({ read: d.readThisReading, receipt: d.viewReceipt })};</script>
<section class="history" id="activity" aria-label="${escapeHtml(d.historyTxTitle)}">
<div class="tabs" role="tablist">
<button type="button" role="tab" aria-selected="true" data-tab="tx">${escapeHtml(d.txTab)}</button>
<button type="button" role="tab" aria-selected="false" data-tab="ref">${escapeHtml(d.refTab)}</button>
</div>
<div class="tab-panel" data-panel="tx">
<p><a class="btn btn-outline" href="/invite">${escapeHtml(d.inviteActivityBanner)}</a></p>
<div class="filters" role="group" aria-label="Filter">
<button type="button" data-filter="all" aria-pressed="true">${escapeHtml(d.filterAll)}</button>
<button type="button" data-filter="topup" aria-pressed="false">${escapeHtml(d.filterTopup)}</button>
<button type="button" data-filter="daily" aria-pressed="false">${escapeHtml(d.filterDaily)}</button>
<button type="button" data-filter="reading" aria-pressed="false">${escapeHtml(d.filterReading)}</button>
</div>
<ul class="tx-list" id="tx-list"></ul>
<p class="tx-empty" id="tx-empty" hidden>${escapeHtml(d.txEmpty)}</p>
<button type="button" class="btn btn-outline" id="tx-more" hidden>${escapeHtml(d.showOlder)}</button>
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
<div class="invite-stats">
<div class="invite-stat"><b id="stat-joined">0</b><span>${escapeHtml(d.statJoined)}</span></div>
<div class="invite-stat"><b id="stat-read">0</b><span>${escapeHtml(d.statFirstReading)}</span></div>
<div class="invite-stat"><b id="stat-earned">0</b><span>${escapeHtml(d.statEarned)}</span></div>
</div>
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

export type PaymentDetail = {
  tokens: number; balance: number; amount: number | null; currency: string | null;
  paymentMethod: string | null; receiptUrl: string | null; email: string | null;
};

export function billingSuccessPage(opts: {
  ui: UiLang;
  origin: string;
  returnTo: string;
  state: "verified" | "pending" | "failed";
  detail?: PaymentDetail | null;
  /** Server-rendered header initial + token balance (no first-paint flash). */
  account?: HeaderAccount;
}): string {
  const d = t(opts.ui);
  const det = opts.detail;
  const text = opts.state === "verified" ? d.successVerified : opts.state === "pending" ? d.successPending : d.successFailed;
  const money = det && det.amount !== null
    ? `\u0e3f${(det.amount / 100).toLocaleString("en-US")}${det.paymentMethod ? ` \u00b7 ${det.paymentMethod === "promptpay" ? "PromptPay" : det.paymentMethod}` : ""}`
    : "";
  const detailHtml = opts.state === "verified" && det
    ? `<p><b>${escapeHtml(fmt(d.tokensAdded, { n: det.tokens, m: det.balance }))}</b></p>
${money || det.email ? `<p>${escapeHtml([money, det.email ? fmt(d.receiptSent, { email: det.email }) : ""].filter(Boolean).join(" \u00b7 "))}</p>` : ""}`
    : `<p>${escapeHtml(text)}</p>`;
  const body = `<main>
${headerHtml({ ui: opts.ui, streak: { current: 0, longest: 0, activeToday: false }, path: "/billing", account: opts.account })}
<h1 class="display">${escapeHtml(d.successTitle)}</h1>
${detailHtml}
<p><a class="btn btn-primary" href="${escapeHtml(opts.returnTo)}">${escapeHtml(d.continueQuestion)}</a></p>
<p><a href="/billing#activity">${escapeHtml(d.viewActivity)}</a>${det?.receiptUrl ? ` \u00b7 <a href="${escapeHtml(det.receiptUrl)}" target="_blank" rel="noopener">${escapeHtml(d.viewReceiptLink)} \u2197</a>` : ""}</p>
</main>`;
  return pageShell({
    title: `TarotNice — ${d.successTitle}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body: `${body}${siteFooterHtml(opts.ui, "/billing")}`,
  });
}

export function billingCancelPage(opts: { ui: UiLang; origin: string; returnTo: string; account?: HeaderAccount }): string {
  const d = t(opts.ui);
  const body = `<main>
${headerHtml({ ui: opts.ui, streak: { current: 0, longest: 0, activeToday: false }, path: "/billing", account: opts.account })}
<h1 class="display">${escapeHtml(d.cancelTitle)}</h1>
<p>${escapeHtml(d.cancelBoardText)}</p>
<p><a class="btn btn-primary" href="/billing">${escapeHtml(d.tryAgain)}</a></p>
<p><a href="/contact">${escapeHtml(d.problemPaying)}</a></p>
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

/** Standalone Invite page (design board: Invite friends). Reuses the
 *  billing.js referrals wiring (same element ids, all guarded). */
export function invitePage(opts: { ui: UiLang; origin: string; account?: HeaderAccount }): string {
  const d = t(opts.ui);
  const body = `<main>
${headerHtml({ ui: opts.ui, streak: { current: 0, longest: 0, activeToday: false }, path: "/invite", account: opts.account })}
<div class="invite-head"><img src="/mascot/ngern-sitting.svg" alt="" width="64" height="64"><span><h1 class="display">${escapeHtml(d.invitePageTitle)}</h1><span class="invite-sub">${escapeHtml(d.invitePageSub)}</span></span></div>
<section class="hero-card invite-hero">
<p class="invite-code-label"><small>${escapeHtml(d.inviteYourCode)}</small></p>
<p class="invite-code-row"><b id="invite-code" class="value code-value"></b> <button type="button" class="btn btn-outline btn-sm" id="copy-code">${escapeHtml(d.copyCodeBtn)}</button></p>
<div class="share-grid">
<button type="button" class="btn btn-sm btn-line" data-share-invite="line">${escapeHtml(d.shareOnLine)}</button>
<button type="button" class="btn btn-sm btn-gold" id="copy-link">${escapeHtml(d.copyInviteLink)}</button>
<a class="btn btn-sm btn-outline" id="invite-image" href="/invite.png" download>${escapeHtml(d.saveImage)}</a>
</div>
</section>
<section class="panel-card invite-stats-card">
<div class="invite-stats">
<div class="invite-stat"><b id="stat-joined" class="stat-value">0</b><span>${escapeHtml(d.statJoined)}</span></div>
<div class="invite-stat"><b id="stat-read" class="stat-value">0</b><span>${escapeHtml(d.statFirstReading)}</span></div>
<div class="invite-stat"><b id="stat-earned" class="stat-value">0</b><span>${escapeHtml(d.statEarned)}</span></div>
</div>
<ul class="friend-list" id="friend-list"></ul>
</section>
<p class="invite-terms muted">${escapeHtml(d.inviteRules)} \u00b7 <a href="/terms">${escapeHtml(d.terms)}</a></p>
</main>`;
  return pageShell({
    title: `TarotNice — ${d.inviteTitle}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    extraHead: `<script src="/app/billing.js" defer></script>`,
    body: `${body}${siteFooterHtml(opts.ui, "/invite")}`,
  });
}
