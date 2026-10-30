import { and, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DailyDraw = {
  cardId: number;
  reversed: boolean;
  message: string;
  lang: string;
  shareId: string | null;
  createdAt: number;
};

export type CardView = {
  id: number;
  slug: string;
  arcana: string;
  suit: string | null;
  rank: number | null;
  imageKey: string;
  /** RWS scene note (EN canon); null until seeded / for TH rows. */
  imagery?: string | null;
  name: string;
  /** English card name (readings always use English card names). */
  nameEn?: string;
  keywordsUpright: string[];
  keywordsReversed: string[];
  upright: string;
  reversed: string;
  love: string | null;
  career: string | null;
  money: string | null;
  health: string | null;
  reviewed: boolean;
};

function parseKeywords(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function d1TarotStore(db: D1Database) {
  const orm: DrizzleD1Database<typeof schema> = drizzle(db, { schema });
  return {
    async getDaily(userId: string, day: string): Promise<DailyDraw | null> {
      const rows = await orm
        .select()
        .from(schema.dailyDraws)
        .where(
          and(
            eq(schema.dailyDraws.userId, userId),
            eq(schema.dailyDraws.bangkokDay, day),
          ),
        );
      const row = rows[0];
      if (!row) return null;
      return {
        cardId: row.cardId,
        reversed: row.reversed === 1,
        message: row.message,
        lang: row.lang,
        shareId: row.shareId,
        createdAt: row.createdAt,
      };
    },

    async insertDaily(
      userId: string,
      day: string,
      draw: { cardId: number; reversed: boolean; message: string; lang: string },
    ): Promise<DailyDraw> {
      const createdAt = Date.now();
      await orm
        .insert(schema.dailyDraws)
        .values({
          userId,
          bangkokDay: day,
          cardId: draw.cardId,
          reversed: draw.reversed ? 1 : 0,
          message: draw.message,
          lang: draw.lang,
          createdAt,
        })
        // Idempotent: a concurrent second draw keeps the first row.
        .onConflictDoNothing({
          target: [schema.dailyDraws.userId, schema.dailyDraws.bangkokDay],
        });
      const existing = await orm
        .select()
        .from(schema.dailyDraws)
        .where(
          and(
            eq(schema.dailyDraws.userId, userId),
            eq(schema.dailyDraws.bangkokDay, day),
          ),
        );
      const row = existing[0];
      return {
        cardId: row.cardId,
        reversed: row.reversed === 1,
        message: row.message,
        lang: row.lang,
        shareId: row.shareId,
        createdAt: row.createdAt,
      };
    },

    /** English names for all cards (lang='en' meaning rows). */
    async enNames(): Promise<Map<number, string>> {
      const rows = await orm
        .select({ cardId: schema.cardMeanings.cardId, name: schema.cardMeanings.name })
        .from(schema.cardMeanings)
        .where(eq(schema.cardMeanings.lang, "en"));
      return new Map(rows.map((r) => [r.cardId, r.name]));
    },

    async getCachedMessage(
      day: string,
      cardId: number,
      reversed: boolean,
      lang: string,
    ): Promise<string | null> {
      const rows = await orm
        .select({ message: schema.dailyMessageCache.message })
        .from(schema.dailyMessageCache)
        .where(
          and(
            eq(schema.dailyMessageCache.bangkokDay, day),
            eq(schema.dailyMessageCache.cardId, cardId),
            eq(schema.dailyMessageCache.reversed, reversed ? 1 : 0),
            eq(schema.dailyMessageCache.lang, lang),
          ),
        );
      return rows[0]?.message ?? null;
    },

    async setCachedMessage(
      day: string,
      cardId: number,
      reversed: boolean,
      lang: string,
      message: string,
    ): Promise<void> {
      await orm
        .insert(schema.dailyMessageCache)
        .values({ bangkokDay: day, cardId, reversed: reversed ? 1 : 0, lang, message })
        .onConflictDoNothing();
    },

    async getCard(cardId: number, lang: string): Promise<CardView | null> {
      const rows = await orm
        .select({
          id: schema.cards.id,
          slug: schema.cards.slug,
          arcana: schema.cards.arcana,
          suit: schema.cards.suit,
          rank: schema.cards.rank,
          imageKey: schema.cards.imageKey,
          name: schema.cardMeanings.name,
          keywordsUpright: schema.cardMeanings.keywordsUpright,
          keywordsReversed: schema.cardMeanings.keywordsReversed,
          upright: schema.cardMeanings.upright,
          reversed: schema.cardMeanings.reversed,
          love: schema.cardMeanings.love,
          career: schema.cardMeanings.career,
          money: schema.cardMeanings.money,
          health: schema.cardMeanings.health,
          reviewed: schema.cardMeanings.reviewed,
          imagery: schema.cardMeanings.imagery,
        })
        .from(schema.cards)
        .innerJoin(
          schema.cardMeanings,
          and(
            eq(schema.cardMeanings.cardId, schema.cards.id),
            eq(schema.cardMeanings.lang, lang),
          ),
        )
        .where(eq(schema.cards.id, cardId));
      const row = rows[0];
      if (!row) return null;
      const en = await this.enNames();
      return {
        ...row,
        nameEn: en.get(row.id),
        keywordsUpright: parseKeywords(row.keywordsUpright),
        keywordsReversed: parseKeywords(row.keywordsReversed),
        reviewed: row.reviewed === 1,
      };
    },

    /** All 78 cards with display names (library index), deck order. */
    async listCards(lang: string): Promise<(CardView & { reviewed: boolean })[]> {
      const rows = await orm
        .select({
          id: schema.cards.id,
          slug: schema.cards.slug,
          arcana: schema.cards.arcana,
          suit: schema.cards.suit,
          rank: schema.cards.rank,
          imageKey: schema.cards.imageKey,
          name: schema.cardMeanings.name,
          keywordsUpright: schema.cardMeanings.keywordsUpright,
          keywordsReversed: schema.cardMeanings.keywordsReversed,
          upright: schema.cardMeanings.upright,
          reversed: schema.cardMeanings.reversed,
          love: schema.cardMeanings.love,
          career: schema.cardMeanings.career,
          money: schema.cardMeanings.money,
          health: schema.cardMeanings.health,
          reviewed: schema.cardMeanings.reviewed,
          imagery: schema.cardMeanings.imagery,
        })
        .from(schema.cards)
        .innerJoin(
          schema.cardMeanings,
          and(
            eq(schema.cardMeanings.cardId, schema.cards.id),
            eq(schema.cardMeanings.lang, lang),
          ),
        )
        .orderBy(schema.cards.id);
      const en = await this.enNames();
      return rows.map((row) => ({
        ...row,
        nameEn: en.get(row.id),
        keywordsUpright: parseKeywords(row.keywordsUpright),
        keywordsReversed: parseKeywords(row.keywordsReversed),
        reviewed: row.reviewed === 1,
      }));
    },

    /** A card view by slug (library detail), or null. */
    async getCardBySlug(slug: string, lang: string): Promise<(CardView & { reviewed: boolean }) | null> {
      const rows = await orm
        .select({ id: schema.cards.id })
        .from(schema.cards)
        .where(eq(schema.cards.slug, slug))
        .limit(1);
      if (!rows[0]) return null;
      return this.getCard(rows[0].id, lang);
    },

    async insertReading(row: {
      id: string;
      userId: string;
      day: string;
      topic: string;
      question: string;
      lang: string;
      cards: { id: number; reversed: boolean }[];
    }): Promise<void> {
      await orm.insert(schema.readings).values({
        id: row.id,
        userId: row.userId,
        bangkokDay: row.day,
        topic: row.topic,
        question: row.question,
        lang: row.lang,
        cards: JSON.stringify(row.cards),
        status: "drawn",
        createdAt: Date.now(),
      });
    },

    async getReading(id: string): Promise<{
      id: string; userId: string; day: string; topic: string; question: string;
      lang: string; cards: { id: number; reversed: boolean }[];
      aiText: string | null; aiSummary: string | null; status: string;
      shareId: string | null; journal: string | null; createdAt: number;
    } | null> {
      const rows = await orm
        .select()
        .from(schema.readings)
        .where(eq(schema.readings.id, id));
      const row = rows[0];
      if (!row) return null;
      let cards: { id: number; reversed: boolean }[] = [];
      try {
        const parsed: unknown = JSON.parse(row.cards);
        if (Array.isArray(parsed)) cards = parsed as { id: number; reversed: boolean }[];
      } catch {
        cards = [];
      }
      return {
        id: row.id, userId: row.userId, day: row.bangkokDay, topic: row.topic,
        question: row.question, lang: row.lang, cards,
        aiText: row.aiText, aiSummary: row.aiSummary, status: row.status,
        shareId: row.shareId, journal: row.journal, createdAt: row.createdAt,
      };
    },

    async setReadingResult(
      id: string,
      result: { aiText: string; aiSummary: string; model: string; status: "complete" | "failed" | "drawn" | "streaming" },
    ): Promise<void> {
      await orm
        .update(schema.readings)
        .set({
          aiText: result.aiText,
          aiSummary: result.aiSummary,
          model: result.model,
          status: result.status,
        })
        .where(eq(schema.readings.id, id));
    },

    /** Last N readings with summaries, for AI continuity (newest first). */
    async prevReadings(userId: string, limit = 3): Promise<{ topic: string; cards: { id: number; reversed: boolean }[]; summary: string }[]> {
      const rows = await orm
        .select({ topic: schema.readings.topic, cards: schema.readings.cards, aiSummary: schema.readings.aiSummary })
        .from(schema.readings)
        .where(and(eq(schema.readings.userId, userId), eq(schema.readings.status, "complete")))
        .orderBy(desc(schema.readings.createdAt))
        .limit(limit + 1);
      return rows
        .filter((r) => r.aiSummary)
        .map((r) => {
          let cards: { id: number; reversed: boolean }[] = [];
          try {
            const parsed: unknown = JSON.parse(r.cards);
            if (Array.isArray(parsed)) cards = parsed as { id: number; reversed: boolean }[];
          } catch {
            cards = [];
          }
          return { topic: r.topic, cards, summary: r.aiSummary as string };
        });
    },

    /** A reading by its public share id (never exposes readings.id). */
    async getReadingByShare(shareId: string): Promise<{
      id: string; userId: string; topic: string; question: string; lang: string;
      cards: { id: number; reversed: boolean }[]; aiSummary: string | null;
      showQuestion: boolean;
    } | null> {
      const rows = await orm
        .select()
        .from(schema.readings)
        .where(eq(schema.readings.shareId, shareId));
      const row = rows[0];
      if (!row || row.status !== "complete") return null;
      let cards: { id: number; reversed: boolean }[] = [];
      try {
        const parsed: unknown = JSON.parse(row.cards);
        if (Array.isArray(parsed)) cards = parsed as { id: number; reversed: boolean }[];
      } catch {
        cards = [];
      }
      return {
        id: row.id, userId: row.userId, topic: row.topic, question: row.question,
        lang: row.lang, cards, aiSummary: row.aiSummary,
        showQuestion: row.shareQuestion === 1,
      };
    },

    async setReadingShare(id: string, shareId: string, showQuestion: boolean): Promise<void> {
      await orm
        .update(schema.readings)
        .set({ shareId, shareQuestion: showQuestion ? 1 : 0 })
        .where(eq(schema.readings.id, id));
    },

    async clearReadingShare(shareId: string, userId: string): Promise<boolean> {
      const rows = await orm
        .update(schema.readings)
        .set({ shareId: null })
        .where(and(eq(schema.readings.shareId, shareId), eq(schema.readings.userId, userId)))
        .returning({ id: schema.readings.id });
      return rows.length > 0;
    },

    async getDailyByShare(shareId: string): Promise<{
      userId: string; day: string; cardId: number; reversed: boolean;
      message: string; lang: string;
    } | null> {
      const rows = await orm
        .select()
        .from(schema.dailyDraws)
        .where(eq(schema.dailyDraws.shareId, shareId));
      const row = rows[0];
      if (!row) return null;
      return {
        userId: row.userId, day: row.bangkokDay, cardId: row.cardId,
        reversed: row.reversed === 1, message: row.message, lang: row.lang,
      };
    },

    async setDailyShare(userId: string, day: string, shareId: string): Promise<void> {
      await orm
        .update(schema.dailyDraws)
        .set({ shareId })
        .where(and(eq(schema.dailyDraws.userId, userId), eq(schema.dailyDraws.bangkokDay, day)));
    },

    async clearDailyShare(shareId: string, userId: string): Promise<boolean> {
      const rows = await orm
        .update(schema.dailyDraws)
        .set({ shareId: null })
        .where(and(eq(schema.dailyDraws.shareId, shareId), eq(schema.dailyDraws.userId, userId)))
        .returning({ userId: schema.dailyDraws.userId });
      return rows.length > 0;
    },

    /** Who owns a share id (for referral attribution + unshare). */
    async shareOwner(shareId: string): Promise<{ kind: "reading" | "daily"; userId: string } | null> {
      const [reading, daily] = await Promise.all([
        orm.select({ userId: schema.readings.userId }).from(schema.readings).where(eq(schema.readings.shareId, shareId)),
        orm.select({ userId: schema.dailyDraws.userId }).from(schema.dailyDraws).where(eq(schema.dailyDraws.shareId, shareId)),
      ]);
      if (reading[0]) return { kind: "reading", userId: reading[0].userId };
      if (daily[0]) return { kind: "daily", userId: daily[0].userId };
      return null;
    },

    async insertShare(id: string, shareId: string, userId: string, target: string): Promise<void> {
      await orm.insert(schema.shares).values({ id, shareId, userId, target, createdAt: Date.now() });
    },

    async getReferral(visitorId: string): Promise<{ shareId: string; referrerId: string; converted: boolean } | null> {
      const rows = await orm
        .select()
        .from(schema.referrals)
        .where(eq(schema.referrals.visitorUserId, visitorId));
      const row = rows[0];
      if (!row) return null;
      return { shareId: row.shareId, referrerId: row.referrerUserId, converted: row.firstReadingAt !== null };
    },

    async insertReferral(visitorId: string, shareId: string, referrerId: string): Promise<void> {
      await orm
        .insert(schema.referrals)
        .values({ visitorUserId: visitorId, shareId, referrerUserId: referrerId, createdAt: Date.now() })
        .onConflictDoNothing();
    },

    /** Conversions (first readings) attributed to a referrer since epoch ms. */
    async countReferralBonus(referrerId: string, since: number): Promise<number> {
      const rows = await orm
        .select({ at: schema.referrals.firstReadingAt })
        .from(schema.referrals)
        .where(and(eq(schema.referrals.referrerUserId, referrerId), gte(schema.referrals.firstReadingAt, since)));
      return rows.filter((r) => r.at !== null).length;
    },

    async convertReferral(visitorId: string): Promise<boolean> {
      const rows = await orm
        .update(schema.referrals)
        .set({ firstReadingAt: Date.now() })
        .where(and(eq(schema.referrals.visitorUserId, visitorId)))
        .returning({ visitorUserId: schema.referrals.visitorUserId });
      return rows.length > 0;
    },

    /** Per-IP daily draws (SPEC \u00a75.3 backstop; generous: 15/day). */
    async ipDayCount(ip: string, day: string): Promise<number> {
      const rows = await orm
        .select({ count: schema.rateDays.count })
        .from(schema.rateDays)
        .where(and(eq(schema.rateDays.ip, ip), eq(schema.rateDays.day, day)));
      return rows[0]?.count ?? 0;
    },

    async ipDayBump(ip: string, day: string): Promise<number> {
      const current = await orm
        .select({ count: schema.rateDays.count })
        .from(schema.rateDays)
        .where(and(eq(schema.rateDays.ip, ip), eq(schema.rateDays.day, day)));
      const next = (current[0]?.count ?? 0) + 1;
      await orm
        .insert(schema.rateDays)
        .values({ ip, day, count: next })
        .onConflictDoUpdate({ target: [schema.rateDays.ip, schema.rateDays.day], set: { count: next } });
      return next;
    },

    /** Reverse-chron readings page (cursor = created_at upper bound). */
    async listReadings(userId: string, cursor: number | null, limit: number): Promise<{
      id: string; day: string; topic: string; question: string; lang: string;
      cards: { id: number; reversed: boolean }[]; aiSummary: string | null;
      status: string; journal: string | null; shareId: string | null; createdAt: number;
    }[]> {
      const conds = [eq(schema.readings.userId, userId)];
      if (cursor !== null) conds.push(lt(schema.readings.createdAt, cursor));
      const rows = await orm
        .select()
        .from(schema.readings)
        .where(and(...conds))
        .orderBy(desc(schema.readings.createdAt))
        .limit(Math.min(30, Math.max(1, limit)));
      return rows.map((row) => {
        let cards: { id: number; reversed: boolean }[] = [];
        try {
          const parsed: unknown = JSON.parse(row.cards);
          if (Array.isArray(parsed)) cards = parsed as { id: number; reversed: boolean }[];
        } catch {
          cards = [];
        }
        return {
          id: row.id, day: row.bangkokDay, topic: row.topic, question: row.question,
          lang: row.lang, cards, aiSummary: row.aiSummary, status: row.status,
          journal: row.journal, shareId: row.shareId, createdAt: row.createdAt,
        };
      });
    },

    async deleteReading(id: string, userId: string): Promise<boolean> {
      const rows = await orm
        .delete(schema.readings)
        .where(and(eq(schema.readings.id, id), eq(schema.readings.userId, userId)))
        .returning({ id: schema.readings.id });
      return rows.length > 0;
    },

    async setJournal(id: string, userId: string, journal: string | null): Promise<boolean> {
      const rows = await orm
        .update(schema.readings)
        .set({ journal })
        .where(and(eq(schema.readings.id, id), eq(schema.readings.userId, userId)))
        .returning({ id: schema.readings.id });
      return rows.length > 0;
    },

    /** Totals for /progress: readings, distinct topics, daily count. */
    async progressStats(userId: string): Promise<{ readings: number; topics: string[]; dailies: number }> {
      const [all, draws] = await Promise.all([
        orm
          .select({ topic: schema.readings.topic, status: schema.readings.status })
          .from(schema.readings)
          .where(eq(schema.readings.userId, userId)),
        orm
          .select({ day: schema.dailyDraws.bangkokDay })
          .from(schema.dailyDraws)
          .where(eq(schema.dailyDraws.userId, userId)),
      ]);
      const complete = all.filter((r) => r.status === "complete");
      return {
        readings: complete.length,
        topics: [...new Set(complete.map((r) => r.topic))],
        dailies: draws.length,
      };
    },

    /** Owned card ids across readings + daily draws (deck collection). */
    async collection(userId: string): Promise<number[]> {
      const [all, draws] = await Promise.all([
        orm
          .select({ cards: schema.readings.cards, status: schema.readings.status })
          .from(schema.readings)
          .where(eq(schema.readings.userId, userId)),
        orm
          .select({ cardId: schema.dailyDraws.cardId })
          .from(schema.dailyDraws)
          .where(eq(schema.dailyDraws.userId, userId)),
      ]);
      const owned = new Set<number>(draws.map((r) => r.cardId));
      for (const row of all) {
        if (row.status !== "complete") continue;
        try {
          const parsed: unknown = JSON.parse(row.cards);
          if (Array.isArray(parsed)) {
            for (const c of parsed as { id: number }[]) {
              if (typeof c?.id === "number") owned.add(c.id);
            }
          }
        } catch {
          /* skip malformed rows */
        }
      }
      return [...owned].sort((a, b) => a - b);
    },

    async countShares(userId: string): Promise<number> {
      const rows = await orm
        .select({ id: schema.shares.id })
        .from(schema.shares)
        .where(eq(schema.shares.userId, userId));
      return rows.length;
    },

    async referralStats(userId: string): Promise<{ invited: number; converted: number }> {
      const rows = await orm
        .select({ at: schema.referrals.firstReadingAt })
        .from(schema.referrals)
        .where(eq(schema.referrals.referrerUserId, userId));
      return {
        invited: rows.length,
        converted: rows.filter((r) => r.at !== null).length,
      };
    },

    // --- Token wallet (balances derive from these rows; lib/wallet.ts) ---

    /** All ledger rows for a user, newest first. */
    async ledgerRows(userId: string): Promise<{
      id: string; delta: number; reason: string; ref: string;
      source: string | null; day: string; createdAt: number;
    }[]> {
      return orm
        .select()
        .from(schema.tokenLedger)
        .where(eq(schema.tokenLedger.userId, userId))
        .orderBy(desc(schema.tokenLedger.createdAt));
    },

    /** Today's rows only (daily-bucket math + referral cap window). */
    async ledgerRowsForDay(userId: string, day: string): Promise<{
      delta: number; reason: string; source: string | null; day: string; createdAt: number;
    }[]> {
      const rows = await orm
        .select({
          delta: schema.tokenLedger.delta,
          reason: schema.tokenLedger.reason,
          source: schema.tokenLedger.source,
          day: schema.tokenLedger.day,
          createdAt: schema.tokenLedger.createdAt,
        })
        .from(schema.tokenLedger)
        .where(and(eq(schema.tokenLedger.userId, userId), eq(schema.tokenLedger.day, day)));
      return rows;
    },

    /** Insert one ledger row; false when (user, reason, ref) already exists. */
    async postLedger(row: {
      userId: string; delta: number; reason: string; ref: string;
      source?: string | null; day: string;
    }): Promise<boolean> {
      const inserted = await orm
        .insert(schema.tokenLedger)
        .values({
          id: crypto.randomUUID(),
          userId: row.userId,
          delta: row.delta,
          reason: row.reason,
          ref: row.ref,
          source: row.source ?? null,
          day: row.day,
          createdAt: Date.now(),
        })
        .onConflictDoNothing()
        .returning({ id: schema.tokenLedger.id });
      return inserted.length > 0;
    },

    /** Remove a ledger row by (reason, ref) — undoes a spend when the
     *  reading insert fails right after it. */
    async deleteLedger(reason: string, ref: string): Promise<void> {
      await orm
        .delete(schema.tokenLedger)
        .where(and(eq(schema.tokenLedger.reason, reason), eq(schema.tokenLedger.ref, ref)));
    },

    /** Ledger rows for one reason+ref (webhook refund lookup). */
    async ledgerByRef(reason: string, ref: string): Promise<{
      userId: string; delta: number;
    } | null> {
      const rows = await orm
        .select({ userId: schema.tokenLedger.userId, delta: schema.tokenLedger.delta })
        .from(schema.tokenLedger)
        .where(and(eq(schema.tokenLedger.reason, reason), eq(schema.tokenLedger.ref, ref)))
        .limit(1);
      return rows[0] ?? null;
    },

    /** Cursor page of transactions (created_at upper bound, newest first). */
    async listTransactions(opts: {
      userId: string; reasons: string[] | null; cursor: number | null; limit: number;
    }): Promise<{
      delta: number; reason: string; ref: string; source: string | null;
      day: string; createdAt: number;
    }[]> {
      const conds = [eq(schema.tokenLedger.userId, opts.userId)];
      if (opts.reasons) conds.push(inArray(schema.tokenLedger.reason, opts.reasons));
      if (opts.cursor !== null) conds.push(lt(schema.tokenLedger.createdAt, opts.cursor));
      return orm
        .select({
          delta: schema.tokenLedger.delta,
          reason: schema.tokenLedger.reason,
          ref: schema.tokenLedger.ref,
          source: schema.tokenLedger.source,
          day: schema.tokenLedger.day,
          createdAt: schema.tokenLedger.createdAt,
        })
        .from(schema.tokenLedger)
        .where(and(...conds))
        .orderBy(desc(schema.tokenLedger.createdAt))
        .limit(Math.min(50, Math.max(1, opts.limit)));
    },

    /** Claim a Stripe event id; false = already seen (duplicate). */
    async claimStripeEvent(id: string, type: string, userId: string | null): Promise<boolean> {
      const rows = await orm
        .insert(schema.stripeEvents)
        .values({ id, type, userId, status: "claimed", createdAt: Date.now() })
        .onConflictDoNothing()
        .returning({ id: schema.stripeEvents.id });
      return rows.length > 0;
    },

    async markStripeEvent(id: string, status: string, userId?: string | null): Promise<void> {
      await orm
        .update(schema.stripeEvents)
        .set({ status, ...(userId !== undefined ? { userId } : {}) })
        .where(eq(schema.stripeEvents.id, id));
    },

    async getStripeCustomer(userId: string): Promise<string | null> {
      const rows = await orm
        .select({ customerId: schema.stripeCustomers.customerId })
        .from(schema.stripeCustomers)
        .where(eq(schema.stripeCustomers.userId, userId))
        .limit(1);
      return rows[0]?.customerId ?? null;
    },

    async setStripeCustomer(userId: string, customerId: string): Promise<void> {
      await orm
        .insert(schema.stripeCustomers)
        .values({ userId, customerId, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: schema.stripeCustomers.userId,
          set: { customerId, updatedAt: Date.now() },
        });
    },

    /** Verification/ anonymity flags for a user (referral reward gate). */
    async getUserFlags(userId: string): Promise<{ emailVerified: boolean; isAnonymous: boolean } | null> {
      const rows = await orm
        .select({ emailVerified: schema.user.emailVerified, isAnonymous: schema.user.isAnonymous })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { emailVerified: row.emailVerified === true, isAnonymous: row.isAnonymous === true };
    },

    /** Register (or fetch) the caller's invite code. */
    async ensureInviteCode(userId: string, code: string): Promise<string> {
      const existing = await orm
        .select({ code: schema.inviteCodes.code })
        .from(schema.inviteCodes)
        .where(eq(schema.inviteCodes.userId, userId))
        .limit(1);
      if (existing[0]) return existing[0].code;
      await orm
        .insert(schema.inviteCodes)
        .values({ userId, code, createdAt: Date.now() })
        .onConflictDoNothing();
      const rows = await orm
        .select({ code: schema.inviteCodes.code })
        .from(schema.inviteCodes)
        .where(eq(schema.inviteCodes.userId, userId))
        .limit(1);
      return rows[0]?.code ?? code;
    },

    /** Owner user id for an invite code, or null. */
    async inviteOwner(code: string): Promise<string | null> {
      const rows = await orm
        .select({ userId: schema.inviteCodes.userId })
        .from(schema.inviteCodes)
        .where(eq(schema.inviteCodes.code, code))
        .limit(1);
      return rows[0]?.userId ?? null;
    },

    /** Friends one user invited, with reward/verification state inputs. */
    async listReferralFriends(referrerId: string): Promise<{
      visitorUserId: string; createdAt: number; firstReadingAt: number | null;
      nickname: string | null; emailVerified: boolean; isAnonymous: boolean;
    }[]> {
      const rows = await orm
        .select({
          visitorUserId: schema.referrals.visitorUserId,
          createdAt: schema.referrals.createdAt,
          firstReadingAt: schema.referrals.firstReadingAt,
          nickname: schema.userPrefs.nickname,
          emailVerified: schema.user.emailVerified,
          isAnonymous: schema.user.isAnonymous,
        })
        .from(schema.referrals)
        .leftJoin(schema.user, eq(schema.user.id, schema.referrals.visitorUserId))
        .leftJoin(schema.userPrefs, eq(schema.userPrefs.userId, schema.referrals.visitorUserId))
        .where(eq(schema.referrals.referrerUserId, referrerId))
        .orderBy(desc(schema.referrals.createdAt));
      return rows.map((r) => ({
        visitorUserId: r.visitorUserId,
        createdAt: r.createdAt,
        firstReadingAt: r.firstReadingAt,
        nickname: r.nickname ?? null,
        emailVerified: r.emailVerified === true,
        isAnonymous: r.isAnonymous === true,
      }));
    },

    /**
     * Quota count for a Bangkok day: drawn, streaming, and complete
     * readings all count (a draw is a commitment — no re-rolls);
     * only failed readings are free. `excludeId` lets the stream
     * endpoint re-check the quota without counting itself.
     */
    async countReadings(userId: string, day: string, excludeId?: string): Promise<number> {
      const conds = [
        eq(schema.readings.userId, userId),
        eq(schema.readings.bangkokDay, day),
        ne(schema.readings.status, "failed"),
      ];
      if (excludeId) conds.push(ne(schema.readings.id, excludeId));
      const rows = await orm
        .select({ id: schema.readings.id })
        .from(schema.readings)
        .where(and(...conds));
      return rows.length;
    },

    /** The user's one open (drawn, not yet streamed) reading today. */
    async openDrawn(userId: string, day: string): Promise<{
      id: string; topic: string; question: string; lang: string;
      cards: { id: number; reversed: boolean }[];
    } | null> {
      const rows = await orm
        .select()
        .from(schema.readings)
        .where(
          and(
            eq(schema.readings.userId, userId),
            eq(schema.readings.bangkokDay, day),
            eq(schema.readings.status, "drawn"),
          ),
        )
        .orderBy(desc(schema.readings.createdAt))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      let cards: { id: number; reversed: boolean }[] = [];
      try {
        const parsed: unknown = JSON.parse(row.cards);
        if (Array.isArray(parsed)) cards = parsed as { id: number; reversed: boolean }[];
      } catch {
        cards = [];
      }
      return { id: row.id, topic: row.topic, question: row.question, lang: row.lang, cards };
    },

    /** Atomically claim a drawn reading for streaming (one opener). */
    async claimForStreaming(id: string, userId: string): Promise<boolean> {
      const rows = await orm
        .update(schema.readings)
        .set({ status: "streaming" })
        .where(
          and(
            eq(schema.readings.id, id),
            eq(schema.readings.userId, userId),
            eq(schema.readings.status, "drawn"),
          ),
        )
        .returning({ id: schema.readings.id });
      return rows.length > 0;
    },

    /** Distinct card ids drawn as DAILY cards (spec §5.4 collection). */
    async collectionDaily(userId: string): Promise<number[]> {
      const rows = await orm
        .select({ cardId: schema.dailyDraws.cardId })
        .from(schema.dailyDraws)
        .where(eq(schema.dailyDraws.userId, userId));
      return [...new Set(rows.map((r) => r.cardId))].sort((a, b) => a - b);
    },

    /** Most recent daily draws (progress strip), newest first. */
    async recentDailies(userId: string, limit: number): Promise<{ cardId: number; day: string; reversed: boolean }[]> {
      const rows = await orm
        .select({ cardId: schema.dailyDraws.cardId, day: schema.dailyDraws.bangkokDay, reversed: schema.dailyDraws.reversed })
        .from(schema.dailyDraws)
        .where(eq(schema.dailyDraws.userId, userId))
        .orderBy(desc(schema.dailyDraws.bangkokDay))
        .limit(Math.max(1, Math.min(30, limit)));
      return rows.map((r) => ({ cardId: r.cardId, day: r.day, reversed: r.reversed === 1 }));
    },

    /** All public share ids owned by the user (for data deletion). */
    async userShareIds(userId: string): Promise<string[]> {
      const [readings, dailies, badges] = await Promise.all([
        orm.select({ shareId: schema.readings.shareId }).from(schema.readings).where(eq(schema.readings.userId, userId)),
        orm.select({ shareId: schema.dailyDraws.shareId }).from(schema.dailyDraws).where(eq(schema.dailyDraws.userId, userId)),
        orm.select({ shareId: schema.badgeShares.shareId }).from(schema.badgeShares).where(eq(schema.badgeShares.userId, userId)),
      ]);
      const ids = new Set<string>();
      for (const r of [...readings, ...dailies]) if (r.shareId) ids.add(r.shareId);
      for (const b of badges) ids.add(b.shareId);
      return [...ids];
    },

    /** Reuse-or-create the public link for an earned badge. */
    async getOrCreateBadgeShare(userId: string, milestoneKey: string, makeId: () => string): Promise<string> {
      const rows = await orm
        .select({ shareId: schema.badgeShares.shareId })
        .from(schema.badgeShares)
        .where(and(eq(schema.badgeShares.userId, userId), eq(schema.badgeShares.milestoneKey, milestoneKey)))
        .limit(1);
      if (rows[0]) return rows[0].shareId;
      const shareId = makeId();
      await orm.insert(schema.badgeShares).values({ shareId, userId, milestoneKey, createdAt: Date.now() });
      return shareId;
    },

    async getBadgeShare(shareId: string): Promise<{ userId: string; milestoneKey: string } | null> {
      const rows = await orm
        .select({ userId: schema.badgeShares.userId, milestoneKey: schema.badgeShares.milestoneKey })
        .from(schema.badgeShares)
        .where(eq(schema.badgeShares.shareId, shareId))
        .limit(1);
      return rows[0] ?? null;
    },

    async clearBadgeShare(shareId: string, userId: string): Promise<boolean> {
      const rows = await orm
        .delete(schema.badgeShares)
        .where(and(eq(schema.badgeShares.shareId, shareId), eq(schema.badgeShares.userId, userId)))
        .returning({ shareId: schema.badgeShares.shareId });
      return rows.length > 0;
    },

    /** Distinct active days: daily draws \u222a completed readings. */
    async activityDays(userId: string): Promise<string[]> {
      const [draws, readings] = await Promise.all([
        orm
          .select({ day: schema.dailyDraws.bangkokDay })
          .from(schema.dailyDraws)
          .where(eq(schema.dailyDraws.userId, userId)),
        orm
          .select({ day: schema.readings.bangkokDay })
          .from(schema.readings)
          .where(
            and(
              eq(schema.readings.userId, userId),
              eq(schema.readings.status, "complete"),
            ),
          ),
      ]);
      return [...new Set([...draws.map((r) => r.day), ...readings.map((r) => r.day)])];
    },
  };
}

export type TarotStore = ReturnType<typeof d1TarotStore>;
