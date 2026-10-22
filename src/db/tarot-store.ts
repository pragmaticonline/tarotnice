import { and, desc, eq, gte } from "drizzle-orm";
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
  name: string;
  keywordsUpright: string[];
  keywordsReversed: string[];
  upright: string;
  reversed: string;
  love: string | null;
  career: string | null;
  money: string | null;
  health: string | null;
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
      return {
        ...row,
        keywordsUpright: parseKeywords(row.keywordsUpright),
        keywordsReversed: parseKeywords(row.keywordsReversed),
      };
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
      shareId: string | null;
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
        shareId: row.shareId,
      };
    },

    async setReadingResult(
      id: string,
      result: { aiText: string; aiSummary: string; model: string; status: "complete" | "failed" | "drawn" },
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

    /** Completed readings for the user on a Bangkok day (quota). */
    async countReadings(userId: string, day: string): Promise<number> {
      const rows = await orm
        .select({ id: schema.readings.id })
        .from(schema.readings)
        .where(
          and(
            eq(schema.readings.userId, userId),
            eq(schema.readings.bangkokDay, day),
            eq(schema.readings.status, "complete"),
          ),
        );
      return rows.length;
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
