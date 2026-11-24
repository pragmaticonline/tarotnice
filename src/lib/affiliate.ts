// Affiliate helpers shared by the staff worker and the public billing page.
// Money is summed from ledger top-up rows (Stripe minor units), which live
// in D1 permanently — no retention window, no extra rollup table.
/** Affiliate revenue share of gross referred payments. */
export const AFFILIATE_SHARE = 0.2;

/** The affiliate's cut, rounded to whole minor units (no fractional satang). */
export function affiliateShare(totalMinor: number, rate: number = AFFILIATE_SHARE): number {
  return Math.round(totalMinor * rate);
}

/** Token earnings from referred top-ups: 20% of each purchase, rounded. */
export function affiliateTokensEarned(rows: { delta: number }[], rate: number = AFFILIATE_SHARE): number {
  return rows.reduce((sum, r) => sum + Math.round(r.delta * rate), 0);
}

export type AffiliatePayment = {
  userId: string;
  day: string;
  delta: number;
  ref: string;
  amount: number | null;
  currency: string | null;
  paymentMethod: string | null;
};

/** Sum top-up rows into a gross revenue figure (minor units, e.g. satang). */
export function summarizeAffiliatePayments(rows: AffiliatePayment[]): {
  count: number;
  totalMinor: number;
  currency: string;
} {
  let totalMinor = 0;
  const currencies = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.amount === "number") {
      totalMinor += r.amount;
      const cur = (r.currency || "THB").toUpperCase();
      currencies.set(cur, (currencies.get(cur) ?? 0) + r.amount);
    }
  }
  let currency = "THB";
  let best = -1;
  for (const [cur, sum] of currencies) {
    if (sum > best) { best = sum; currency = cur; }
  }
  return { count: rows.length, totalMinor, currency };
}

/** Minimum payout value: claims unlock once the unclaimed cut is worth this
 * (minor units, i.e. 150000 = 1500 THB at current pack prices). */
export const AFFILIATE_MIN_PAYOUT_MINOR = 150000;

/** Baht value of the affiliate's cut, from each top-up's own pack price.
 * Rows without a recorded amount still earn tokens but carry no value here,
 * so the average — and the gate below — stays conservative. */
export function affiliatePayoutValue(
  rows: { delta: number; amount: number | null }[],
  claims: { status: string; tokens: number; grantedTokens: number | null }[],
  minimumMinor: number = AFFILIATE_MIN_PAYOUT_MINOR,
): { earnedMinor: number; unclaimedMinor: number; minimumMinor: number; canClaim: boolean } {
  let earnedMinor = 0;
  for (const r of rows) {
    if (typeof r.amount === "number") earnedMinor += Math.round(r.amount * AFFILIATE_SHARE);
  }
  const earnedTokens = affiliateTokensEarned(rows);
  const avg = earnedTokens > 0 ? earnedMinor / earnedTokens : 0;
  let claimedTokens = 0;
  let pendingTokens = 0;
  for (const c of claims) {
    if (c.status === "approved") claimedTokens += c.grantedTokens ?? c.tokens;
    else if (c.status === "pending" || c.status === "deciding") pendingTokens += c.tokens;
  }
  const unclaimedMinor = Math.max(0, earnedMinor - (claimedTokens + pendingTokens) * avg);
  return { earnedMinor, unclaimedMinor, minimumMinor, canClaim: unclaimedMinor >= minimumMinor };
}

/** Keep only top-ups from on/after each referee's referral day, so the
 * 20% cut never reaches back to spend from before the referral. Rows for
 * referees with no known referral day are kept (fail open). */
export function topupsSinceReferral<T extends { userId: string; day: string }>(
  rows: T[],
  referredDayByUser: ReadonlyMap<string, string>,
): T[] {
  return rows.filter((r) => r.day >= (referredDayByUser.get(r.userId) ?? ""));
}

/** Affiliate token balance: earned from referees minus what's been paid out. */
export function affiliateTokenBalance(
  earnedTokens: number,
  claims: { status: string; tokens: number; grantedTokens: number | null }[],
): { earned: number; claimed: number; pending: number; unclaimed: number } {
  let claimed = 0;
  let pending = 0;
  for (const c of claims) {
    if (c.status === "approved") claimed += c.grantedTokens ?? c.tokens;
    else if (c.status === "pending" || c.status === "deciding") pending += c.tokens;
  }
  return { earned: earnedTokens, claimed, pending, unclaimed: Math.max(0, earnedTokens - claimed - pending) };
}

export function formatMinor(minor: number, currency: string): string {
  const symbol = currency === "THB" ? "\u0e3f" : currency + " ";
  return `${symbol}${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
