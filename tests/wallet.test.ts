import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { tokenLedger } from "../src/db/schema";
import {
  DAILY_FREE_TOKENS,
  REFERRAL_DAILY_CAP,
  dailyStatus,
  planSpend,
  reasonsForFilter,
  rewardsTodayCount,
  walletBalance,
  type LedgerRow,
} from "../src/lib/wallet";

const row = (delta: number, reason: LedgerRow["reason"], day: string, source: LedgerRow["source"] = null): LedgerRow => ({
  delta, reason, source, day, createdAt: 0,
});

describe("walletBalance", () => {
  it("sums non-daily rows into the wallet and scopes the daily grant to today", () => {
    const rows = [
      row(DAILY_FREE_TOKENS, "daily", "2026-10-26"),
      row(-5, "reading", "2026-10-26", "daily"),
      row(50, "topup", "2026-10-26"),
      row(5, "referral", "2026-10-26"),
      row(-50, "refund", "2026-10-26"),
    ];
    expect(walletBalance(rows, "2026-10-26")).toEqual({ wallet: 5, dailyLeft: 0 });
    // Yesterday's unspent grant never rolls into today.
    expect(walletBalance([row(DAILY_FREE_TOKENS, "daily", "2026-10-25")], "2026-10-26"))
      .toEqual({ wallet: 0, dailyLeft: 0 });
  });

  it("leaves today's unspent daily grant available", () => {
    expect(walletBalance([row(DAILY_FREE_TOKENS, "daily", "2026-10-26")], "2026-10-26"))
      .toEqual({ wallet: 0, dailyLeft: DAILY_FREE_TOKENS });
  });

  it("lets a refund drive the wallet negative", () => {
    const rows = [row(50, "topup", "2026-10-26"), row(-50, "refund", "2026-10-26")];
    expect(walletBalance(rows, "2026-10-26").wallet).toBe(0);
    expect(walletBalance([...rows, row(-5, "reading", "2026-10-26", "wallet")], "2026-10-26").wallet).toBe(-5);
  });
});

describe("planSpend", () => {
  it("spends the free daily credit first, for anyone", () => {
    expect(planSpend({ wallet: 0, dailyLeft: 5 }, "anon")).toEqual({ ok: true, source: "daily" });
    expect(planSpend({ wallet: 100, dailyLeft: 5 }, "registered")).toEqual({ ok: true, source: "daily" });
  });

  it("spends wallet tokens only for registered users", () => {
    expect(planSpend({ wallet: 50, dailyLeft: 0 }, "registered")).toEqual({ ok: true, source: "wallet" });
    expect(planSpend({ wallet: 50, dailyLeft: 0 }, "anon")).toEqual({ ok: false, error: "registration_required" });
  });

  it("blocks when neither credit nor balance covers a question", () => {
    expect(planSpend({ wallet: 3, dailyLeft: 0 }, "registered")).toEqual({ ok: false, error: "insufficient_tokens" });
    expect(planSpend({ wallet: -5, dailyLeft: 0 }, "registered")).toEqual({ ok: false, error: "insufficient_tokens" });
  });
});

describe("token_ledger uniqueness", () => {
  it("scopes the (reason, ref) dedupe key per user, so one user's daily grant cannot block another's", () => {
    const { indexes } = getTableConfig(tokenLedger);
    const unique = indexes.filter((i) => i.config.unique);
    expect(unique).toHaveLength(1);
    const cols = unique[0].config.columns.map((c) => (c as { name: string }).name);
    expect(cols).toEqual(["user_id", "reason", "ref"]);
  });
});

describe("dailyStatus", () => {
  it("derives availability from grant day and consumption", () => {
    expect(dailyStatus("2026-10-26", true, "2026-10-26")).toBe("used");
    expect(dailyStatus("2026-10-26", false, "2026-10-26")).toBe("available");
    expect(dailyStatus("2026-10-25", false, "2026-10-26")).toBe("expired");
  });
});

describe("rewardsTodayCount / filter mapping", () => {
  it("counts only today's referral rewards against the cap", () => {
    const rows = [
      row(5, "referral", "2026-10-26"),
      row(5, "referral", "2026-10-25"),
      row(50, "topup", "2026-10-26"),
    ];
    expect(rewardsTodayCount(rows, "2026-10-26")).toBe(1);
    // Design rule: inviter earns +1 question (5 tokens) per friend, max
    // +3 questions a day.
    expect(REFERRAL_DAILY_CAP).toBe(3);
    expect(REFERRAL_DAILY_CAP * 5).toBe(15);
  });

  it("maps history filters to ledger reasons", () => {
    expect(reasonsForFilter("all")).toBeNull();
    expect(reasonsForFilter("topup")).toEqual(["topup", "refund"]);
    expect(reasonsForFilter("daily")).toEqual(["daily"]);
    expect(reasonsForFilter("reading")).toEqual(["reading"]);
  });
});
