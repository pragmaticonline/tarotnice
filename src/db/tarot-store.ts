import { and, eq } from "drizzle-orm";
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

    /** Distinct active days: daily draws ∪ completed readings. */
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
