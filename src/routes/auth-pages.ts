// Account pages: register, sign in, password reset, account.
// TarotNice is free: registration only saves readings across devices.
// Forms call the Better Auth endpoints in src/lib/auth.ts; the account
// page also offers Google sign-in (links the anonymous user, no data
// loss). Verification/reset mail goes through MailNice once configured.
import { escapeHtml } from "../lib/html";
import { brandHtml, pageShell } from "./shell";
import { t, type UiLang } from "../lib/i18n";

/** Only same-origin absolute paths may be carried through auth forms. */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

const STYLE = `<style>
.auth-card{max-width:440px;margin:2.5rem auto;background:var(--card-face);color:var(--card-ink);border:1px solid var(--gold-dim);border-radius:16px;padding:1.75rem}
.auth-card .auth-or{color:var(--card-ink);opacity:.75}
.auth-card h1{font-size:1.55rem;line-height:1.2;margin:0 0 .5rem}
.auth-card p{line-height:1.5}
.auth-card label{display:block;font-weight:700;margin:1rem 0 .3rem}
.auth-card input{width:100%;box-sizing:border-box;font-size:1rem;padding:.8rem;border:2px solid var(--gold-dim);border-radius:12px;min-height:52px;background:#fff;color:#2e2547}
.pw-row{position:relative}
.pw-row input{padding-right:3rem}
.pw-toggle{position:absolute;right:.4rem;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;background:none;border:0;border-radius:8px;color:#6b6390;cursor:pointer;padding:0}
.pw-toggle svg{width:1.2rem;height:1.2rem}
.auth-card .btn{width:100%;margin-top:1.25rem}
.auth-err{color:#b3261e;min-height:1.4em;margin:.75rem 0 0}
.auth-note{font-size:.92rem}
.auth-alt{margin-top:1.25rem;text-align:center}
.auth-card a.btn{color:var(--on-accent)}
.pw-row{display:flex;gap:.5rem;align-items:center}
.pw-row input{flex:1}
.pw-toggle{white-space:nowrap}
.auth-or{text-align:center;color:var(--muted);margin:1rem 0 .2rem}
.social-btn{width:100%;margin-top:.6rem}
.linklike{background:none;border:none;color:var(--accent);font:inherit;cursor:pointer;text-decoration:underline;padding:0}
</style>`;

function shell(
  title: string,
  origin: string,
  inner: string,
  opts: { signedInArea?: boolean; uiLang?: UiLang } = {},
): string {
  const d = t(opts.uiLang ?? "en");
  // Signed-in areas (the account page) must not offer Sign in again.
  const headerAction = opts.signedInArea
    ? `<a class="btn-outline btn" href="/">${escapeHtml(d.backToHome)}</a>`
    : `<a class="btn-outline btn" href="/sign-in">${escapeHtml(d.signIn)}</a>`;
  return pageShell({
    title,
    lang: opts.uiLang ?? "en",
    origin,
    noindex: true,
    body: `<header class="site-head">${brandHtml()}<span class="head-sp"></span>${headerAction}</header><main class="auth-card">${inner}</main>${STYLE}`,
  });
}

function returnField(ret: string): string {
  return `<input type="hidden" id="return" value="${escapeHtml(ret)}">`;
}

export type SocialOpts = { google?: boolean; line?: boolean };

function socialButton(provider: string, label: string): string {
  return `<button class="btn btn-outline social-btn" data-social="${provider}" type="button">${escapeHtml(label)}</button>`;
}

function socialButtons(opts: SocialOpts, d: ReturnType<typeof t>): string {
  const btns: string[] = [];
  if (opts.google !== false) btns.push(socialButton("google", d.continueWithGoogle));
  if (opts.line) btns.push(socialButton("line", d.continueWithLine));
  if (!btns.length) return "";
  return `${btns.join("\n")}
<p class="auth-or">${escapeHtml(d.orUseEmail)}</p>
<script>
document.querySelectorAll("[data-social]").forEach(function (b) {
  b.addEventListener("click", async function () {
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: b.getAttribute("data-social"), callbackURL: document.getElementById("return").value || "/" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) { location.href = data.url; }
    } catch {}
  });
});
</script>`;
}

const PW_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const PW_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.6 10.6 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-4.94M9.9 4.24A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19M9.88 9.88a3 3 0 1 0 4.24 4.24"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

function pwToggleButton(id: string, d: ReturnType<typeof t>): string {
  return `<button type="button" class="pw-toggle" data-pw-toggle="${id}" data-show="${escapeHtml(d.showPassword)}" data-hide="${escapeHtml(d.hidePassword)}" aria-label="${escapeHtml(d.showPassword)}" aria-pressed="false"><span data-pw-eye aria-hidden="true">${PW_EYE}</span><span data-pw-eye-off aria-hidden="true" hidden>${PW_EYE_OFF}</span></button>`;
}

const PW_TOGGLE = `<script>
document.querySelectorAll("[data-pw-toggle]").forEach(function (b) {
  b.addEventListener("click", function () {
    var input = document.getElementById(b.getAttribute("data-pw-toggle"));
    if (!input) return;
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    b.setAttribute("aria-pressed", show ? "true" : "false");
    b.setAttribute("aria-label", show ? b.getAttribute("data-hide") : b.getAttribute("data-show"));
    var eye = b.querySelector("[data-pw-eye]");
    var eyeOff = b.querySelector("[data-pw-eye-off]");
    if (eye) eye.hidden = show;
    if (eyeOff) eyeOff.hidden = !show;
  });
});
</script>`;

function passwordField(id: string, label: string, d: ReturnType<typeof t>, autocomplete: string): string {
  return `<label for="${id}">${escapeHtml(label)}</label>
<div class="pw-row"><input id="${id}" type="password" autocomplete="${autocomplete}" minlength="8" required>${pwToggleButton(id, d)}</div>
<p class="auth-note">${escapeHtml(d.passwordRule)}</p>`;
}

function passwordOk(v: string): string {
  return `(/[A-Za-z]/.test(${v}) && /[0-9]/.test(${v}) && ${v}.length >= 8)`;
}

export function registerPage(returnTo?: string | null, origin = "", uiLang: UiLang = "en", social: SocialOpts = {}): string {
  const d = t(uiLang);
  const ret = safeReturnPath(returnTo);
  const inner = `<h1>${escapeHtml(d.createAccountHeading)}</h1>
<p>${escapeHtml(d.registerBenefit)}</p>
<div class="invite-code-box" id="invite-box">
<p class="invite-applied" id="invite-applied" hidden></p>
<p class="invite-ask" id="invite-change-row" hidden><button type="button" class="linklike" id="invite-change">${escapeHtml(d.changeCode)}</button></p>
<p class="invite-ask"><button type="button" class="linklike" id="invite-toggle">${escapeHtml(d.haveInviteCode)}</button></p>
<div id="invite-fields" hidden>
<label for="invite-code">${escapeHtml(d.inviteCodeOptional)}</label>
<input id="invite-code" maxlength="11" autocomplete="off" placeholder="NICE-XXXX" style="text-transform:uppercase">
<button class="btn btn-outline" id="invite-apply" type="button">${escapeHtml(d.applyCode)}</button>
<p class="auth-err" id="invite-err" role="alert"></p>
</div>
</div>
${socialButtons(social, d)}
<form id="register-form">
<label for="name">${escapeHtml(d.nicknameField)}</label>
<input id="name" autocomplete="name" required>
<p class="auth-note">${escapeHtml(d.nicknameHint)}</p>
<label for="email">${escapeHtml(d.emailLabel)}</label>
<input id="email" type="email" autocomplete="email" required>
${passwordField("password", d.passwordLabel, d, "new-password")}
${returnField(ret)}
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">${escapeHtml(d.createAccountBtn)}</button>
</form>
<p class="auth-note">${escapeHtml(d.agreePrefix)}<a href="/terms" target="_blank" rel="noopener">${escapeHtml(d.terms)}</a>${escapeHtml(d.agreeAnd)}<a href="/privacy" target="_blank" rel="noopener">${escapeHtml(d.privacy)}</a>${escapeHtml(d.agreeSuffix)}</p>
${PW_TOGGLE}
<script>
(function () {
  var appliedCode = null;
  var appliedName = null;
  function refCode() {
    try {
      var m = document.cookie.match(/(?:^|; )tarotnice_ref=([^;]*)/);
      if (!m) return null;
      var v = decodeURIComponent(m[1]);
      return v || null;
    } catch (e) { return null; }
  }
  function showApplied(code, name) {
    var box = document.getElementById("invite-applied");
    box.hidden = false;
    box.textContent = ${JSON.stringify(d.inviteCodeApplied)}.replace("{code}", code) + (name ? " · " + name : "");
    document.getElementById("invite-fields").hidden = true;
    document.getElementById("invite-toggle").hidden = true;
    document.getElementById("invite-change-row").hidden = false;
  }
  document.getElementById("invite-change").addEventListener("click", function () {
    appliedCode = null;
    document.getElementById("invite-applied").hidden = true;
    document.getElementById("invite-change-row").hidden = true;
    document.getElementById("invite-fields").hidden = false;
    document.getElementById("invite-code").value = "";
  });
  document.getElementById("invite-toggle").addEventListener("click", function () {
    document.getElementById("invite-fields").hidden = false;
    document.getElementById("invite-toggle").hidden = true;
  });
  // Saved invite from /r/NICE-XXXX or ?ref=: the cookie holds inv:<id>;
  // the code itself arrives as ?invited=NICE-XXXX from the redirect, or
  // stays server-side — show the applied state when we know the code.
  var qs = new URLSearchParams(location.search);
  var fromLink = qs.get("invited");
  if (fromLink && /^NICE-[A-Z0-9]{4}$/i.test(fromLink)) { appliedCode = fromLink.toUpperCase(); showApplied(appliedCode, null); }
  document.getElementById("invite-apply").addEventListener("click", async function () {
    var code = document.getElementById("invite-code").value.trim().toUpperCase();
    var err = document.getElementById("invite-err");
    err.textContent = "";
    if (!/^NICE-[A-Z0-9]{4}$/.test(code)) { err.textContent = ${JSON.stringify(d.codeUnknown)}; return; }
    try {
      var res = await fetch("/api/me/invite/lookup?code=" + encodeURIComponent(code), { credentials: "include" });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.owner) { err.textContent = ${JSON.stringify(d.codeUnknown)}; return; }
      appliedCode = code;
      showApplied(code, data.name || null);
    } catch (e) { err.textContent = ${JSON.stringify(d.codeUnknown)}; }
  });
  window.__tarotAppliedCode = function () { return appliedCode; };
})();
</script>
<p class="auth-alt">${escapeHtml(d.alreadyRegistered)} <a href="/sign-in?return=${encodeURIComponent(ret)}">${escapeHtml(d.signIn)}</a></p>
<script>
document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  err.textContent = "";
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!${passwordOk("password")}) { err.textContent = ${JSON.stringify(d.passwordRule)}; return; }
  const ret = document.getElementById("return").value || "/";
  try {
    const res = await fetch("/api/auth/sign-up/email", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, callbackURL: ret }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      err.textContent = data.message || "Could not create the account. Check your details and try again.";
      return;
    }
    // Seed the nickname the readings will use.
    try {
      await fetch("/api/me/prefs", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: name }),
      });
    } catch {}
    if (data.user && data.user.emailVerified === false && !data.token) {
      // No session until the email is confirmed: keep the applied
      // invite so the sign-in page can redeem it after verification.
      try {
        var pendingCode = window.__tarotAppliedCode ? window.__tarotAppliedCode() : null;
        if (pendingCode) localStorage.setItem("tarotnice:pendingInvite", pendingCode);
      } catch {}
      err.style.color = "#146c2e";
      err.textContent = "Account created. Check your email to confirm your address, then sign in.";
      return;
    }
    // Redeem the applied/saved invite (joining bonus) before leaving.
    try {
      var code = window.__tarotAppliedCode ? window.__tarotAppliedCode() : null;
      await fetch("/api/me/invite", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(code ? { code } : {}),
      });
    } catch {}
    location.href = ret;
  } catch {
    err.textContent = "Network error. Please try again.";
  }
});
</script>`;
  return shell(`${d.createAccountHeading} \u00b7 TarotNice`, origin, inner, { uiLang });
}

export function signInPage(returnTo?: string | null, origin = "", uiLang: UiLang = "en", social: SocialOpts = {}): string {
  const d = t(uiLang);
  const ret = safeReturnPath(returnTo);
  const inner = `<h1>${escapeHtml(d.welcomeBack)}</h1>
<p>${escapeHtml(d.moveGuestLine)}</p>
${socialButtons(social, d)}
<form id="signin-form">
<label for="email">${escapeHtml(d.emailLabel)}</label>
<input id="email" type="email" autocomplete="email" required>
<label for="password">${escapeHtml(d.passwordLabel)} <a class="auth-forgot" href="/forgot-password">${escapeHtml(d.forgotPassword)}</a></label>
<div class="pw-row"><input id="password" type="password" autocomplete="current-password" required>${pwToggleButton("password", d)}</div>
${returnField(ret)}
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">${escapeHtml(d.signIn)}</button>
</form>
${PW_TOGGLE}
<p class="auth-alt">${escapeHtml(d.newToTarotNice)} <a href="/register?return=${encodeURIComponent(ret)}">${escapeHtml(d.createAccountHeading)}</a></p>
<script>
document.getElementById("signin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  err.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const ret = document.getElementById("return").value || "/";
  try {
    const res = await fetch("/api/auth/sign-in/email", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, callbackURL: ret }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      err.textContent = data.code === "EMAIL_NOT_VERIFIED"
        ? "Please confirm your email first \u2014 check your inbox for the confirmation link."
        : ${JSON.stringify(d.signInError)};
      return;
    }
    // Redeem an invite kept from a verification-first sign-up.
    try {
      var pending = localStorage.getItem("tarotnice:pendingInvite");
      if (pending) {
        await fetch("/api/me/invite", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pending }),
        });
        localStorage.removeItem("tarotnice:pendingInvite");
      }
    } catch {}
    location.href = ret;
  } catch {
    err.textContent = "Network error. Please try again.";
  }
});
</script>`;
  return shell(`${d.signInHeading} \u00b7 TarotNice`, origin, inner, { uiLang });
}

export function forgotPasswordPage(origin = "", uiLang: UiLang = "en"): string {
  const d = t(uiLang);
  const inner = `<h1>${escapeHtml(d.forgotHeading)}</h1>
<p>${escapeHtml(d.forgotLede)}</p>
<form id="forgot-form">
<label for="email">${escapeHtml(d.emailLabel)}</label>
<input id="email" type="email" autocomplete="email" required>
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">${escapeHtml(d.sendReset)}</button>
</form>
<div id="sent-panel" hidden>
<h2>${escapeHtml(d.checkInbox)}</h2>
<p>${escapeHtml(d.resetSentLine)}</p>
<p><button class="btn btn-outline" id="send-again" type="button">${escapeHtml(d.sendAgain)}</button></p>
</div>
<p class="auth-alt"><a href="/sign-in">${escapeHtml(d.backToSignIn)}</a></p>
<script>
async function sendReset() {
  const err = document.getElementById("err");
  const email = document.getElementById("email").value.trim();
  try {
    const res = await fetch("/api/auth/request-password-reset", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    });
    if (!res.ok) throw new Error("failed");
    document.getElementById("sent-panel").hidden = false;
    err.textContent = "";
  } catch {
    err.textContent = "Could not send the reset email. Please try again later.";
  }
}
document.getElementById("forgot-form").addEventListener("submit", async (e) => { e.preventDefault(); await sendReset(); });
document.getElementById("send-again").addEventListener("click", sendReset);
</script>`;
  return shell(`${d.forgotHeading} \u00b7 TarotNice`, origin, inner, { uiLang });
}

export function resetPasswordPage(token: string, origin = "", uiLang: UiLang = "en"): string {
  const d = t(uiLang);
  const inner = !token
    ? `<h1>${escapeHtml(d.resetHeading)}</h1>
<p>${escapeHtml(d.linkExpired)}</p>
<p><a class="btn" href="/forgot-password">${escapeHtml(d.sendReset)}</a></p>
<p class="auth-alt"><a href="/sign-in">${escapeHtml(d.backToSignIn)}</a></p>`
    : `<h1>${escapeHtml(d.resetHeading)}</h1>
<form id="reset-form">
${passwordField("password", d.newPassword, d, "new-password")}
<label for="password2">${escapeHtml(d.confirmPassword)}</label>
<input id="password2" type="password" autocomplete="new-password" minlength="8" required>
<input type="hidden" id="token" value="${escapeHtml(token)}">
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">${escapeHtml(d.saveNewPassword)}</button>
</form>
<div id="expired-panel" hidden>
<p>${escapeHtml(d.linkExpired)}</p>
<p><a class="btn" href="/forgot-password">${escapeHtml(d.sendReset)}</a></p>
</div>
${PW_TOGGLE}
<script>
document.getElementById("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  const token = document.getElementById("token").value;
  const pw = document.getElementById("password").value;
  if (!${passwordOk("pw")}) { err.textContent = ${JSON.stringify(d.passwordRule)}; return; }
  if (pw !== document.getElementById("password2").value) { err.textContent = ${JSON.stringify(d.passwordsMismatch)}; return; }
  try {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: pw, token }),
    });
    if (!res.ok) { document.getElementById("expired-panel").hidden = false; err.textContent = ${JSON.stringify(d.linkExpired)}; return; }
    location.href = "/sign-in";
  } catch {
    err.textContent = "Network error. Please try again.";
  }
});
</script>`;
  return shell(`${d.resetHeading} \u00b7 TarotNice`, origin, inner, { uiLang });
}

export function accountPage(
  origin = "",
  email = "",
  uiLang: UiLang = "en",
  prefs: { lang: string; theme: string | null; nickname: string | null } = { lang: "en", theme: null, nickname: null },
): string {
  const d = t(uiLang);
  const inner = `<h1>${escapeHtml(d.yourAccount)}</h1>
<p class="auth-note" id="who">${email ? escapeHtml(fmt_signedIn(d, email)) : ""}</p>
<p class="auth-note">${escapeHtml(d.saveReadingsLine)}</p>
<p><a class="btn btn-outline" href="/api/auth/sign-in/social?provider=google">${escapeHtml(d.continueWithGoogle)}</a></p>
<h2>${escapeHtml(d.accountPrefs)}</h2>
<form id="prefs-form">
<label for="p-lang">${escapeHtml(d.appLanguage)}</label>
<select id="p-lang"><option value="th"${prefs.lang === "th" ? " selected" : ""}>&#3652;&#3607;&#3618;</option><option value="en"${prefs.lang === "en" ? " selected" : ""}>English</option></select>
<label for="p-theme">${escapeHtml(d.themeLabel)}</label>
<select id="p-theme"><option value=""${!prefs.theme ? " selected" : ""}>${escapeHtml(d.themeAuto)}</option><option value="day"${prefs.theme === "day" ? " selected" : ""}>Day</option><option value="night"${prefs.theme === "night" ? " selected" : ""}>Night</option></select>
<label for="p-nick">${escapeHtml(d.nicknameLabel)}</label>
<input id="p-nick" maxlength="40" value="${escapeHtml(prefs.nickname ?? "")}">
<p class="auth-err" id="p-err" role="alert"></p>
<button class="btn" type="submit">${escapeHtml(d.savePrefs)}</button>
</form>
<button class="btn" id="signout" type="button">${escapeHtml(d.signOut)}</button>
<hr>
<button class="btn btn-danger" id="deldata" type="button">${escapeHtml(d.deleteData)}</button>
<p><a class="btn btn-back" href="/">&larr; ${escapeHtml(d.backToHome)}</a></p>
<script>
(async () => {
  const who = document.getElementById("who");
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) { location.href = "/sign-in?return=/account"; return; }
    const { user } = await res.json();
    who.textContent = user.isAnonymous ? ${JSON.stringify(d.guestLine)} : (${JSON.stringify(d.signedInAs)}).replace("{email}", user.email || "");
  } catch { who.textContent = "Could not load your account."; }
  document.getElementById("signout").addEventListener("click", async () => {
    try { await fetch("/api/auth/sign-out", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch {}
    location.href = "/";
  });
  document.getElementById("prefs-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("p-err");
    err.textContent = "";
    const theme = document.getElementById("p-theme").value || null;
    try {
      const res = await fetch("/api/me/prefs", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: document.getElementById("p-lang").value, theme, nickname: document.getElementById("p-nick").value }) });
      if (!res.ok) throw new Error("save failed");
      err.style.color = "#146c2e";
      err.textContent = ${JSON.stringify(d.prefsSaved)};
      if (theme) { try { localStorage.setItem("tarotnice:mode", theme); document.documentElement.setAttribute("data-mode", theme); } catch {} }
      setTimeout(() => location.reload(), 600);
    } catch { err.textContent = "Could not save. Please try again."; }
  });
  document.getElementById("deldata").addEventListener("click", async () => {
    if (!confirm(${JSON.stringify(d.deleteDataConfirm)})) return;
    try { await fetch("/api/me", { method: "DELETE", credentials: "include" }); } catch {}
    try {
      for (const k of ["tarotnice:days","tarotnice:quota","tarotnice:pending","tarotnice:mode","tarotnice_ref"]) localStorage.removeItem(k);
    } catch {}
    document.body.innerHTML = "<main class='auth-card'><p>" + ${JSON.stringify(d.deleteDataDone)} + "</p><p><a href='/'>TarotNice</a></p></main>";
  });
})();
</script>`;
  return shell(`${d.yourAccount} \u00b7 TarotNice`, origin, inner, { signedInArea: true, uiLang });
}

function fmt_signedIn(d: { signedInAs: string }, email: string): string {
  return d.signedInAs.replace("{email}", email);
}
