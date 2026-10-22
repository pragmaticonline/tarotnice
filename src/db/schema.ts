import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Core Better Auth tables (D1/SQLite). Matches `auth generate` output;
// `isAnonymous` on user comes from the anonymous plugin.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// Static content, seeded from content/cards.json.
export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey(), // 0..77 (0-21 major, 22-77 minor)
  slug: text("slug").notNull().unique(), // 'the-fool', 'ten-of-wands'
  arcana: text("arcana").notNull(), // 'major' | 'minor'
  suit: text("suit"), // wands|cups|swords|pentacles|NULL
  rank: integer("rank"), // 0-21 major, 1-14 minor
  imageKey: text("image_key").notNull(), // 'cards/major-00'
});

export const cardMeanings = sqliteTable(
  "card_meanings",
  {
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    lang: text("lang").notNull(), // 'th' | 'en'
    name: text("name").notNull(),
    keywordsUpright: text("keywords_upright").notNull(), // JSON array
    keywordsReversed: text("keywords_reversed").notNull(), // JSON array
    upright: text("upright").notNull(),
    reversed: text("reversed").notNull(),
    love: text("love"),
    career: text("career"),
    money: text("money"),
    health: text("health"),
  },
  (t) => ({
    pk: uniqueIndex("card_meanings_card_lang").on(t.cardId, t.lang),
  }),
);

export const userPrefs = sqliteTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lang: text("lang").notNull().default("th"),
  theme: text("theme"), // 'day' | 'night' | NULL (auto)
  nickname: text("nickname"),
  updatedAt: integer("updated_at").notNull(),
});

export const dailyDraws = sqliteTable(
  "daily_draws",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bangkokDay: text("bangkok_day").notNull(), // 'YYYY-MM-DD'
    cardId: integer("card_id").notNull(),
    reversed: integer("reversed").notNull(),
    message: text("message").notNull(),
    lang: text("lang").notNull(),
    shareId: text("share_id").unique(), // set when first shared
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    pk: uniqueIndex("daily_draws_user_day").on(t.userId, t.bangkokDay),
  }),
);

export const dailyMessageCache = sqliteTable(
  "daily_message_cache",
  {
    bangkokDay: text("bangkok_day").notNull(),
    cardId: integer("card_id").notNull(),
    reversed: integer("reversed").notNull(),
    lang: text("lang").notNull(),
    message: text("message").notNull(),
  },
  (t) => ({
    pk: uniqueIndex("daily_message_cache_key").on(
      t.bangkokDay,
      t.cardId,
      t.reversed,
      t.lang,
    ),
  }),
);

export const readings = sqliteTable(
  "readings",
  {
    id: text("id").primaryKey(), // uuid
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bangkokDay: text("bangkok_day").notNull(),
    topic: text("topic").notNull(), // love|career|money|health|general
    question: text("question").notNull(), // max 200 chars
    lang: text("lang").notNull(),
    cards: text("cards").notNull(), // JSON [{id, reversed}] x3, drawn server-side
    aiText: text("ai_text"), // full interpretation
    aiSummary: text("ai_summary"), // 1 sentence, used in share images
    model: text("model"),
    status: text("status").notNull(), // 'drawn' | 'complete' | 'failed'
    journal: text("journal"), // user's own note, optional
    shareId: text("share_id").unique(),
    shareQuestion: integer("share_question").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    userDay: index("readings_user_day").on(t.userId, t.bangkokDay),
  }),
);

// One row per share action, for virality metrics.
export const shares = sqliteTable("shares", {
  id: text("id").primaryKey(),
  shareId: text("share_id").notNull(), // readings.share_id or daily_draws.share_id or 'badge:...'
  userId: text("user_id").notNull(),
  target: text("target").notNull(), // native|line|facebook|x|instagram|copy|save
  createdAt: integer("created_at").notNull(),
});

// Per-IP daily draw counts for the SPEC §5.3 abuse backstop (the
// Rate Limiting binding only does burst windows on this wrangler).
export const rateDays = sqliteTable(
  "rate_days",
  {
    ip: text("ip").notNull(),
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    pk: uniqueIndex("rate_days_ip_day").on(t.ip, t.day),
  }),
);

// Who arrived via whose share.
export const referrals = sqliteTable("referrals", {
  visitorUserId: text("visitor_user_id").primaryKey(),
  shareId: text("share_id").notNull(),
  referrerUserId: text("referrer_user_id").notNull(),
  firstReadingAt: integer("first_reading_at"), // set when the visitor completes a first reading
  createdAt: integer("created_at").notNull(),
});
