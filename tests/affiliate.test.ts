import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AFFILIATE_MIN_PAYOUT_MINOR, affiliateShare, AFFILIATE_SHARE, formatMinor, formatWholeMinor, FRIEND_TOPUP_RATE, friendTopupBonus, summarizeAffiliatePayments, topupsSinceReferral } from "../src/lib/affiliate";
import { billingPage, fmtDay, fmtDayMs } from "../src/routes/billing";
import { t } from "../src/lib/i18n";

describe("affiliate money math", () => {
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

  it("gates cash requests at 1500 THB of unpaid 20% share", () => {
    expect(AFFILIATE_MIN_PAYOUT_MINOR).toBe(150000);
    expect(formatWholeMinor(150000, "THB")).toBe("\u0e3f1,500");
    expect(formatWholeMinor(159650, "THB")).toBe("\u0e3f1,596.50");
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
    expect(affiliateShare(79800)).toBe(15960);
  });

  it("gives the friend 10% extra on every top-up, rounded up", () => {
    expect(FRIEND_TOPUP_RATE).toBe(0.1);
    expect(friendTopupBonus(50)).toBe(5);
    expect(friendTopupBonus(200)).toBe(20);
    expect(friendTopupBonus(500)).toBe(50);
    expect(friendTopupBonus(7)).toBe(1);
    expect(friendTopupBonus(0)).toBe(0);
  });

  it("formats Bangkok dates with the Buddhist year in Thai", () => {
    expect(fmtDay("2026-11-24", "en")).toBe("24 Nov 2026");
    expect(fmtDay("2026-11-24", "th")).toBe("24 \u0e1e.\u0e22. 2569");
    expect(fmtDayMs(Date.UTC(2026, 10, 24, 12), "en")).toBe("24 Nov 2026");
    expect(fmtDayMs(Date.UTC(2026, 10, 24, 12), "th")).toBe("24 \u0e1e.\u0e22. 2569");
    expect(fmtDay("nope", "en")).toBe("nope");
  });
});

describe("affiliate v2 copy", () => {
  const keys = ["affH", "affBadge", "affLead", "affAvail", "affBelow", "affReached", "affRequested",
    "affClaimBtn", "affInProgress", "affT1", "affT2", "affT3", "affBuyOne", "affBuyMany", "affPayOne",
    "affPayMany", "affT2s", "affBuysH", "affC1", "affC2", "affC3", "affC4", "affPayH", "affPayEmpty",
    "affHowPay", "affHp1", "affHp2", "affHp3", "affEarnH", "affColWhen", "affColFriend", "affColYou",
    "affS1", "affS1f", "affS1fs", "affS2", "affS2y", "affS2ys", "affS3", "affS3f", "affS3fs", "affS3y",
    "affS3ys", "affFrH", "affF1", "affF2", "affF3", "affTodayCap", "affFrWait", "affNoReadYet",
    "affPlus5", "affFrBuys", "affFrBuyOne", "affFine1", "affFine2", "affFine3", "affMsg", "affReuse",
    "affShareLine", "affShareImg", "affMsgLbl", "affCopyMsg", "affCodeLbl", "affTabTitle", "affAnon",
    "affPaid", "affReqFail"] as const;
  it("is complete in both languages with Thai spelling intact", () => {
    for (const ui of ["en", "th"] as const) {
      const d = t(ui);
      for (const key of keys) {
        expect(String(d[key]).length, `${ui}.${key}`).toBeGreaterThan(0);
      }
      expect(d.affLead, ui).toContain("20%");
      expect(d.affS3f, ui).toContain("10%");
    }
    const thai = t("th");
    for (const v of Object.values(thai)) {
      if (typeof v !== "string") continue;
      expect(v).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e47\u0e19");
      expect(v).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e19\u0e2a\u0e4c");
    }
  });
});

describe("invite tab v2 on /billing", () => {
  const base = {
    ui: "en" as const, origin: "https://tarotnice.com", env: {} as never, balance: 10, freeLeft: 5,
    account: { initial: "M", tokens: 15 },
    invite: {
      code: "NICE-TEST", link: "https://tarotnice.com/r/NICE-TEST", message: "msg",
      friends: [
        { name: "Maew", status: "rewarded" as const, joinedAt: 1, readAt: 2, purchases: 1 },
        { name: null, status: "joined" as const, joinedAt: 3, readAt: null, purchases: 0 },
      ],
      joined: 2, converted: 1, tokensEarned: 5, rewardToday: 1, rewardCap: 3,
    },
  };
  const aff = {
    payments: [
      { day: "2026-11-20", delta: 50, amount: 5900, currency: "THB", paymentMethod: "promptpay", shareMinor: 1180 },
      { day: "2026-11-22", delta: 200, amount: 19900, currency: "THB", paymentMethod: "card", shareMinor: 3980 },
    ],
    revenueMinor: 25800, revenueCurrency: "THB", shareMinor: 5160,
    paidMinor: 0, payoutCount: 0, unpaidMinor: 5160, canRequest: false,
    openRequest: null,
    payouts: [],
  };

  it("renders the v2 tab for regular members without the affiliate section", () => {
    const html = billingPage({ ...base, affiliate: null });
    expect(html).toContain("Invite friends, earn tokens");
    expect(html).toContain("NICE-TEST");
    expect(html).toContain("What you both get");
    expect(html).not.toContain("isaff");
    expect(html).toContain("Each friend can use one code, once");
    expect(html).not.toContain("Withholding tax is deducted");
    expect(html).not.toContain('id="aff-payout"');
    expect(html).toContain("Today\u2019s bonus 1/3 friends");
  });

  it("shows below-minimum state with progress and no button", () => {
    const html = billingPage({ ...base, affiliate: aff });
    expect(html).toContain("Partner earnings");
    expect(html).toContain("20% of the purchase in cash");
    expect(html).toContain("\u0e3f51.60");
    expect(html).toContain("\u0e3f1,448.40 more until you can request a payout");
    expect(html).not.toContain('id="aff-payout"');
    expect(html).toContain('style="width:3%"');
    expect(html).toContain("20 Nov 2026");
    expect(html).toContain("50 tokens");
    expect(html).toContain("\u0e3f59.00 · PromptPay");
    expect(html).toContain("+\u0e3f11.80");
    expect(html).toContain("Maew");
    expect(html).toContain("First reading done · 1 purchase");
    expect(html).toContain("No payouts yet.");
    expect(html).toContain("How payouts work");
  });

  it("shows the request button once the minimum is reached", () => {
    const html = billingPage({ ...base, affiliate: { ...aff, unpaidMinor: 162000, shareMinor: 162000, canRequest: true } });
    expect(html).toContain('id="aff-payout"');
    expect(html).toContain("request your payout");
    expect(html).toContain("\u0e3f1,620.00");
  });

  it("shows the requested state with date and pill", () => {
    const html = billingPage({
      ...base,
      affiliate: {
        ...aff, unpaidMinor: 162000, shareMinor: 162000, canRequest: false,
        openRequest: { amountMinor: 162000, requestedAt: Date.UTC(2026, 10, 24, 5) },
        payouts: [{ requestedAt: Date.UTC(2026, 10, 24, 5), paidAt: null, amountMinor: 162000, currency: "THB", status: "requested" }],
      },
    });
    expect(html).not.toContain('id="aff-payout"');
    expect(html).toContain("In progress");
    expect(html).toContain("Requested on 24 Nov 2026");
  });

  it("shows paid payouts as history", () => {
    const html = billingPage({
      ...base,
      affiliate: {
        ...aff, unpaidMinor: 2000, shareMinor: 162000,
        paidMinor: 160000, payoutCount: 1,
        payouts: [{ requestedAt: Date.UTC(2026, 9, 1, 5), paidAt: Date.UTC(2026, 9, 3, 5), amountMinor: 160000, currency: "THB", status: "paid" }],
      },
    });
    expect(html).toContain("Paid");
    expect(html).toContain("\u0e3f1,600.00");
    expect(html).not.toContain("No payouts yet.");
  });

  it("wires the payout request endpoint and staff queue", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(src).toContain('app.post("/api/me/affiliate/payout"');
    expect(src).toContain("createAffiliatePayout(");
    expect(src).toContain("already_requested");
    expect(src).toContain("below_minimum");
    expect(src).not.toContain("/api/me/affiliate/claim");
    expect(src).not.toContain("createAffiliateClaim(");
    const staff = readFileSync(new URL("../src/staff.ts", import.meta.url), "utf8");
    expect(staff).toContain('app.post("/affiliates/payouts/:payoutId/pay"');
    expect(staff).toContain("payAffiliatePayout(");
    expect(staff).toContain("affiliate_payout.pay");
    expect(staff).not.toContain("decideAffiliateClaim(");
    expect(staff).not.toContain("/claims/");
  });

  it("drops the token-claim table for the payout table", () => {
    const mig = readFileSync(new URL("../drizzle/0016_affiliate_payouts.sql", import.meta.url), "utf8");
    expect(mig).toContain("CREATE TABLE `affiliate_payouts`");
    expect(mig).toContain("DROP TABLE `affiliate_claims`");
  });
});
