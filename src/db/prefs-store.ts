import { eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type UserPrefs = {
  lang: string;
  theme: string | null;
  nickname: string | null;
  notifyDaily: boolean;
  notifyPromo: boolean;
};

export type PrefsStore = {
  get: (userId: string) => Promise<UserPrefs | null>;
  set: (userId: string, prefs: Partial<UserPrefs>) => Promise<UserPrefs>;
};

const DEFAULTS: UserPrefs = {
  lang: "th",
  theme: null,
  nickname: null,
  notifyDaily: true,
  notifyPromo: true,
};

function toPrefs(row: {
  lang: string;
  theme: string | null;
  nickname: string | null;
  notifyDaily: number;
  notifyPromo: number;
}): UserPrefs {
  return {
    lang: row.lang,
    theme: row.theme,
    nickname: row.nickname,
    notifyDaily: row.notifyDaily === 1,
    notifyPromo: row.notifyPromo === 1,
  };
}

const COLS = {
  lang: schema.userPrefs.lang,
  theme: schema.userPrefs.theme,
  nickname: schema.userPrefs.nickname,
  notifyDaily: schema.userPrefs.notifyDaily,
  notifyPromo: schema.userPrefs.notifyPromo,
};

export function d1PrefsStore(db: D1Database): PrefsStore {
  const orm: DrizzleD1Database<typeof schema> = drizzle(db, { schema });
  return {
    get: async (userId) => {
      const rows = await orm
        .select(COLS)
        .from(schema.userPrefs)
        .where(eq(schema.userPrefs.userId, userId));
      return rows[0] ? toPrefs(rows[0]) : null;
    },
    set: async (userId, prefs) => {
      const now = Date.now();
      const current = await orm
        .select(COLS)
        .from(schema.userPrefs)
        .where(eq(schema.userPrefs.userId, userId));
      const base = current[0] ? toPrefs(current[0]) : DEFAULTS;
      const merged: UserPrefs = {
        lang: prefs.lang ?? base.lang,
        theme: prefs.theme !== undefined ? prefs.theme : base.theme,
        nickname: prefs.nickname !== undefined ? prefs.nickname : base.nickname,
        notifyDaily: prefs.notifyDaily ?? base.notifyDaily,
        notifyPromo: prefs.notifyPromo ?? base.notifyPromo,
      };
      const stored = {
        lang: merged.lang,
        theme: merged.theme,
        nickname: merged.nickname,
        notifyDaily: merged.notifyDaily ? 1 : 0,
        notifyPromo: merged.notifyPromo ? 1 : 0,
      };
      await orm
        .insert(schema.userPrefs)
        .values({ userId, ...stored, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.userPrefs.userId,
          set: { ...stored, updatedAt: now },
        });
      return merged;
    },
  };
}
