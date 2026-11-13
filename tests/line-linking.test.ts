import { describe, expect, it } from "vitest";
import { createAuth, lineProfileToUser, type AuthEnv } from "../src/lib/auth";

/**
 * Regression tests for the account_not_linked deadlock. Instead of
 * stubbing D1 (what drizzle-adapter needs), we pin the policy Better
 * Auth enforces at link-account.mjs:139 against the real options it
 * hands the library, plus the mapper that produces the email:
 *
 *  A. brand-new LINE user → new account with the granted email
 *     (mapper: granted email untouched; fresh DB lookup means register)
 *  B. existing verified user → LINE links implicitly (trusted provider)
 *  C. existing unverified user → blocked, must link explicitly from
 *     Account settings (no takeover of unverified accounts)
 */
function testAuthOptions() {
  const env = {
    DB: {} as D1Database,
    BETTER_AUTH_SECRET: "test-secret-for-linking-32-chars-long",
    BETTER_AUTH_URL: "https://tarotnice.com",
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    LINE_CHANNEL_ID: "1234567890",
    LINE_CHANNEL_SECRET: "line-secret",
  } as unknown as AuthEnv;
  const auth = createAuth(env) as unknown as {
    options: { account?: { accountLinking?: Record<string, unknown> } };
  };
  return auth.options.account?.accountLinking;
}

function shouldBlockImplicitLink(
  linking: Record<string, unknown> | undefined,
  userInfo: { emailVerified: boolean },
  localUser: { emailVerified: boolean },
  providerId: string,
): boolean {
  // Mirrors link-account.mjs:137-139.
  const trustedProviders = (linking?.trustedProviders as string[] | undefined) ?? [];
  const isTrustedProvider = trustedProviders.includes(providerId);
  const requireLocalEmailVerified = (linking?.requireLocalEmailVerified as boolean | undefined) ?? true;
  const enabled = linking?.enabled ?? true;
  const disableImplicitLinking = linking?.disableImplicitLinking ?? false;
  return (
    (!isTrustedProvider && !userInfo.emailVerified) ||
    (requireLocalEmailVerified && !localUser.emailVerified) ||
    enabled === false ||
    disableImplicitLinking === true
  );
}

describe("LINE account linking (trusted providers)", () => {
  it("A. brand-new LINE user gets a fresh account with the granted email", () => {
    // A new DB lookup returns null → isRegister=true → linkAccount path
    // never runs, so no gate applies. The email comes from the mapper.
    expect(lineProfileToUser({ sub: "U-new", email: "ploy@example.com" })).toEqual({});
    expect(lineProfileToUser({ sub: "U-new" })).toEqual({ email: "U-new@line.invalid" });
  });

  it("B. existing verified user links LINE implicitly", () => {
    const linking = testAuthOptions();
    expect(linking?.enabled).toBe(true);
    expect(linking?.trustedProviders).toContain("line");
    expect(linking?.trustedProviders).toContain("google");
    // LINE reports emailVerified=false, local user is verified.
    const blocked = shouldBlockImplicitLink(linking, { emailVerified: false }, { emailVerified: true }, "line");
    expect(blocked).toBe(false);
  });

  it("C. existing unverified user is NOT implicitly linked", () => {
    const linking = testAuthOptions();
    // requireLocalEmailVerified must stay at its default (true).
    expect(linking?.requireLocalEmailVerified ?? true).toBe(true);
    const blocked = shouldBlockImplicitLink(linking, { emailVerified: false }, { emailVerified: false }, "line");
    expect(blocked).toBe(true);
    // Without the trusted entry it would also block verified users —
    // the config above is what removes that.
    const untrusted = shouldBlockImplicitLink(
      { enabled: true, trustedProviders: ["google"] },
      { emailVerified: false },
      { emailVerified: true },
      "line",
    );
    expect(untrusted).toBe(true);
  });
});
