import { describe, expect, it } from "vitest";
import { resetPasswordEmail, verificationEmail } from "../src/lib/email";

const URL = "https://tarotnice.com/api/auth/verify-email?token=abc&callbackURL=%2F";

describe("account emails", () => {
  it("brands the confirmation email and carries the action link twice", () => {
    const mail = verificationEmail(URL);
    expect(mail.subject).toContain("Welcome to TarotNice");
    expect(mail.html).toContain("tarotnice");
    expect(mail.html).toContain("https://tarotnice.com/logo/apple-touch-icon.png");
    expect(mail.html).toContain("Confirm my email");
    expect(mail.html.split(URL.replace(/&/g, "&amp;")).length - 1).toBeGreaterThanOrEqual(2);
    expect(mail.html).toContain("support@mailer.tarotnice.com");
    expect(mail.html).toContain("What happens next".toUpperCase().replace("WHAT", "WHAT"));
    expect(mail.text).toContain("Confirm my email");
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("What happens next");
  });

  it("brands the password reset email with its security note", () => {
    const mail = resetPasswordEmail(URL);
    expect(mail.subject).toBe("Reset your TarotNice password");
    expect(mail.html).toContain("Choose a new password");
    expect(mail.html).toContain("can only be used once");
    expect(mail.text).toContain(URL);
  });

  it("escapes the action URL in HTML but not in plain text", () => {
    const mail = verificationEmail("https://x.example/?a=1&b=<2>");
    expect(mail.html).not.toContain("b=<2>");
    expect(mail.html).toContain("b=&lt;2&gt;");
    expect(mail.text).toContain("b=<2>");
  });
});
