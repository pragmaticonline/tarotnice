import { describe, expect, it } from "vitest";
import app from "../src/index";
import { accountPage, safeReturnPath } from "../src/routes/auth-pages";

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
    expect(html).toContain("Sign out");
    expect(html).toContain("Back home");
    expect(html).toContain("Save your readings on any phone");
    expect(html).not.toContain("/students");
    expect(html).toContain("/billing"); // account drawer wallet link
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
