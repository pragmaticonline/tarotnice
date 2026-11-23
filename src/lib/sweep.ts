// Auto-refund sweeper for stuck readings (cron trigger, every 15 min).
// Closes the hole where a charged draw never opened a stream: drawn rows
// older than DRAWN_AFTER_MS and dead streaming rows older than
// STREAMING_AFTER_MS are marked failed and their spend refunded, exactly
// once each (conditional update + idempotent ledger ref). Failed rows need
// nothing: the stream catch already refunded and deleted their spend.
import { d1TarotStore } from "../db/tarot-store";
import { TOKENS_PER_QUESTION } from "./wallet";
import { bangkokDay } from "./bangkok";

/** A charged draw gets this long to open its stream before auto-refund. */
export const AUTO_REFUND_DRAWN_AFTER_MS = 10 * 60 * 1000;
/** A claimed stream gets this long before it is declared dead. */
export const AUTO_REFUND_STREAMING_AFTER_MS = 60 * 60 * 1000;
export const SWEEP_BATCH_LIMIT = 100;

export type SweepOutcome = { refunded: string[]; markedFailed: string[] };

/**
 * Refund + fail every stuck charged reading. Order matters: the reading
 * is marked failed first (conditional on still being stuck, so an
 * in-flight open wins the race), and only then is the spend refunded.
 * A failed mark without a refund is the safe failure mode: the staff
 * queue surfaces unrefunded failures for a manual top-up.
 */
export async function sweepStuckReadings(
  db: D1Database,
  now = Date.now(),
  onEvent?: (name: string, readingId: string) => void,
): Promise<SweepOutcome> {
  const store = d1TarotStore(db);
  const out: SweepOutcome = { refunded: [], markedFailed: [] };
  const rows = await store
    .stuckReadings({
      drawnBeforeMs: now - AUTO_REFUND_DRAWN_AFTER_MS,
      streamingBeforeMs: now - AUTO_REFUND_STREAMING_AFTER_MS,
      failedSinceMs: 0,
      limit: SWEEP_BATCH_LIMIT,
    })
    .catch(() => []);
  for (const row of rows) {
    if (row.status !== "drawn" && row.status !== "streaming") continue;
    let marked = false;
    try {
      marked = await store.failStuckReading(row.id, now - AUTO_REFUND_DRAWN_AFTER_MS, now - AUTO_REFUND_STREAMING_AFTER_MS);
    } catch {
      continue;
    }
    if (!marked) continue;
    out.markedFailed.push(row.id);
    try {
      const spend = await store.ledgerByRef("reading", row.id).catch(() => null);
      if (!spend) continue;
      const granted = await store
        .postLedger({
          userId: row.userId,
          delta: TOKENS_PER_QUESTION,
          reason: "refund",
          ref: row.id,
          day: bangkokDay(new Date(now)),
        })
        .catch(() => false);
      if (granted) {
        out.refunded.push(row.id);
        try {
          onEvent?.("auto_refund", row.id);
        } catch {
          /* observability is best-effort */
        }
      }
    } catch {
      /* marked failed without refund: staff queue shows it unrefunded */
    }
  }
  return out;
}
