import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { affiliateShare, AFFILIATE_SHARE, affiliateTokenBalance, affiliateTokensEarned, formatMinor, summarizeAffiliatePayments } from "../src/lib/affiliate";
import { t } from "../src/lib/i18n";
import { billingPage } from "../src/routes/billing";

describe("affiliate totals", () => {
  it("sums minor units and picks the majority currency", () => {
    expect(summarizeAffiliatePayments([])).toEqual({ count: 0, totalMinor: 0, currency: "THB" });
    const rows = [
      { userId: "f1", day: "2026-11-20", delta: 50, ref: "pi_1", createdAt: 1, amount: 5900, currency: "thb", paymentMethod: "promptpay" },
      { userId: "f1", day: "2026-11-22", delta: 500, ref: "pi_2", createdAt: 2, amount: 19900, currency: "THB", paymentMethod: "card" },
      { userId: "f2", day: "2026-11-23", delta: 50, ref: "pi_3", createdAt: 3, amount: null, currency: null, paymentMethod: null },
    ];
    expect(summarizeAffiliatePayments(rows)).toEqual({ count: 3, totalMinor: 25800, currency: "THB" });
    expect(formatMinor(25800, "THB")).toBe("\u0e3f258.00");
    expect(AFFILIATE_SHARE).toBe(0.2);
    expect(affiliateShare(25800)).toBe(5160);
    expect(affiliateShare(199)).toBe(40);
    expect(formatMinor(affiliateShare(25800), "THB")).toBe("\u0e3f51.60");
  });

  it("has complete copy in both languages, no payer names promised", () => {
    for (const ui of ["en", "th"] as const) {
      const d = t(ui);
      for (const key of ["affTitle", "affPayments", "affRevenue", "affShare", "affNote", "affDate", "affEmpty",
        "affEarned", "affClaimed", "affUnclaimed", "affClaimNow", "affPending", "affHistory", "affClaimNote",
        "affPaid", "affDenied"] as const) {
        expect(d[key].length, `${ui}.${key}`).toBeGreaterThan(0);
      }
      expect(d.affNote, ui).not.toMatch(/credit/i);
      const thai = t("th");
      for (const key of ["affEarned", "affClaimed", "affUnclaimed", "affClaimNow", "affPending", "affHistory", "affClaimNote", "affPaid", "affDenied"] as const) {
        expect(thai[key], `th.${key}`).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e47\u0e19");
        expect(thai[key], `th.${key}`).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e19\u0e2a\u0e4c");
      }
    }
  });

  it("computes token earnings at 20% and tracks claimed/pending/unclaimed", () => {
    expect(affiliateTokensEarned([])).toBe(0);
    // 20% of each purchase, rounded per row: 20% of 50 = 10, of 7 = 1.
    expect(affiliateTokensEarned([{ delta: 50 }, { delta: 7 }])).toBe(11);
    const none = affiliateTokenBalance(100, []);
    expect(none).toEqual({ earned: 100, claimed: 0, pending: 0, unclaimed: 100 });
    const mixed = affiliateTokenBalance(100, [
      { status: "approved", tokens: 60, grantedTokens: 50 },
      { status: "pending", tokens: 30, grantedTokens: null },
      { status: "deciding", tokens: 10, grantedTokens: null },
      { status: "denied", tokens: 99, grantedTokens: null },
    ]);
    // denied claims free the balance; approved counts granted, not claimed.
    expect(mixed).toEqual({ earned: 100, claimed: 50, pending: 40, unclaimed: 10 });
    // never negative when staff overpays.
    expect(affiliateTokenBalance(10, [{ status: "approved", tokens: 10, grantedTokens: 25 }]).unclaimed).toBe(0);
  });
});

describe("affiliate card on /billing", () => {
  const base = {
    ui: "en" as const, origin: "", env: {} as never, balance: 10, freeLeft: 5,
    account: { initial: "M", tokens: 15 },
  };
  const affiliate = {
    invited: 4, converted: 2,
    payments: [
      { day: "2026-11-20", delta: 50, amount: 5900, currency: "THB", paymentMethod: "promptpay" },
      { day: "2026-11-22", delta: 200, amount: 19900, currency: "THB", paymentMethod: "card" },
    ],
    revenueMinor: 25800, revenueCurrency: "THB", shareMinor: 5160,
    earnedTokens: 50, claimedTokens: 20, pendingTokens: 0, unclaimedTokens: 30,
    claims: [
      { day: "2026-11-21", tokens: 20, granted: 20, status: "approved" },
    ],
  };

  it("renders only for flagged affiliates, with totals and no payer ids", () => {
    const plain = billingPage({ ...base, affiliate: null });
    expect(plain).not.toContain("Affiliate stats");
    const html = billingPage({ ...base, affiliate });
    expect(html).toContain("Affiliate stats");
    expect(html).toContain("Total earned");
    expect(html).toContain("\u0e3f258.00");
    expect(html).toContain("promptpay");
    expect(html).toContain("card");
    expect(html).not.toContain("/users/f1");
    expect(html).toContain("Gross top-ups");
    expect(html).toContain("Total earned");
    expect(html).toContain("Available to claim");
    expect(html).toContain("Payout history");
    expect(html).toContain("Paid");
  });

  it("shows the claim button only when tokens are unclaimed", () => {
    const btn = billingPage({ ...base, affiliate: { ...affiliate, pendingTokens: 0, unclaimedTokens: 30 } });
    expect(btn).toContain('id="aff-claim"');
    const pend = billingPage({ ...base, affiliate: { ...affiliate, pendingTokens: 30, unclaimedTokens: 0 } });
    expect(pend).not.toContain('id="aff-claim"');
    expect(pend).toContain("Claim pending review");
    const none = billingPage({ ...base, affiliate: { ...affiliate, pendingTokens: 0, unclaimedTokens: 0, claims: [] } });
    expect(none).not.toContain('id="aff-claim"');
  });

  it("wires the flag, referees, and payments in the billing route", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(src).toContain("getAffiliate(user.id)");
    expect(src).toContain("topupsForUsers(");
    expect(src).toContain("summarizeAffiliatePayments(");
    expect(src).toContain("affiliate,");
    expect(src).toContain("paymentMethod: r.paymentMethod");
    expect(src).toContain("affiliateTokensEarned(");
    expect(src).toContain("affiliateTokenBalance(");
    expect(src).toContain('app.post("/api/me/affiliate/claim"');
    expect(src).toContain("createAffiliateClaim(");
    expect(src).toContain("nothing_to_claim");
  });
});
