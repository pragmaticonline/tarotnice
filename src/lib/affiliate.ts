// Affiliate helpers shared by the staff worker and the public billing page.
// Money is summed from ledger top-up rows (Stripe minor units), which live
// in D1 permanently — no retention window, no extra rollup table.
/** Affiliate revenue share of gross referred payments. */
export const AFFILIATE_SHARE = 0.2;

/** The affiliate's cut, rounded to whole minor units (no fractional satang). */
export function affiliateShare(totalMinor: number, rate: number = AFFILIATE_SHARE): number {
  return Math.round(totalMinor * rate);
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

/** Minimum payout value: requests unlock once the unpaid 20% cut reaches
 * this (minor units, i.e. 150000 = 1500 THB). */
export const AFFILIATE_MIN_PAYOUT_MINOR = 150000;

/** Keep only top-ups from on/after each referee's referral day, so the
 * 20% cut never reaches back to spend from before the referral. Rows for
 * referees with no known referral day are kept (fail open). */
export function topupsSinceReferral<T extends { userId: string; day: string }>(
  rows: T[],
  referredDayByUser: ReadonlyMap<string, string>,
): T[] {
  return rows.filter((r) => r.day >= (referredDayByUser.get(r.userId) ?? ""));
}

/** Friend's per-top-up bonus rate: 10% extra tokens, rounded up. */
export const FRIEND_TOPUP_RATE = 0.1;

/** Friend's cut on each referred top-up: 10% extra tokens, rounded up. */
export function friendTopupBonus(tokens: number, rate: number = FRIEND_TOPUP_RATE): number {
  return Math.ceil(tokens * rate);
}

export function formatMinor(minor: number, currency: string): string {
  const symbol = currency === "THB" ? "\u0e3f" : currency + " ";
  return `${symbol}${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Whole-unit formatting for round thresholds (1500 not 1500.00). */
export function formatWholeMinor(minor: number, currency: string): string {
  if (Number.isInteger(minor / 100)) {
    const symbol = currency === "THB" ? "\u0e3f" : currency + " ";
    return `${symbol}${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return formatMinor(minor, currency);
}
