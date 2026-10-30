// Transactional email via MailNice (api.mailnice.net), mirroring the
// Blognice implementation (blognice/src/mailnice.ts): POST
// /api/v1/send/message with an X-Server-API-Key server key.
// Until MAILNICE_API_KEY / EMAIL_FROM are configured, no mail is sent
// and email verification stays off, so sign-up works end to end before
// MailNice exists. Setting the two secrets activates verification and
// password reset with no code change (see src/lib/auth.ts).
export type EmailEnv = {
  MAILNICE_API_KEY?: string;
  EMAIL_FROM?: string;
};

export const MAILNICE_SEND_URL = "https://api.mailnice.net/api/v1/send/message";

export function mailniceConfigured(env: EmailEnv | undefined): boolean {
  return Boolean(env?.MAILNICE_API_KEY && env?.EMAIL_FROM);
}

/** Send one message through MailNice. Returns false (and logs) on any
 *  failure or when MailNice is unconfigured \u2014 callers must not treat a
 *  false result as proof the address is invalid. */
export async function sendEmail(
  env: EmailEnv | undefined,
  message: { to: string; subject: string; text: string; html: string },
): Promise<boolean> {
  if (!mailniceConfigured(env)) {
    console.warn(`email skipped (MailNice not configured): ${message.subject}`);
    return false;
  }
  try {
    const res = await fetch(MAILNICE_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Server-API-Key": env!.MAILNICE_API_KEY!,
      },
      body: JSON.stringify({
        to: [message.to],
        from: env!.EMAIL_FROM!,
        subject: message.subject,
        plain_body: message.text,
        html_body: message.html,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      error?: string;
      message?: string;
    } | null;
    if (!res.ok || body?.status === "error") {
      console.error(`MailNice send failed: ${body?.error || body?.message || `HTTP ${res.status}`}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`MailNice send failed: ${(err as Error).message}`);
    return false;
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Branded transactional layout. Table-based with inline styles so it
 * renders consistently in Gmail, Outlook, and Apple Mail; the logo and
 * colours match tarotnice.com day palette (ink #2e2547, accent #4a3d78, gold #b0832f, bg #f6f1fa).
 * Every account email goes through this shell so verification and
 * password reset feel like one product.
 */
function mailShell(opts: {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  steps?: string[];
  url: string;
  cta: string;
  reassurance: string;
  /** Thai rendering of the same message (every email is bilingual). */
  th: { title: string; intro: string; steps?: string[]; reassurance: string };
  ctaTh: string;
}): { text: string; html: string } {
  const url = esc(opts.url);
  const stepsText = opts.steps?.length
    ? `\n\nWhat happens next\n${opts.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";
  const stepsHtml = opts.steps?.length
    ? `<tr><td style="padding:0 40px 8px;font-family:Arial,Helvetica,sans-serif">
         <p style="margin:0 0 10px;font-size:13px;font-weight:bold;letter-spacing:1.2px;color:#76698f">WHAT HAPPENS NEXT</p>
         ${opts.steps
           .map(
             (s, i) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px"><tr>
               <td width="26" valign="top"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#b0832f;color:#fffaf2;font-size:12px;font-weight:bold;line-height:22px;text-align:center">${i + 1}</span></td>
               <td style="font-size:14px;line-height:21px;color:#2e2547">${esc(s)}</td></tr></table>`,
           )
           .join("")}
       </td></tr>`
    : "";
  const stepsHtmlTh = opts.th.steps?.length
    ? `<tr><td style="padding:0 40px 8px;font-family:Arial,Helvetica,sans-serif">
         <p style="margin:0 0 10px;font-size:13px;font-weight:bold;letter-spacing:1.2px;color:#76698f">WHAT HAPPENS NEXT \u00b7 \u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e15\u0e48\u0e2d\u0e44\u0e1b</p>
         ${opts.th.steps
           .map(
             (step, i) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px"><tr>
               <td width="26" valign="top"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#b0832f;color:#fffaf2;font-size:12px;font-weight:bold;line-height:22px;text-align:center">${i + 1}</span></td>
               <td style="font-size:14px;line-height:21px;color:#2e2547">${esc(step)}</td></tr></table>`,
           )
           .join("")}
       </td></tr>`
    : "";
  const thBlock = `<tr><td style="padding:26px 40px 6px;border-top:1px solid #ded5f2;font-family:Arial,Helvetica,sans-serif">
    <h2 style="margin:0 0 14px;font-size:24px;line-height:32px;color:#2e2547">${esc(opts.th.title)}</h2>
    <p style="margin:0;font-size:16px;line-height:25px;color:#2e2547">${esc(opts.th.intro)}</p>
  </td></tr>
  ${stepsHtmlTh}`;
  const text = `${opts.title}

${opts.intro}${stepsText}

${opts.cta}: ${opts.url}

If the button does not work, copy and paste the link above into your browser.

${opts.reassurance}

${opts.th.title}

${opts.th.intro}${opts.th.steps?.length ? `\n\n${opts.th.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}` : ""}

${opts.th.reassurance}

Questions? Reply to this email or write to support@mailer.tarotnice.com. / \u0e21\u0e35\u0e04\u0e33\u0e16\u0e32\u0e21? \u0e15\u0e2d\u0e1a\u0e01\u0e25\u0e31\u0e1a\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e19\u0e35\u0e49\u0e2b\u0e23\u0e37\u0e2d\u0e40\u0e02\u0e35\u0e22\u0e19\u0e21\u0e32\u0e17\u0e35\u0e48 support@mailer.tarotnice.com.

\u2014 The TarotNice team
https://tarotnice.com`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)} \u00b7 TarotNice</title></head>
<body style="margin:0;padding:0;background:#f6f1fa">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f1fa">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #ded5f2">
  <tr><td style="background:#2e2547;padding:26px 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><img src="https://tarotnice.com/mascot/ngern-head-mark.png" width="42" height="42" alt="TarotNice" style="display:block;border-radius:10px"></td>
      <td valign="middle" style="padding-left:12px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#ffffff">TarotNice</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:5px;background:#b0832f;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:36px 40px 6px;font-family:Arial,Helvetica,sans-serif">
    <p style="margin:0 0 10px;font-size:12px;font-weight:bold;letter-spacing:1.6px;color:#4a3d78">${esc(opts.eyebrow)}</p>
    <h1 style="margin:0 0 14px;font-size:27px;line-height:34px;color:#2e2547">${esc(opts.title)}</h1>
    <p style="margin:0;font-size:16px;line-height:25px;color:#2e2547">${esc(opts.intro)}</p>
  </td></tr>
  <tr><td style="padding:24px 40px 6px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-radius:12px;background:#4a3d78">
        <a href="${url}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">${esc(opts.cta)} \u00b7 ${esc(opts.ctaTh)} &rarr;</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 40px 26px;font-family:Arial,Helvetica,sans-serif">
    <p style="margin:0;font-size:13px;line-height:20px;color:#76698f">Button not working? Copy and paste this link into your browser: / \u0e1b\u0e38\u0e48\u0e21\u0e01\u0e14\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49? \u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e19\u0e35\u0e49\u0e44\u0e1b\u0e27\u0e32\u0e07\u0e43\u0e19\u0e40\u0e1a\u0e23\u0e32\u0e27\u0e4c\u0e40\u0e0b\u0e2d\u0e23\u0e4c:</p>
    <p style="margin:6px 0 0;font-size:13px;line-height:20px;word-break:break-all"><a href="${url}" target="_blank" style="color:#4a3d78">${url}</a></p>
  </td></tr>
  ${stepsHtml}
  ${thBlock}
  <tr><td style="padding:10px 40px 30px;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffaf0;border-radius:12px"><tr>
      <td style="padding:16px 20px;font-size:13px;line-height:20px;color:#76698f">${esc(opts.reassurance)}<br><br>${esc(opts.th.reassurance)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#f6f1fa;border-top:1px solid #ded5f2;padding:24px 40px;font-family:Arial,Helvetica,sans-serif">
    <p style="margin:0 0 6px;font-size:13px;line-height:20px;color:#76698f">Questions? Reply to this email or write to <a href="mailto:support@mailer.tarotnice.com" style="color:#4a3d78;text-decoration:none">support@mailer.tarotnice.com</a>. / \u0e21\u0e35\u0e04\u0e33\u0e16\u0e32\u0e21? \u0e15\u0e2d\u0e1a\u0e01\u0e25\u0e31\u0e1a\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e19\u0e35\u0e49\u0e2b\u0e23\u0e37\u0e2d\u0e40\u0e02\u0e35\u0e22\u0e19\u0e21\u0e32\u0e17\u0e35\u0e48 <a href="mailto:support@mailer.tarotnice.com" style="color:#4a3d78;text-decoration:none">support@mailer.tarotnice.com</a>.</p>
    <p style="margin:0;font-size:12px;line-height:18px;color:#76698f">You are receiving this because an account was created or a password reset was requested at <a href="https://tarotnice.com" style="color:#76698f">tarotnice.com</a>.</p>
    <p style="margin:10px 0 0;font-size:13px;color:#2e2547">&mdash; The TarotNice team</p>
  </td></tr>
</table>
<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#76698f">TarotNice &middot; Free tarot readings, every day</p>
</td></tr></table>
</body></html>`;
  return { text, html };
}

export function verificationEmail(url: string): { subject: string; text: string; html: string } {
  const { text, html } = mailShell({
    preheader: "Confirm your email to finish creating your free TarotNice account.",
    eyebrow: "WELCOME TO TAROTNICE",
    title: "Confirm your email address",
    intro:
      "Thanks for joining TarotNice. Your free account is one click away \u2014 confirm this email address and your readings will be saved to your account on any device.",
    steps: [
      "Click the button to confirm this email address.",
      "Sign in with the password you just chose.",
      "Come back any time \u2014 your readings save to your account on any device.",
    ],
    url,
    cta: "Confirm my email",
    ctaTh: "\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25",
    reassurance:
      "This confirmation link expires after a short time for your security. If it no longer works, just sign up or sign in again and we will send you a fresh one. If you did not create a TarotNice account, you can safely ignore this email \u2014 nothing will be activated.",
    th: {
      title: "\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
      intro: "\u0e02\u0e2d\u0e1a\u0e04\u0e38\u0e13\u0e17\u0e35\u0e48\u0e2a\u0e21\u0e31\u0e04\u0e23 TarotNice \u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e2d\u0e35\u0e01\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e04\u0e25\u0e34\u0e01\u0e40\u0e14\u0e35\u0e22\u0e27 \u2014 \u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e19\u0e35\u0e49 \u0e41\u0e25\u0e49\u0e27\u0e01\u0e32\u0e23\u0e14\u0e39\u0e14\u0e27\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e08\u0e30\u0e16\u0e39\u0e01\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e44\u0e27\u0e49\u0e43\u0e19\u0e1a\u0e31\u0e0d\u0e0a\u0e35 \u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49\u0e17\u0e38\u0e01\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c",
      steps: ["\u0e04\u0e25\u0e34\u0e01\u0e1b\u0e38\u0e48\u0e21\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e19\u0e35\u0e49", "\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a\u0e14\u0e49\u0e27\u0e22\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e17\u0e35\u0e48\u0e15\u0e31\u0e49\u0e07\u0e44\u0e27\u0e49", "\u0e01\u0e25\u0e31\u0e1a\u0e21\u0e32\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e44\u0e2b\u0e23\u0e48\u0e01\u0e47\u0e44\u0e14\u0e49 \u0e01\u0e32\u0e23\u0e14\u0e39\u0e14\u0e27\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e17\u0e38\u0e01\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c"],
      reassurance: "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e19\u0e35\u0e49\u0e08\u0e30\u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38\u0e43\u0e19\u0e2d\u0e35\u0e01\u0e44\u0e21\u0e48\u0e19\u0e32\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1b\u0e25\u0e2d\u0e14\u0e20\u0e31\u0e22 \u0e2b\u0e32\u0e01\u0e43\u0e0a\u0e49\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e41\u0e25\u0e49\u0e27 \u0e43\u0e2b\u0e49\u0e2a\u0e21\u0e31\u0e04\u0e23\u0e2b\u0e23\u0e37\u0e2d\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07 \u0e40\u0e23\u0e32\u0e08\u0e30\u0e2a\u0e48\u0e07\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e43\u0e2b\u0e21\u0e48\u0e43\u0e2b\u0e49 \u0e2b\u0e32\u0e01\u0e04\u0e38\u0e13\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35 TarotNice \u0e02\u0e49\u0e32\u0e21\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e19\u0e35\u0e49\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22 \u0e08\u0e30\u0e44\u0e21\u0e48\u0e21\u0e35\u0e2d\u0e30\u0e44\u0e23\u0e16\u0e39\u0e01\u0e40\u0e1b\u0e34\u0e14\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19",
    },
  });
  return { subject: "Welcome to TarotNice \u2014 please confirm your email \u00b7 \u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e2d\u0e35\u0e40\u0e21\u0e25", text, html };
}

export function resetPasswordEmail(url: string): { subject: string; text: string; html: string } {
  const { text, html } = mailShell({
    preheader: "Reset your TarotNice password.",
    eyebrow: "PASSWORD RESET",
    title: "Reset your password",
    intro:
      "We received a request to reset the password on your TarotNice account. Choose a new one and you will be back to your cards in under a minute.",
    url,
    cta: "Choose a new password",
    ctaTh: "\u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48",
    reassurance:
      "This reset link expires after a short time and can only be used once. If you did not ask to reset your password, ignore this email \u2014 your current password stays exactly as it is, and no one can change it without this link.",
    th: {
      title: "\u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48",
      intro: "\u0e40\u0e23\u0e32\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e04\u0e33\u0e02\u0e2d\u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e1a\u0e31\u0e0d\u0e0a\u0e35 TarotNice \u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13 \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e41\u0e25\u0e49\u0e27\u0e01\u0e25\u0e31\u0e1a\u0e44\u0e1b\u0e14\u0e39\u0e14\u0e27\u0e07\u0e15\u0e48\u0e2d\u0e44\u0e14\u0e49\u0e43\u0e19\u0e44\u0e21\u0e48\u0e16\u0e36\u0e07\u0e19\u0e32\u0e17\u0e35",
      reassurance: "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e19\u0e35\u0e49\u0e08\u0e30\u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38\u0e43\u0e19\u0e2d\u0e35\u0e01\u0e44\u0e21\u0e48\u0e19\u0e32\u0e19\u0e41\u0e25\u0e30\u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e04\u0e23\u0e31\u0e49\u0e07\u0e40\u0e14\u0e35\u0e22\u0e27 \u0e2b\u0e32\u0e01\u0e04\u0e38\u0e13\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e02\u0e2d\u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48 \u0e02\u0e49\u0e32\u0e21\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e19\u0e35\u0e49\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22 \u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e40\u0e14\u0e34\u0e21\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e22\u0e31\u0e07\u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49\u0e40\u0e2b\u0e21\u0e37\u0e2d\u0e19\u0e40\u0e14\u0e34\u0e21",
    },
  });
  return { subject: "Reset your TarotNice password \u00b7 \u0e15\u0e31\u0e49\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48", text, html };
}
