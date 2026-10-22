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
    expect(html).not.toContain("/billing");
    expect(html).not.toContain("Premium");
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
    expect(html).not.toContain("/billing");
  });

  it("account redirects anonymous visitors to sign-in", async () => {
    const res = await app.request("/account");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/sign-in");
  });
});
