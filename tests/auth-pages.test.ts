import { describe, expect, it } from "vitest";
import app from "../src/index";
import { escapeHtml } from "../src/lib/html";
import { t } from "../src/lib/i18n";
import { accountPage, registerPage, safeReturnPath, signInPage } from "../src/routes/auth-pages";

describe("safeReturnPath", () => {
  it("allows only same-origin absolute paths", () => {
    expect(safeReturnPath("/account")).toBe("/account");
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath("https://evil.example/")).toBe("/");
    expect(safeReturnPath("//evil.example/")).toBe("/");
  });
});

describe("auth pages", () => {
  it("register offers Google and links sign-in", async () => {
    const html = await (await app.request("/register")).text();
    expect(html).toContain("Continue with Google");
    expect(html).toContain("/api/auth/sign-up/email");
    expect(html).toContain("/sign-in");
    expect(html).toContain("/billing"); // account drawer wallet link
    expect(html).not.toContain("Premium");
  });

  it("register consent links open Terms/Privacy in a new tab", async () => {
    // New tabs keep the typed invite code and form: no navigation away.
    // (?ui= itself 302s to set the cookie, so pass the cookie directly.)
    for (const cookie of ["", "nl_ui=th"]) {
      const html = await (
        await app.request("/register", { headers: cookie ? { cookie } : {} })
      ).text();
      expect(html).toContain('<a href="/terms" target="_blank"');
      expect(html).toContain('<a href="/privacy" target="_blank"');
    }
  });

  it("sign-in offers Google and password reset", async () => {
    const html = await (await app.request("/sign-in")).text();
    expect(html).toContain("Continue with Google");
    expect(html).toContain("/forgot-password");
    expect(html).toContain("/register");
  });

  it("account page links Google, signs out, goes home", () => {
    const html = accountPage("", "ploy@example.com", "en");
    expect(html).toContain("Continue with Google");
    expect(html).not.toContain("provider=line");
    expect(html).toContain("Sign out");
    expect(html).toContain("Back home");
    expect(html).toContain("Save your readings on any phone");
    expect(html).not.toContain("/students");
    expect(html).toContain("/billing"); // account drawer wallet link
  });

  it("account page links LINE only when configured", () => {
    const html = accountPage("", "ploy@example.com", "en", { lang: "en", theme: null, nickname: null }, { line: true });
    expect(html).toContain("Continue with LINE");
    expect(html).toContain("provider=line");
  });

  it("account redirects anonymous visitors to sign-in", async () => {
    const res = await app.request("/account");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/sign-in");
  });

  it("password guards reference the in-scope variable, not bare v", async () => {
    // Regression: passwordOk() once emitted `.test(v)` with no `v` in
    // scope, so submit threw an unhandled rejection outside `try` and
    // the button died with no message.
    const register = await (await app.request("/register")).text();
    expect(register).toContain(".test(password)");
    expect(register).not.toContain(".test(v)");
    const reset = await (await app.request("/reset-password?token=x")).text();
    expect(reset).toContain(".test(pw)");
    expect(reset).not.toContain(".test(v)");
  });

  it("sign-in and register explain LINE email_not_found", async () => {
    // Better Auth redirects OAuth failures (e.g. LINE withholding the
    // email claim) back with ?error=email_not_found. The pages must
    // render a friendly message, never the raw code.
    for (const path of ["/sign-in?error=email_not_found", "/register?error=email_not_found"]) {
      const html = await (await app.request(path)).text();
      expect(html).toContain(t("en").lineEmailMissing);
      expect(html).not.toContain("email_not_found");
    }
    const th = await (await app.request("/sign-in?error=email_not_found", { headers: { cookie: "nl_ui=th" } })).text();
    expect(th).toContain(t("th").lineEmailMissing);
    expect(th).not.toContain("email_not_found");
  });

  it("shows the LINE email consent notice under the LINE button", () => {
    for (const uiLang of ["en", "th"] as const) {
      const d = t(uiLang);
      for (const html of [
        signInPage(null, "", uiLang, { google: true, line: true }),
        registerPage(null, "", uiLang, { google: true, line: true }),
      ]) {
        expect(html).toContain(d.continueWithLine);
        expect(html).toContain("06C755");
        // LINE button first, with the official-style logo on the left.
        expect(html.indexOf('data-social="line"')).toBeLessThan(html.indexOf('data-social="google"'));
        const lineBtn = html.slice(html.indexOf('data-social="line"'), html.indexOf("</button>", html.indexOf('data-social="line"')));
        expect(lineBtn).toContain("<svg");
        // LINE states: #06C755 base, 10% black overlay on hover, 30% on press.
        expect(html).toContain("rgba(0,0,0,.1)");
        expect(html).toContain("rgba(0,0,0,.3)");
        expect(html).not.toContain("#05B34C");
        // Consent notice: bold lead, green box, privacy link.
        expect(html).toContain(`<strong>${escapeHtml(d.lineEmailLead)}</strong>`);
        expect(html).toContain(escapeHtml(d.lineEmailPrefix));
        expect(html).toContain(`<a href="/privacy" target="_blank" rel="noopener">${escapeHtml(d.lineEmailLink)}</a>`);
        expect(html).toContain(escapeHtml(d.lineEmailSuffix));
        expect(html).toContain("line-email-note");
        expect(html).toContain("eef8f1");
        expect(html).toContain("bfe6cc");
      }
      // No LINE button, no notice.
      expect(signInPage(null, "", uiLang, { google: true })).not.toContain(escapeHtml(d.lineEmailPrefix));
    }
  });

  it("explains account_not_linked with fallback instructions", async () => {
    for (const path of ["/sign-in?error=account_not_linked", "/sign-in?error=unable_to_link_account", "/register?error=account_not_linked"]) {
      const html = await (await app.request(path)).text();
      expect(html).toContain(t("en").accountAlreadyExists);
      expect(html).not.toContain("account_not_linked");
    }
    const th = await (await app.request("/sign-in?error=account_not_linked", { headers: { cookie: "nl_ui=th" } })).text();
    expect(th).toContain(t("th").accountAlreadyExists);
  });

  it("ignores unknown error codes on auth pages", async () => {
    const html = await (await app.request("/sign-in?error=zzz_evil")).text();
    expect(html).not.toContain("zzz_evil");
  });

  it("renders password toggles as icon buttons, not text", async () => {
    for (const path of ["/register", "/sign-in", "/reset-password?token=x"]) {
      const html = await (await app.request(path)).text();
      expect(html).toContain('class="pw-toggle"');
      expect(html).toContain('aria-label="Show password"');
      expect(html).toContain("data-pw-eye");
      expect(html).toContain("<svg");
      expect(html).not.toContain('class="linklike pw-toggle"');
      expect(html).not.toContain(">Show password</button>");
    }
  });
});
