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
.auth-card{max-width:440px;margin:2.5rem auto;background:var(--card-face);border:1px solid var(--gold-dim);border-radius:16px;padding:1.75rem}
.auth-card h1{font-size:1.55rem;line-height:1.2;margin:0 0 .5rem}
.auth-card p{line-height:1.5}
.auth-card label{display:block;font-weight:700;margin:1rem 0 .3rem}
.auth-card input{width:100%;box-sizing:border-box;font-size:1rem;padding:.8rem;border:2px solid var(--gold-dim);border-radius:12px;min-height:52px;background:#fff;color:#2e2547}
.auth-card .btn{width:100%;margin-top:1.25rem}
.auth-err{color:#b3261e;min-height:1.4em;margin:.75rem 0 0}
.auth-note{font-size:.92rem}
.auth-alt{margin-top:1.25rem;text-align:center}
.auth-card a.btn{color:var(--on-accent)}
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

function googleButton(ret: string, label: string): string {
  return `<button class="btn btn-outline" id="google" type="button">${escapeHtml(label)}</button>
<script>
document.getElementById("google").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: document.getElementById("return").value || "/" }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.url) { location.href = data.url; return; }
  } catch {}
});
</script>`;
}

export function registerPage(returnTo?: string | null, origin = "", uiLang: UiLang = "en"): string {
  const d = t(uiLang);
  const ret = safeReturnPath(returnTo);
  const inner = `<h1>${escapeHtml(d.createAccountHeading)}</h1>
<p>${escapeHtml(d.guestLine)}</p>
<form id="register-form">
<label for="name">${escapeHtml(d.nameLabel)}</label>
<input id="name" autocomplete="name" required>
<label for="email">${escapeHtml(d.emailLabel)}</label>
<input id="email" type="email" autocomplete="email" required>
<label for="password">${escapeHtml(d.passwordLabel)}</label>
<input id="password" type="password" autocomplete="new-password" minlength="8" required>
${returnField(ret)}
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">${escapeHtml(d.createAccountBtn)}</button>
</form>
<p class="auth-alt">${escapeHtml(d.continueWithGoogle)}</p>
${googleButton(ret, d.continueWithGoogle)}
<p class="auth-alt">${escapeHtml(d.alreadyRegistered)} <a href="/sign-in?return=${encodeURIComponent(ret)}">${escapeHtml(d.signIn)}</a></p>
<script>
document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  err.textContent = "";
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
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
    if (data.user && data.user.emailVerified === false && !data.token) {
      err.style.color = "#146c2e";
      err.textContent = "Account created. Check your email to confirm your address, then sign in.";
      return;
    }
    location.href = ret;
  } catch {
    err.textContent = "Network error. Please try again.";
  }
});
</script>`;
  return shell(`${d.createAccountHeading} \u00b7 TarotNice`, origin, inner, { uiLang });
}

export function signInPage(returnTo?: string | null, origin = "", uiLang: UiLang = "en"): string {
  const d = t(uiLang);
  const ret = safeReturnPath(returnTo);
  const inner = `<h1>${escapeHtml(d.signInHeading)}</h1>
<p>${escapeHtml(d.welcomeBack)}</p>
<form id="signin-form">
<label for="email">${escapeHtml(d.emailLabel)}</label>
<input id="email" type="email" autocomplete="email" required>
<label for="password">${escapeHtml(d.passwordLabel)}</label>
<input id="password" type="password" autocomplete="current-password" required>
${returnField(ret)}
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">${escapeHtml(d.signIn)}</button>
</form>
<p class="auth-alt">${escapeHtml(d.continueWithGoogle)}</p>
${googleButton(ret, d.continueWithGoogle)}
<p class="auth-alt"><a href="/forgot-password">${escapeHtml(d.forgotPassword)}</a></p>
<p class="auth-alt">${escapeHtml(d.newToTarotNice)} <a href="/register?return=${encodeURIComponent(ret)}">${escapeHtml(d.createAccountBtn)}</a></p>
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
        : (data.message || "Sign-in failed. Check your email and password.");
      return;
    }
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
  const inner = `<h1>${escapeHtml(d.forgotPassword)}</h1>
<p>Enter your account email and we will send you a reset link.</p>
<form id="forgot-form">
<label for="email">${escapeHtml(d.emailLabel)}</label>
<input id="email" type="email" autocomplete="email" required>
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">Send reset link</button>
</form>
<p class="auth-alt"><a href="/sign-in">${escapeHtml(d.signIn)}</a></p>
<script>
document.getElementById("forgot-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  const email = document.getElementById("email").value.trim();
  try {
    const res = await fetch("/api/auth/request-password-reset", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    });
    if (!res.ok) throw new Error("failed");
    err.style.color = "#146c2e";
    err.textContent = "If that email has an account, a reset link is on its way.";
  } catch {
    err.textContent = "Could not send the reset email. Please try again later.";
  }
});
</script>`;
  return shell(`${d.forgotPassword} \u00b7 TarotNice`, origin, inner, { uiLang });
}

export function resetPasswordPage(token: string, origin = "", uiLang: UiLang = "en"): string {
  const inner = `<h1>Choose a new password</h1>
<form id="reset-form">
<label for="password">New password</label>
<input id="password" type="password" autocomplete="new-password" minlength="8" required>
<input type="hidden" id="token" value="${escapeHtml(token)}">
<p class="auth-err" id="err" role="alert"></p>
<button class="btn" type="submit">Save new password</button>
</form>
<script>
document.getElementById("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  const token = document.getElementById("token").value;
  if (!token) { err.textContent = "This reset link is missing its token. Request a new one."; return; }
  try {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: document.getElementById("password").value, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = data.message || "This reset link is invalid or has expired."; return; }
    location.href = "/sign-in";
  } catch {
    err.textContent = "Network error. Please try again.";
  }
});
</script>`;
  return shell("Reset password \u00b7 TarotNice", origin, inner, { uiLang });
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
