import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import app, { isInviteAttempt } from "../src/index";
import { inviteLandingPage } from "../src/routes/invite-landing";
import { INVITE_REF_COOKIE_DAYS } from "../src/lib/invite";
import { REFERRAL_FRIEND_BONUS_TOKENS, WELCOME_TOKENS } from "../src/lib/wallet";

const base = {
  origin: "https://tarotnice.com",
  code: "NICE-EF7J",
  inviterName: "Maew",
  inviteLink: "https://tarotnice.com/r/NICE-EF7J",
  social: { google: true, line: true },
};

describe("invite landing (spec copy and layout)", () => {
  it("guest lower section uses the design copy (page-scoped, register untouched)", () => {
    const html = inviteLandingPage({ ...base, ui: "th", state: "guest" });
    expect(html).toContain("\u0e23\u0e31\u0e1a\u0e02\u0e48\u0e32\u0e27\u0e2a\u0e32\u0e23\u0e41\u0e25\u0e30\u0e42\u0e1b\u0e23\u0e42\u0e21\u0e0a\u0e31\u0e19\u0e17\u0e32\u0e07\u0e2d\u0e35\u0e40\u0e21\u0e25");
    expect(html).toContain("\u0e40\u0e07\u0e34\u0e19\u0e08\u0e30\u0e40\u0e23\u0e35\u0e22\u0e01\u0e0a\u0e37\u0e48\u0e2d\u0e19\u0e35\u0e49\u0e43\u0e19\u0e01\u0e32\u0e23\u0e14\u0e39\u0e14\u0e27\u0e07");
    expect(html).toContain("\u0e21\u0e35\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e2d\u0e22\u0e39\u0e48\u0e41\u0e25\u0e49\u0e27?");
    expect(html).toContain("\u0e01\u0e32\u0e23\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e16\u0e37\u0e2d\u0e27\u0e48\u0e32\u0e04\u0e38\u0e13\u0e22\u0e2d\u0e21\u0e23\u0e31\u0e1a");
  });

  it("guest card carries the exact spec copy in Thai", () => {
    const html = inviteLandingPage({ ...base, ui: "th", state: "guest" });
    expect(html).toContain("Maew \u0e0a\u0e27\u0e19\u0e04\u0e38\u0e13\u0e21\u0e32\u0e14\u0e39<span class=\"nowrap\">\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c</span>");
    expect(html).toContain("\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35 \u0e41\u0e25\u0e49\u0e27\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1e\u0e48 3 \u0e43\u0e1a\u0e14\u0e49\u0e27\u0e22\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07 \u0e16\u0e32\u0e21\u0e44\u0e14\u0e49\u0e17\u0e38\u0e01\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07");
    expect(html).toContain("\u0e2a\u0e21\u0e31\u0e04\u0e23\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49 \u0e23\u0e31\u0e1a\u0e42\u0e17\u0e40\u0e04\u0e19\u0e1e\u0e34\u0e40\u0e28\u0e29\u0e08\u0e32\u0e01\u0e42\u0e04\u0e49\u0e14\u0e02\u0e2d\u0e07 Maew \u0e2d\u0e35\u0e01 10 \u0e42\u0e17\u0e40\u0e04\u0e19");
    expect(html).toContain("\u0e40\u0e01\u0e47\u0e1a\u0e44\u0e27\u0e49\u0e1a\u0e19\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49\u0e41\u0e04\u0e48 7 \u0e27\u0e31\u0e19");
    expect(html).toContain("\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a\u0e2a\u0e21\u0e32\u0e0a\u0e34\u0e01\u0e43\u0e2b\u0e21\u0e48");
    expect(html).toContain("\u0e08\u0e32\u0e01\u0e42\u0e04\u0e49\u0e14\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19");
    expect(html).toContain("\u0e23\u0e31\u0e1a\u0e17\u0e31\u0e19\u0e17\u0e35");
    expect(html).toContain("\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e40\u0e25\u0e22 \u0e23\u0e31\u0e1a 20 \u0e42\u0e17\u0e40\u0e04\u0e19");
    // No ask flow, no cards on the invite page.
    expect(html).not.toContain('id="q"');
    expect(html).not.toContain("draw-stage");
  });

  it("guest card carries the exact spec copy in English", () => {
    const html = inviteLandingPage({ ...base, ui: "en", state: "guest" });
    expect(html).toContain("Maew invited you to a <span class=\"nowrap\">tarot reading</span>");
    expect(html).toContain("Create a free account, then pick 3 cards yourself and ask about anything.");
    expect(html).toContain("Sign up now for 10 extra tokens from Maew&#39;s code");
    expect(html).toContain("is kept on this device for 7 days only. Sign up before it&#39;s gone.");
    expect(html).toContain("Welcome gift");
    expect(html).toContain("Friend&#39;s code");
    expect(html).toContain("Yours now");
    expect(html).toContain("Create account now \u2013 get 20 tokens");
  });

  it("keeps the spec order and the gold button style only on the submit", () => {
    const html = inviteLandingPage({ ...base, ui: "th", state: "guest" });
    const idx = (s: string) => html.indexOf(s);
    expect(idx('<span class="inv-avatar"')).toBeLessThan(idx('<h1 id="inv-title"'));
    expect(idx('<h1 id="inv-title"')).toBeLessThan(idx('<div class="inv-box"'));
    expect(idx('data-social="line"')).toBeLessThan(idx('data-social="google"'));
    expect(idx('data-social="google"')).toBeLessThan(idx("line-email-note"));
    expect(idx("line-email-note")).toBeLessThan(idx('id="name"'));
    expect(idx('id="name"')).toBeLessThan(idx('id="email"'));
    expect(idx('id="email"')).toBeLessThan(idx('id="password"'));
    expect(idx('id="password"')).toBeLessThan(idx('id="promo-opt"'));
    expect(idx('id="promo-opt"')).toBeLessThan(idx("inv-gold"));
    expect(html).toContain("linear-gradient(135deg,#f6e2b0 0%,#e2bf72 100%)");
    expect(html).toContain("max-width:440px");
    expect(html).toContain("padding:28px 24px");
    expect(html).toContain("border-radius:20px");
    expect(html).toContain("background:#fffaf0");
    expect(html).toContain("border:1px solid #e3d6b8");
    // News & offers starts unchecked (PDPA opt-in).
    expect(html).toContain('<input type="checkbox" id="promo-opt">');
    expect(html).not.toContain('id="promo-opt" checked');
  });

  it("member state shows no sign-up form and no code application script", () => {
    const html = inviteLandingPage({ ...base, ui: "th", state: "member", viewerCode: "NICE-AAAA" });
    expect(html).not.toContain('id="register-form"');
    expect(html).not.toContain("/api/me/invite");
    expect(html).not.toContain('<span class="inv-avatar"');
    expect(html).toContain("\u0e04\u0e38\u0e13\u0e21\u0e35\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e2d\u0e22\u0e39\u0e48\u0e41\u0e25\u0e49\u0e27");
    expect(html).toContain('href="/r/NICE-AAAA"');
    expect(html).toContain("\u0e44\u0e1b\u0e14\u0e39\u0e44\u0e1e\u0e48");
    const noCode = inviteLandingPage({ ...base, ui: "en", state: "member" });
    expect(noCode).toContain('href="/billing"');
    expect(noCode).toContain("You already have an account.");
  });

  it("own state is the inviter share view with link, LINE share and stats", () => {
    const html = inviteLandingPage({ ...base, ui: "en", state: "own" });
    expect(html).toContain("This is your invite link");
    expect(html).toContain("get 20 tokens when they sign up");
    expect(html).toContain("tarotnice.com/r/NICE-EF7J");
    expect(html).toContain("social-plugins.line.me/lineit/share");
    expect(html).toContain('href="/billing"');
    expect(html).not.toContain('id="register-form"');
    // LINE share must not duplicate the link (message text has it stripped).
    expect(html).not.toContain(encodeURIComponent("https://tarotnice.com/r/NICE-EF7J") + "%20https");
  });

  it("cookie days constant drives the stated duration", () => {
    expect(INVITE_REF_COOKIE_DAYS).toBe(7);
    const html = inviteLandingPage({ ...base, ui: "en", state: "guest" });
    expect(html).toContain(`for ${INVITE_REF_COOKIE_DAYS} days only`);
  });

  it("friend bonus is 10 tokens and welcome stays 10 (20 total)", () => {
    expect(REFERRAL_FRIEND_BONUS_TOKENS).toBe(10);
    expect(WELCOME_TOKENS).toBe(10);
  });

  it("friend bonus is granted server-side for every signup method, not only email", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const summary = src.slice(src.indexOf('app.get("/api/me/summary"'), src.indexOf('app.get("/api/me/invite/lookup"'));
    // In the first-summary path (which LINE/Google/email users all hit):
    // attribute from the cookie, then post the friend bonus by ledger ref.
    expect(summary).toContain("attributeReferral(c, store, user.id)");
    expect(summary).toContain("REFERRAL_FRIEND_BONUS_TOKENS, reason: \"referral\"");
    expect(summary).toContain("friend-bonus:");
  });

  it("route sends unknown invite codes to /register and never redirects guests to the ask page", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(src).toContain('if (!ownerId) return c.redirect("/register", 302);');
    expect(src).toContain("inviteLandingPage({");
  });

  it("malformed invite attempts go to /register, other garbage still 410s", async () => {
    expect(isInviteAttempt("NICE-ABC")).toBe(true);
    expect(isInviteAttempt("nice-ef7j")).toBe(true);
    expect(isInviteAttempt("AbC123XyZ9")).toBe(false);
    expect(isInviteAttempt("nope")).toBe(false);
    const bad = await app.request("/r/NICE-ABC");
    expect(bad.status).toBe(302);
    expect(bad.headers.get("location")).toBe("/register");
    expect((await app.request("/r/nope")).status).toBe(410);
  });
});
