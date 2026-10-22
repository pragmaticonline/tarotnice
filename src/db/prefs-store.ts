import { eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type UserPrefs = {
  lang: string;
  theme: string | null;
  nickname: string | null;
};

export type PrefsStore = {
  get: (userId: string) => Promise<UserPrefs | null>;
  set: (userId: string, prefs: Partial<UserPrefs>) => Promise<UserPrefs>;
};

export function d1PrefsStore(db: D1Database): PrefsStore {
  const orm: DrizzleD1Database<typeof schema> = drizzle(db, { schema });
  return {
    get: async (userId) => {
      const rows = await orm
        .select({
          lang: schema.userPrefs.lang,
          theme: schema.userPrefs.theme,
          nickname: schema.userPrefs.nickname,
        })
        .from(schema.userPrefs)
        .where(eq(schema.userPrefs.userId, userId));
      return rows[0] ?? null;
    },
    set: async (userId, prefs) => {
      const now = Date.now();
      const current = await orm
        .select({
          lang: schema.userPrefs.lang,
          theme: schema.userPrefs.theme,
          nickname: schema.userPrefs.nickname,
        })
        .from(schema.userPrefs)
        .where(eq(schema.userPrefs.userId, userId));
      const merged: UserPrefs = {
        lang: prefs.lang ?? current[0]?.lang ?? "th",
        theme: prefs.theme ?? current[0]?.theme ?? null,
        nickname: prefs.nickname ?? current[0]?.nickname ?? null,
      };
      await orm
        .insert(schema.userPrefs)
        .values({ userId, ...merged, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.userPrefs.userId,
          set: { ...merged, updatedAt: now },
        });
      return merged;
    },
  };
}
