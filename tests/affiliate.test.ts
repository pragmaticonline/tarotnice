import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AFFILIATE_MIN_PAYOUT_MINOR, affiliatePayoutValue, affiliateShare, AFFILIATE_SHARE, affiliateTokenBalance, affiliateTokensEarned, formatMinor, friendTopupBonus, summarizeAffiliatePayments, topupsSinceReferral } from "../src/lib/affiliate";
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
      expect(d.affNote, ui).toContain("20%");
      if (ui === "en") expect(d.affNote, ui).toContain("earlier payments do not count");
      else expect(d.affNote, ui).toContain("\u0e44\u0e21\u0e48\u0e19\u0e31\u0e1a");
      expect(d.affClaimNote, ui).toContain("{min}");
      const thai = t("th");
      for (const key of ["affEarned", "affClaimed", "affUnclaimed", "affClaimNow", "affPending", "affHistory", "affClaimNote", "affPaid", "affDenied"] as const) {
        expect(thai[key], `th.${key}`).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e47\u0e19");
        expect(thai[key], `th.${key}`).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e19\u0e2a\u0e4c");
      }
    }
  });

  it("values the cut in baht and gates payouts at 1500", () => {
    expect(AFFILIATE_MIN_PAYOUT_MINOR).toBe(150000);
    // 20% of 5900 satang = 1180 satang on a 50-token top-up.
    const rows = [{ delta: 50, amount: 5900 }, { delta: 500, amount: 39900 }];
    expect(affiliatePayoutValue(rows, []).earnedMinor).toBe(1180 + 7980);
    expect(affiliatePayoutValue(rows, []).canClaim).toBe(false);
    const big = [{ delta: 10000, amount: 798000 }];
    const v = affiliatePayoutValue(big, []);
    expect(v.canClaim).toBe(true);
    expect(v.unclaimedMinor).toBe(Math.round(798000 * 0.2));
    // approved grants consume value at the average rate; denied claims do not.
    const after = affiliatePayoutValue(big, [
      { status: "approved", tokens: 900, grantedTokens: 800 },
      { status: "denied", tokens: 900, grantedTokens: null },
    ]);
    expect(after.canClaim).toBe(false);
    expect(after.unclaimedMinor).toBeLessThan(AFFILIATE_MIN_PAYOUT_MINOR);
  });

  it("counts only post-referral top-ups toward the cut", () => {
    const dayByUser = new Map([["f1", "2026-11-20"], ["f2", "2026-11-22"]]);
    const rows = [
      { userId: "f1", day: "2026-11-19", delta: 500, amount: 39900 },
      { userId: "f1", day: "2026-11-20", delta: 500, amount: 39900 },
      { userId: "f2", day: "2026-11-23", delta: 50, amount: 5900 },
      { userId: "f9", day: "2020-01-01", delta: 5000, amount: 399000 },
    ];
    const kept = topupsSinceReferral(rows, dayByUser);
    // f1's pre-referral top-up is dropped; f9 (no referral day known) is kept.
    expect(kept.map((r) => r.day).sort()).toEqual(["2020-01-01", "2026-11-20", "2026-11-23"]);
    // pre-referral spend earns nothing: 20% of (500 + 50), not of the rest.
    expect(affiliateTokensEarned(kept.filter((r) => r.userId !== "f9"))).toBe(110);
  });

  it("gives the friend 10% extra on every top-up, rounded up", () => {
    expect(friendTopupBonus(50)).toBe(5);
    expect(friendTopupBonus(200)).toBe(20);
    expect(friendTopupBonus(500)).toBe(50);
    expect(friendTopupBonus(7)).toBe(1);
    expect(friendTopupBonus(0)).toBe(0);
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
    unclaimedMinor: 160000, minimumMinor: 150000, canClaim: true,
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
    expect(html).toContain("after joining with your code");
    expect(html).toContain("earlier payments do not count");
    expect(html).not.toContain("another affiliate");
    expect(html).toContain("Total earned");
    expect(html).toContain("Available to claim");
    expect(html).toContain("Payout history");
    expect(html).toContain("Paid");
  });

  it("shows the unlock note below the 1500 minimum", () => {
    const locked = billingPage({ ...base, affiliate: { ...affiliate, pendingTokens: 0, unclaimedTokens: 30, unclaimedMinor: 1180, canClaim: false } });
    expect(locked).not.toContain('id="aff-claim"');
    expect(locked).toContain("Payouts unlock at");
    const th = billingPage({ ...base, ui: "th", affiliate: { ...affiliate, pendingTokens: 0, unclaimedTokens: 30, unclaimedMinor: 1180, canClaim: false } });
    expect(th).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e47\u0e19");
    expect(th).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e19\u0e2a\u0e4c");
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

  it("keeps genuine new-user referrals paying end to end", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const store = readFileSync(new URL("../src/db/tarot-store.ts", import.meta.url), "utf8");
    // First click wins forever: first click inserts, later clicks are
    // ignored, so all future payments keep paying the original referrer.
    expect(store).toContain("async insertReferral(");
    expect(store).not.toContain("upsertReferral(");
    expect(store).toContain("first click wins forever");
    expect(src).toContain("insertReferral(");
    expect(src).not.toContain("upsertReferral(");
    // Conversion still fires on a true first reading.
    expect(store).toContain("async convertReferral(");
    expect(store).toContain("!== 1) return false");
    // Joining bonus stays new-accounts-only; established clicks attribute
    // but earn the influencer future 20% instead.
    expect(src).toContain("totalReadings(user.id)");
    expect(src).toContain('"ineligible"');
    // Earnings only ever count spend from the referral day forward.
    expect(src).toContain("topupsSinceReferral(");
    expect(src).toContain("bangkokDay(new Date(f.createdAt))");
    // Every referred top-up also credits the buyer 20% extra, rounded up,
    // keyed by payment so webhook replays stay a no-op.
    expect(src).toContain("friend-topup-bonus:${");
    expect(src).toContain("friendTopupBonus(pack.tokens)");
    const js = readFileSync(new URL("../public/app/billing.js", import.meta.url), "utf8");
    expect(js).toContain("friend-topup-bonus:");
    expect(js).toContain("txTopupBonus");
    // Invite tab promises the friend cut in both languages.
    const d = t("en");
    expect(d.inviteFriendGetsText).toContain("10% extra tokens on every top-up");
    expect(t("th").inviteFriendGetsText).toContain("10%");
    expect(d.inviteYouGetText).toContain("20% of everything they top up, forever");
    expect(t("th").inviteYouGetText).toContain("20%");
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
    expect(src).toContain("below_minimum");
    expect(src).toContain("AFFILIATE_MIN_PAYOUT_MINOR");
  });
});
