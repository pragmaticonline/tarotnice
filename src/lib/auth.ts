import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
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
};

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
    },
    plugins: [anonymous()],
    trustedOrigins: env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
