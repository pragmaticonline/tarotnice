// Affiliate helpers shared by the staff worker and the public billing page.
// Money is summed from ledger top-up rows (Stripe minor units), which live
// in D1 permanently — no retention window, no extra rollup table.
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

export function formatMinor(minor: number, currency: string): string {
  const symbol = currency === "THB" ? "\u0e3f" : currency + " ";
  return `${symbol}${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
