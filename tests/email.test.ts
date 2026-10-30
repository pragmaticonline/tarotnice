import { describe, expect, it } from "vitest";
import { resetPasswordEmail, verificationEmail } from "../src/lib/email";

const URL = "https://tarotnice.com/api/auth/verify-email?token=abc&callbackURL=%2F";

describe("account emails", () => {
  it("brands the confirmation email and carries the action link twice", () => {
    const mail = verificationEmail(URL);
    expect(mail.subject).toContain("Welcome to TarotNice");
    expect(mail.html).toContain("tarotnice");
    expect(mail.html).toContain("https://tarotnice.com/mascot/ngern-head-mark.png");
    expect(mail.html).not.toContain("/logo/apple-touch-icon.png");
    // TarotNice palette (site.css day: ink #2e2547, accent #4a3d78,
    // gold #b0832f); no nicelingo slogan or blue palette.
    expect(mail.html).not.toContain("See it. Hear it. Say it.");
    expect(mail.html).not.toContain("#1a5feb");
    expect(mail.html).not.toContain("#0e1b3d");
    expect(mail.html).toContain("#4a3d78");
    expect(mail.html).toContain("#b0832f");
    expect(mail.html).toContain("Confirm my email");
    expect(mail.html.split(URL.replace(/&/g, "&amp;")).length - 1).toBeGreaterThanOrEqual(2);
    expect(mail.html).toContain("support@mailer.tarotnice.com");
    expect(mail.html).toContain("What happens next".toUpperCase().replace("WHAT", "WHAT"));
    expect(mail.text).toContain("Confirm my email");
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("What happens next");
  });

  it("includes Thai alongside English in both emails", () => {
    const v = verificationEmail(URL);
    expect(v.subject).toContain("\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25");
    expect(v.html).toContain("\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13");
    expect(v.text).toContain("\u0e02\u0e2d\u0e1a\u0e04\u0e38\u0e13\u0e17\u0e35\u0e48\u0e2a\u0e21\u0e31\u0e04\u0e23 TarotNice");
    expect(v.html).toContain("Confirm my email \u00b7 \u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25");
    const r = resetPasswordEmail(URL);
    expect(r.subject).toContain("\u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48");
    expect(r.html).toContain("\u0e40\u0e23\u0e32\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e04\u0e33\u0e02\u0e2d\u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48");
    expect(r.text).toContain("\u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48");
  });

  it("brands the password reset email with its security note", () => {
    const mail = resetPasswordEmail(URL);
    expect(mail.subject).toContain("Reset your TarotNice password");
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
