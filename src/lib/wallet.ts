// Token wallet rules (SPEC: 5 tokens = 1 question). Pure functions of
// the ledger rows: the store keeps one row per movement, and every
// balance the UI shows derives from these — never a stored counter.

export const TOKENS_PER_QUESTION = 5;
/** Free tokens per Bangkok day (one free question), use-it-or-lose-it. */
export const DAILY_FREE_TOKENS = 5;
/** Referral reward when a friend finishes their first reading. */
export const REFERRAL_REWARD_TOKENS = 5;
/** Joining bonus for the friend who signs up with an invite code. */
export const REFERRAL_FRIEND_BONUS_TOKENS = 10;
/** Max rewarded friends per referrer per Bangkok day (+3 questions). */
export const REFERRAL_DAILY_CAP = 3;

/** Mouse-catch easter egg: at most 3 caught mice (tokens) per Bangkok day. */
export const MOUSE_DAILY_CAP = 3;

/** Minimum gap between mouse catches; mirrors the 5-minute spawn cadence. */
export const MOUSE_CATCH_GAP_MS = 5 * 60 * 1000;
/** One-time code sent when a user adds the LINE OA: one free question. */
export const LINE_WELCOME_BONUS_TOKENS = 5;

export type LedgerReason = "daily" | "topup" | "reading" | "referral" | "refund" | "welcome" | "promo" | "staff_grant" | "checkin" | "affiliate_claim" | "mouse";
/** One-off welcome grant for a first registered sign-in (+2 questions). */
export const WELCOME_TOKENS = 10;
export type LedgerSource = "daily" | "wallet";

export type LedgerRow = {
  delta: number;
  reason: LedgerReason;
  ref?: string;
  source: LedgerSource | null;
  /** Bangkok day (YYYY-MM-DD) the row belongs to. */
  day: string;
  createdAt: number;
};

export function walletBalance(
  rows: LedgerRow[],
  today: string,
): { wallet: number; dailyLeft: number } {
  let wallet = 0;
  let dailyLeft = 0;
  for (const r of rows) {
    if (r.reason === "daily" || (r.reason === "reading" && r.source === "daily")) {
      // The daily bucket counts only today's rows: yesterday's unspent
      // grant is expired by scoping, never rolled forward.
      if (r.day === today) dailyLeft += r.delta;
    } else {
      wallet += r.delta;
    }
  }
  return { wallet, dailyLeft: Math.max(0, dailyLeft) };
}

/** Decide how a new question is paid for (free tokens always first). */
export function planSpend(
  balance: { wallet: number; dailyLeft: number },
  userKind: "anon" | "registered",
): { ok: true; source: LedgerSource } | { ok: false; error: "registration_required" | "insufficient_tokens" } {
  if (balance.dailyLeft >= TOKENS_PER_QUESTION) return { ok: true, source: "daily" };
  if (userKind !== "registered") return { ok: false, error: "registration_required" };
  if (balance.wallet >= TOKENS_PER_QUESTION) return { ok: true, source: "wallet" };
  return { ok: false, error: "insufficient_tokens" };
}

/** History presentation for a daily grant row. */
export function dailyStatus(
  grantDay: string,
  consumed: boolean,
  today: string,
): "available" | "used" | "expired" {
  if (consumed) return "used";
  return grantDay === today ? "available" : "expired";
}

/** Referral rewards granted inside the given Bangkok day. */
export function rewardsTodayCount(rows: LedgerRow[], today: string): number {
  return rows.filter((r) => r.reason === "referral" && r.day === today && !isFriendTopupBonus(r)).length;
}

/** The friend's own 10%-per-top-up bonus: referral reason, but never a +5. */
export function isFriendTopupBonus(r: { reason: string; ref?: string }): boolean {
  return r.reason === "referral" && (r.ref ?? "").startsWith("friend-topup-bonus:");
}

export type TransactionFilter = "all" | "topup" | "daily" | "reading";

/** Ledger reasons behind each history tab filter (null = no filter). */
export function reasonsForFilter(filter: TransactionFilter): LedgerReason[] | null {
  if (filter === "topup") return ["topup", "refund", "staff_grant", "affiliate_claim"];
  if (filter === "daily") return ["daily", "checkin", "mouse"];
  if (filter === "reading") return ["reading"];
  return null;
}

export function isTransactionFilter(v: unknown): v is TransactionFilter {
  return v === "all" || v === "topup" || v === "daily" || v === "reading";
}
