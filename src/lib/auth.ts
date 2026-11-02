import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
  mailniceConfigured,
  resetPasswordEmail,
  sendEmail,
  verificationEmail,
  type EmailEnv,
} from "./email";

export type AuthEnv = EmailEnv & {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  LINE_CHANNEL_ID?: string;
  LINE_CHANNEL_SECRET?: string;
};

export function googleConfigured(env: AuthEnv | undefined | null): boolean {
  return Boolean(env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET);
}

export function lineConfigured(env: AuthEnv | undefined | null): boolean {
  return Boolean(env?.LINE_CHANNEL_ID && env?.LINE_CHANNEL_SECRET);
}

/**
 * Move everything a guest accumulated onto the account they just
 * signed into (design board: "Readings you made as a guest on this
 * device move into your account"). Without this, Better Auth deletes
 * the anonymous user on sign-in and the cascade wipes it all.
 * Unique-key conflicts keep the registered account's row.
 */
async function mergeAnonymousUser(db: D1Database, anonId: string, newId: string): Promise<void> {
  if (!anonId || anonId === newId) return;
  const orm = drizzle(db, { schema });
  const move = async (run: () => Promise<unknown>) => {
    try { await run(); } catch { /* keep the account's own row on conflict */ }
  };
  await move(() => orm.update(schema.readings).set({ userId: newId }).where(eq(schema.readings.userId, anonId)));
  await move(() => orm.update(schema.tokenLedger).set({ userId: newId }).where(eq(schema.tokenLedger.userId, anonId)));
  await move(() => orm.update(schema.badgeShares).set({ userId: newId }).where(eq(schema.badgeShares.userId, anonId)));
  await move(() => orm.update(schema.shares).set({ userId: newId }).where(eq(schema.shares.userId, anonId)));
  // Daily draws are unique per (user, day): drop guest rows for days
  // the account already has, then move the rest.
  const newDays = await orm
    .select({ day: schema.dailyDraws.bangkokDay })
    .from(schema.dailyDraws)
    .where(eq(schema.dailyDraws.userId, newId));
  const taken = new Set(newDays.map((r) => r.day));
  const anonDraws = await orm
    .select({ day: schema.dailyDraws.bangkokDay })
    .from(schema.dailyDraws)
    .where(eq(schema.dailyDraws.userId, anonId));
  for (const d of anonDraws) {
    if (taken.has(d.day)) {
      await orm.delete(schema.dailyDraws).where(and(eq(schema.dailyDraws.userId, anonId), eq(schema.dailyDraws.bangkokDay, d.day)));
    }
  }
  await move(() => orm.update(schema.dailyDraws).set({ userId: newId }).where(eq(schema.dailyDraws.userId, anonId)));
  // Referrals are keyed by the visitor id.
  const existingRef = await orm
    .select({ v: schema.referrals.visitorUserId })
    .from(schema.referrals)
    .where(eq(schema.referrals.visitorUserId, newId));
  if (existingRef.length) {
    await orm.delete(schema.referrals).where(eq(schema.referrals.visitorUserId, anonId));
  } else {
    await move(() => orm.update(schema.referrals).set({ visitorUserId: newId }).where(eq(schema.referrals.visitorUserId, anonId)));
  }
  await move(() => orm.update(schema.referrals).set({ referrerUserId: newId }).where(eq(schema.referrals.referrerUserId, anonId)));
  // Single-row-per-user tables: keep whichever exists, account first.
  for (const table of [schema.userPrefs, schema.inviteCodes, schema.stripeCustomers] as const) {
    const has = await orm.select().from(table).where(eq(table.userId, newId)).limit(1);
    if (has.length) {
      await orm.delete(table).where(eq(table.userId, anonId));
    } else {
      await move(() => orm.update(table).set({ userId: newId }).where(eq(table.userId, anonId)));
    }
  }
}

/** A registered account is a real (non-anonymous) session user.
 *  TarotNice is free for everyone, anonymous or registered;
 *  registration only saves readings across devices. */
export function isRegisteredUser(
  user: { isAnonymous?: boolean | null } | null | undefined,
): boolean {
  return Boolean(user && !user.isAnonymous);
}

// Created per request: D1 and secrets arrive on the Worker env.
export function createAuth(env: AuthEnv) {
  const db = drizzle(env.DB, { schema });
  // Verification is enforced only once MailNice can actually deliver
  // the mail (MAILNICE_API_KEY + EMAIL_FROM set); before that, accounts
  // activate immediately (see email.ts).
  const requireVerification = mailniceConfigured(env);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: requireVerification,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) => {
        const mail = resetPasswordEmail(url);
        await sendEmail(env, { to: user.email, ...mail });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const mail = verificationEmail(url);
        await sendEmail(env, { to: user.email, ...mail });
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      },
      ...(lineConfigured(env)
        ? {
            line: {
              clientId: env.LINE_CHANNEL_ID as string,
              clientSecret: env.LINE_CHANNEL_SECRET as string,
            },
          }
        : {}),
    },
    plugins: [
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await mergeAnonymousUser(env.DB, anonymousUser.user.id, newUser.user.id);
        },
      }),
    ],
    trustedOrigins: env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
