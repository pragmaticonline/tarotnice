// Billing page: balance header, pack cards, and the Transactions /
// Referrals history (design boards 1 + token spec). Client behaviour
// (tabs, filters, copy, buy) lives in public/app/billing.js; this file
// renders structure only, with live data loaded from the JSON APIs.
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { PACK_LIST, tokensConfigured, type StripeEnv } from "../lib/stripe";
import { LINE_WELCOME_BONUS_TOKENS } from "../lib/wallet";
import { AFFILIATE_MIN_PAYOUT_MINOR, formatMinor, formatWholeMinor } from "../lib/affiliate";
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

const TH_MONTHS = ["\u0e21.\u0e04.", "\u0e01.\u0e1e.", "\u0e21\u0e35.\u0e04.", "\u0e40\u0e21.\u0e22.", "\u0e1e.\u0e04.", "\u0e21\u0e34.\u0e22.", "\u0e01.\u0e04.", "\u0e2a.\u0e04.", "\u0e01.\u0e22.", "\u0e15.\u0e04.", "\u0e1e.\u0e22.", "\u0e18.\u0e04."];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-24" (Bangkok day) → "24 Nov 2026", or the Thai Buddhist-year form. */
export function fmtDay(day: string, ui: UiLang): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return day;
  return ui === "th" ? `${d} ${TH_MONTHS[m - 1]} ${y + 543}` : `${d} ${EN_MONTHS[m - 1]} ${y}`;
}

/** Epoch ms → Bangkok calendar date in the UI language. */
export function fmtDayMs(ms: number, ui: UiLang): string {
  const bkk = new Date(ms + 7 * 3600 * 1000);
  const y = bkk.getUTCFullYear();
  const m = bkk.getUTCMonth() + 1;
  const d = bkk.getUTCDate();
  return ui === "th" ? `${d} ${TH_MONTHS[m - 1]} ${y + 543}` : `${d} ${EN_MONTHS[m - 1]} ${y}`;
}

function methodLabel(m: string | null): string {
  if (m === "promptpay") return "PromptPay";
  return m ?? "—";
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
  /** Invite tab data (server-rendered for every registered user). */
  invite: {
    code: string; link: string; message: string;
    friends: { name: string | null; status: "rewarded" | "read" | "joined"; joinedAt: number; readAt: number | null; purchases: number }[];
    joined: number; converted: number; tokensEarned: number;
    rewardToday: number; rewardCap: number;
  };
  /** Affiliate cash section (only present when staff flagged this user). */
  affiliate?: {
    payments: { day: string; delta: number; amount: number | null; currency: string | null; paymentMethod: string | null; shareMinor: number | null }[];
    revenueMinor: number; revenueCurrency: string; shareMinor: number;
    paidMinor: number; payoutCount: number; unpaidMinor: number; canRequest: boolean;
    openRequest: { amountMinor: number; requestedAt: number } | null;
    payouts: { requestedAt: number; paidAt: number | null; amountMinor: number; currency: string; status: string }[];
  } | null;
}): string {
  const d = t(opts.ui);
  const ui = opts.ui;
  const isAff = !!opts.affiliate;
  const buyWord = (n: number): string =>
    n === 1 ? d.affBuyOne : fmt(d.affBuyMany, { n });
  const payWord = (n: number): string =>
    n === 1 ? d.affPayOne : fmt(d.affPayMany, { n });
  const friendRow = (f: {
    name: string | null; status: "rewarded" | "read" | "joined";
    joinedAt: number; readAt: number | null; purchases: number;
  }): string => {
    const nm = f.name ?? d.affAnon;
    const buys = f.purchases > 0
      ? ` · ${f.purchases === 1 ? d.affFrBuyOne : fmt(d.affFrBuys, { n: f.purchases })}`
      : "";
    let line = f.status === "joined"
      ? `${d.affF1} · ${d.affNoReadYet}${buys}`
      : `${d.affF2}${buys}`;
    if (!isAff) line = line.split(" · ")[0];
    const pill = f.status === "rewarded"
      ? `<span class="pill ok">${escapeHtml(d.affPlus5)}</span>`
      : f.status === "read"
        ? `<span class="pill ok">${escapeHtml(d.affF2)}</span>`
        : `<span class="pill wait">${escapeHtml(d.affFrWait)}</span>`;
    const initial = escapeHtml((nm || "?").charAt(0).toUpperCase());
    return `<div class="row"><div class="av">${initial}</div>` +
      `<div class="nm"><b>${escapeHtml(nm)}</b><small>${escapeHtml(line)}</small></div>${pill}</div>`;
  };
  const affSection = (aff: NonNullable<typeof opts.affiliate>): string => {
    const cur = aff.revenueCurrency;
    const minStr = formatWholeMinor(AFFILIATE_MIN_PAYOUT_MINOR, cur);
    const open = aff.openRequest;
    const state = open ? "q" : aff.unpaidMinor >= AFFILIATE_MIN_PAYOUT_MINOR ? "r" : "b";
    const value = formatMinor(open ? open.amountMinor : aff.unpaidMinor, cur);
    const sub = open
      ? fmt(d.affRequested, { date: fmtDayMs(open.requestedAt, ui) })
      : state === "r"
        ? fmt(d.affReached, { min: minStr })
        : fmt(d.affBelow, { left: formatMinor(AFFILIATE_MIN_PAYOUT_MINOR - aff.unpaidMinor, cur), min: minStr });
    const lockInner = state === "r"
      ? `<button type="button" class="btn gold" id="aff-payout">💸 ${escapeHtml(d.affClaimBtn)}</button><p class="auth-err" id="aff-payout-msg" role="alert"></p>`
      : state === "q"
        ? `<span class="pill wait">${escapeHtml(d.affInProgress)}</span>`
        : ``;
    const prog = state === "b"
      ? `<div class="prog"><div class="track"><i style="width:${Math.max(1, Math.round(aff.unpaidMinor / AFFILIATE_MIN_PAYOUT_MINOR * 100))}%"></i></div></div>`
      : ``;
    const tiles =
      `<div class="tile"><div class="t">${escapeHtml(d.affT1)}</div><div class="n">${escapeHtml(formatMinor(aff.revenueMinor, cur))}</div><div class="s">${escapeHtml(buyWord(aff.payments.length))}</div></div>` +
      `<div class="tile"><div class="t">${escapeHtml(d.affT2)}</div><div class="n">${escapeHtml(formatMinor(aff.shareMinor, cur))}</div><div class="s">${escapeHtml(d.affT2s)}</div></div>` +
      `<div class="tile"><div class="t">${escapeHtml(d.affT3)}</div><div class="n">${escapeHtml(formatMinor(aff.paidMinor, cur))}</div><div class="s">${escapeHtml(payWord(aff.payoutCount))}</div></div>`;
    const buys = aff.payments.length
      ? `<div class="subh">${escapeHtml(d.affBuysH)}</div><table><thead><tr><th>${escapeHtml(d.affC1)}</th><th>${escapeHtml(d.affC2)}</th><th>${escapeHtml(d.affC3)}</th><th class="r">${escapeHtml(d.affC4)}</th></tr></thead>` +
        `<tbody>${aff.payments.map((r) => `<tr><td>${escapeHtml(fmtDay(r.day, ui))}</td><td>${r.delta} ${escapeHtml(d.tokensUnit)}</td>` +
          `<td>${r.amount === null ? "—" : `${escapeHtml(formatMinor(r.amount, r.currency ?? "THB"))} · ${escapeHtml(methodLabel(r.paymentMethod))}`}</td>` +
          `<td class="r plus">${r.shareMinor === null ? "—" : `+${escapeHtml(formatMinor(r.shareMinor, r.currency ?? "THB"))}`}</td></tr>`).join("")}</tbody></table>`
      : ``;
    const histRows = aff.payouts.map((x) => {
      const paid = x.status === "paid";
      return `<tr><td>${escapeHtml(fmtDayMs(paid && x.paidAt ? x.paidAt : x.requestedAt, ui))}</td><td>${escapeHtml(d.affClaimBtn)}</td>` +
        `<td>${paid ? `<span class="pill ok">${escapeHtml(d.affPaid)}</span>` : `<span class="pill wait">${escapeHtml(d.affInProgress)}</span>`}</td>` +
        `<td class="r plus">${escapeHtml(formatMinor(x.amountMinor, x.currency))}</td></tr>`;
    }).join("");
    const hist = `<div class="subh">${escapeHtml(d.affPayH)}</div>` +
      (aff.payouts.length ? `<table><tbody>${histRows}</tbody></table>` : `<div class="empty">${escapeHtml(d.affPayEmpty)}</div>`);
    return `<section data-aff><div class="card aff">` +
      `<div class="sh"><h2>${escapeHtml(d.affH)}</h2><span class="badge">${escapeHtml(d.affBadge)}</span></div>` +
      `<p class="lead">${escapeHtml(d.affLead)}</p>` +
      `<div class="hero"><div><div class="k">${escapeHtml(d.affAvail)}</div><div class="v">${escapeHtml(value)}</div><div class="s">${escapeHtml(sub)}</div></div>` +
      `<div class="lockwrap">${lockInner}</div>${prog}</div>` +
      `<div class="tiles">${tiles}</div>${buys}${hist}` +
      `<div class="subh">${escapeHtml(d.affHowPay)}</div><ol class="steps"><li>${escapeHtml(fmt(d.affHp1, { min: minStr }))}</li><li>${escapeHtml(d.affHp2)}</li><li>${escapeHtml(d.affHp3)}</li></ol>` +
      `</div></section>`;
  };
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
<ul class="packs">${packs}</ul>
<p class="pay-secure"><span class="pay-badges"><img src="/pay-visa.svg" alt="Visa" width="48" height="16"><img src="/pay-mastercard.svg" alt="Mastercard" width="28" height="18"><img src="/pay-promptpay.png" alt="PromptPay" width="56" height="19"></span><span>${escapeHtml(d.stripeSecure)}</span></p>` : ""}
<section class="redeem-box" aria-label="${escapeHtml(d.redeemTitle)}">
<h2>${escapeHtml(d.redeemTitle)}</h2>
<p>${escapeHtml(d.redeemHint)}</p>
<div class="redeem-row"><input id="redeem-code" maxlength="32" autocomplete="off" placeholder="NICE-XXXX"><button type="button" class="btn" id="redeem-apply">${escapeHtml(d.redeemBtn)}</button></div>
<p class="line-redeem-note">${escapeHtml(fmt(d.lineRedeemCta, { n: LINE_WELCOME_BONUS_TOKENS }))}</p>
<p><a href="https://lin.ee/tMMzlAg" target="_blank" rel="noopener"><img src="https://scdn.line-apps.com/n/line_add_friends/btn/${opts.ui === "th" ? "th" : "en"}.png" alt="${escapeHtml(opts.ui === "th" ? "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19" : "Add friend")}" height="36" border="0"></a></p>
<p class="auth-err" id="redeem-msg" role="alert"></p>
</section>
<script>window.__tnRedeemStrings=${JSON.stringify({ ok: d.redeemOk, invalid: d.redeemInvalid, expired: d.redeemExpired, used: d.redeemUsed, own: d.redeemOwn, newOnly: d.redeemNewOnly })};window.__tnTxStrings=${JSON.stringify({ read: d.readThisReading, receipt: d.viewReceipt })};</script>
<section class="history u-tab" id="activity" aria-label="${escapeHtml(d.historyTxTitle)}">
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
<div class="tab-panel u-page${opts.affiliate ? " isaff" : ""}" data-panel="ref" hidden>
<h1>${escapeHtml(d.affTabTitle)}</h1>
<p class="sub">${escapeHtml(d.inviteSub)}</p>
<div class="card">
<div class="lbl">${escapeHtml(d.affCodeLbl)}</div>
<div class="code"><b>${escapeHtml(opts.invite.code)}</b><button type="button" class="btn solid" id="copy-code">${escapeHtml(d.copyCodeBtn)}</button></div>
<span class="reuse">✓ ${escapeHtml(d.affReuse)}</span>
<div class="link"><span>${escapeHtml(opts.invite.link)}</span><button type="button" class="btn" id="copy-link">${escapeHtml(d.copyLinkBtn)}</button></div>
<div class="share"><button type="button" class="btn line" data-share-invite="line">${escapeHtml(d.affShareLine)}</button><a class="btn" id="invite-image" href="/invite/${escapeHtml(opts.invite.code)}.png?lang=${opts.ui}" download>${escapeHtml(d.affShareImg)}</a></div>
<details><summary>${escapeHtml(d.affMsgLbl)}</summary><div class="msg" id="invite-message">${escapeHtml(opts.invite.message)}</div><p style="margin:10px 0 0"><button type="button" class="btn" id="copy-msg">${escapeHtml(d.affCopyMsg)}</button></p></details>
</div>
${opts.affiliate ? affSection(opts.affiliate) : ""}
<section><div class="sh"><h2>${escapeHtml(d.affEarnH)}</h2></div>
<div class="earn">
<div class="hd w">${escapeHtml(d.affColWhen)}</div><div class="hd">${escapeHtml(d.affColFriend)}</div><div class="hd">${escapeHtml(d.affColYou)}</div>
<div class="when"><span class="num">1</span><span>${escapeHtml(d.affS1)}</span></div>
<div><span class="v">${escapeHtml(d.affS1f)}</span><span class="vs">${escapeHtml(d.affS1fs)}</span></div>
<div class="you"><span class="v dash">—</span></div>
<div class="when"><span class="num">2</span><span>${escapeHtml(d.affS2)}</span></div>
<div><span class="v dash">—</span></div>
<div class="you"><span class="v">${escapeHtml(d.affS2y)}</span><span class="vs">${escapeHtml(d.affS2ys)}</span></div>
<div class="when aff3" data-aff><span class="num">3</span><span>${escapeHtml(d.affS3)}<span class="tag">Partner</span></span></div>
<div class="aff3 v-cell" data-aff><span class="v">${escapeHtml(d.affS3f)}</span><span class="vs">${escapeHtml(d.affS3fs)}</span></div>
<div class="aff3 you v-cell" data-aff><span class="v">${escapeHtml(d.affS3y)}</span><span class="vs">${escapeHtml(d.affS3ys)}</span></div>
</div>
</section>
<section><div class="sh"><h2>${escapeHtml(d.affFrH)}</h2><span class="cap">${escapeHtml(fmt(d.affTodayCap, { n: opts.invite.rewardToday, cap: opts.invite.rewardCap }))}</span></div>
<div class="card">
<div class="tiles" style="margin-top:0">
<div class="tile"><div class="t">${escapeHtml(d.affF1)}</div><div class="n">${opts.invite.joined}</div></div>
<div class="tile"><div class="t">${escapeHtml(d.affF2)}</div><div class="n">${opts.invite.converted}</div></div>
<div class="tile"><div class="t">${escapeHtml(d.affF3)}</div><div class="n">${opts.invite.tokensEarned}</div></div>
</div>
<div class="list">${opts.invite.friends.map((f) => friendRow(f)).join("")}</div>
</div>
</section>
<ul class="fine"><li>${escapeHtml(d.affFine1)}</li>${opts.affiliate ? `<li>${escapeHtml(d.affFine2)}</li><li>${escapeHtml(d.affFine3)}</li>` : ""}</ul>
</div>

</main>`;
  return pageShell({
    title: `TarotNice — ${d.billingTitle}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    extraHead: `<link rel="stylesheet" href="/app/aff-tab.css"><script src="/app/billing.js" defer></script><script>window.__tnAffPay=${JSON.stringify({ fail: d.affReqFail })};</script>`,
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
