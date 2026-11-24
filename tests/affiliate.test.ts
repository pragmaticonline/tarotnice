import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatMinor, summarizeAffiliatePayments } from "../src/lib/affiliate";
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
  });

  it("has complete copy in both languages, no payer names promised", () => {
    for (const ui of ["en", "th"] as const) {
      const d = t(ui);
      for (const key of ["affTitle", "affPayments", "affRevenue", "affNote", "affDate", "affEmpty"] as const) {
        expect(d[key].length, `${ui}.${key}`).toBeGreaterThan(0);
      }
      expect(d.affNote, ui).not.toMatch(/credit/i);
    }
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
    revenueMinor: 25800, revenueCurrency: "THB",
  };

  it("renders only for flagged affiliates, with totals and no payer ids", () => {
    const plain = billingPage({ ...base, affiliate: null });
    expect(plain).not.toContain("Affiliate stats");
    const html = billingPage({ ...base, affiliate });
    expect(html).toContain("Affiliate stats");
    expect(html).toContain("\u0e3f258.00");
    expect(html).toContain("promptpay");
    expect(html).toContain("card");
    expect(html).not.toContain("/users/f1");
    expect(html).toContain("Gross top-ups");
  });

  it("wires the flag, referees, and payments in the billing route", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(src).toContain("getAffiliate(user.id)");
    expect(src).toContain("topupsForUsers(");
    expect(src).toContain("summarizeAffiliatePayments(");
    expect(src).toContain("affiliate,");
    expect(src).toContain("paymentMethod: r.paymentMethod");
  });
});
