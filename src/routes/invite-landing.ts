// Invite link landing (/r/NICE-XXXX): the written spec is the source
// of truth for structure and copy; the design files set the visual
// language. Guest = sign-up card (no ask flow); signed-in = note card;
// the inviter opening their own link = their share view.
import { escapeHtml } from "../lib/html";
import { brandHtml, pageShell } from "./shell";
import { t, type UiLang } from "../lib/i18n";
import { INVITE_REF_COOKIE_DAYS } from "../lib/invite";
import { socialButtons, type SocialOpts } from "./auth-pages";

export type InviteLandingState = "guest" | "member" | "own";

const GEM = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h11l4.5 6-10 12L2 9z" fill="#8b6fe0"/><path d="M2 9h20l-10 12z" fill="#6a4fc9"/><path d="M8.5 9L12 3l3.5 6z" fill="#b9a5f5"/><path d="M12 21L8.5 9h7z" fill="#7b5cd6"/></svg>`;
const CLOCK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b0832f" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

const STYLE = `<style>
.inv-wrap{min-height:100%;display:flex;flex-direction:column}
.inv-head{width:100%;max-width:960px;margin:0 auto;padding:12px 16px;box-sizing:border-box;display:flex;align-items:center;gap:8px}
.inv-signin{margin-left:auto;display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border:1.5px solid #cdb27a;border-radius:999px;background:#fffaf0;color:#4a3d78;text-decoration:none;font-weight:600}
.inv-user{margin-left:auto;width:38px;height:38px;border-radius:999px;background:#4a3d78;color:#fffaf2;display:inline-flex;align-items:center;justify-content:center;font-weight:600;text-decoration:none}
.inv-main{flex:1;width:100%;box-sizing:border-box;padding:8px 16px 48px}
.inv-card{max-width:440px;margin:16px auto 0;padding:28px 24px;border-radius:20px;background:#fffaf0;border:1px solid #e3d6b8;box-shadow:0 6px 24px rgba(74,61,120,.08);display:flex;flex-direction:column;gap:16px;box-sizing:border-box}
.inv-card.own{border:1px dashed #b0832f}
.inv-avatar{align-self:center;width:56px;height:56px;border-radius:999px;background:#4a3d78;color:#fffaf2;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:22px;box-shadow:0 0 0 4px #f3dca6}
.inv-card h1{margin:0;font-size:24px;line-height:1.35;font-weight:600;color:#4a3d78;text-align:center;font-family:"Cormorant Garamond","IBM Plex Sans Thai",serif}
.inv-card h1 .nowrap{white-space:nowrap}
.inv-sub{margin:0;font-size:15px;line-height:1.55;color:#4a4062;text-align:center}
.inv-box{background:#fff4dc;border:1px solid #e8c98a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
.inv-box .bold{display:flex;gap:8px;align-items:flex-start;font-size:15px;font-weight:600;color:#2e2547;line-height:1.5}
.inv-box .code-line{font-size:14px;color:#4a4062;line-height:1.55}
.inv-box .code-line b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;color:#2e2547}
.inv-tiles{display:flex;align-items:stretch;gap:8px}
.inv-tile{flex:1;background:#fffdf6;border:1px solid #e8c98a;border-radius:12px;padding:8px 4px;text-align:center}
.inv-tile small{display:block;font-size:12px;color:#6b5f85;line-height:1.3}
.inv-tile b{font-size:18px;color:#2e2547}
.inv-tile.total{background:#4a3d78;border-color:#4a3d78}
.inv-tile.total small{color:#f3dca6}
.inv-tile.total b{color:#fffaf2}
.inv-op{align-self:center;font-size:18px;font-weight:700;color:#b0832f}
.inv-card .social-btn{width:100%;height:52px;margin:0;box-sizing:border-box}
.inv-card .social-btn[data-social="line"]{background:#06C755;border-color:#06C755;color:#fff;box-shadow:none}
.inv-card .social-btn[data-social="line"] svg{width:1.5rem;height:auto;flex:none}
.inv-card .line-email-note{background:#eef8f1;border:1px solid #bfe6cc;color:#2e2547;border-radius:12px;padding:.8rem .9rem;font-size:.92rem;line-height:1.5;margin:0}
.inv-card .auth-or{text-align:center;color:#6b5f85;margin:0}
.inv-field{display:flex;flex-direction:column;gap:6px}
.inv-field label{font-weight:600;color:#2e2547}
.inv-field input{height:48px;border:1.5px solid #cdb27a;border-radius:12px;padding:0 14px;font-size:16px;width:100%;box-sizing:border-box;background:#fff;color:#2e2547;font-family:inherit}
.inv-form{display:flex;flex-direction:column;gap:16px;margin:0}
.inv-opt{display:flex;gap:.6rem;align-items:flex-start;cursor:pointer;font-weight:400;color:#2e2547;line-height:1.5}
.inv-opt input{width:22px;height:22px;flex:none;margin:.1rem 0 0;padding:0;accent-color:#4a3d78}
.inv-opt small{display:block;font-weight:400;opacity:.75}
.inv-gold{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;height:52px;padding:0 20px;box-sizing:border-box;border:1px solid #b0832f;border-radius:12px;background:linear-gradient(135deg,#f6e2b0 0%,#e2bf72 100%);color:#2e2547;font-size:16px;font-weight:600;box-shadow:0 4px 14px rgba(176,131,47,.28);cursor:pointer;font-family:inherit;white-space:nowrap}
.inv-gold svg{flex:none}
@media(max-width:400px){.inv-gold{font-size:13px;gap:6px;padding:0 8px}}
.inv-err{color:#b3261e;min-height:1.4em;margin:0;font-size:.95rem;line-height:1.5}
.inv-note{font-size:13px;color:#6b5f85;text-align:center;margin:0;line-height:1.55}
.inv-alt{margin:0;text-align:center;color:#4a4062}
.inv-start{width:100%;box-sizing:border-box}
.inv-linkbox{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:#f7f1e3;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#2e2547;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.inv-row{display:flex;flex-wrap:wrap;gap:10px}
.inv-row .btn{flex:1 1 160px;box-sizing:border-box}
.inv-line-share{background:#06c755 !important;border-color:#06c755 !important;color:#fff !important}
.inv-stats{align-self:center;font-size:14px;font-weight:600}
@media(max-width:480px){.inv-card{margin-top:8px}.inv-tiles{gap:5px}.inv-tile small{font-size:11px}}
</style>`;

type Copy = {
  titlePre: string; titleTail: string; sub: string;
  boxBoldPre: string; boxBoldPost: string;
  codePre: string; codeMid: string; codePost: string;
  tile1: string; tile2: string; tile3: string; gold: string;
  memberNote: string; startMember: string;
  ownTitle: string; ownSub: string;
  shareLine: string; copyLink: string; copied: string; seeStats: string;
};

function copy(ui: UiLang): Copy {
  if (ui === "th") {
    return {
      titlePre: " \u0e0a\u0e27\u0e19\u0e04\u0e38\u0e13\u0e21\u0e32\u0e14\u0e39", titleTail: "\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c",
      sub: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35 \u0e41\u0e25\u0e49\u0e27\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1e\u0e48 3 \u0e43\u0e1a\u0e14\u0e49\u0e27\u0e22\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07 \u0e16\u0e32\u0e21\u0e44\u0e14\u0e49\u0e17\u0e38\u0e01\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
      boxBoldPre: "\u0e2a\u0e21\u0e31\u0e04\u0e23\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49 \u0e23\u0e31\u0e1a\u0e42\u0e17\u0e40\u0e04\u0e19\u0e1e\u0e34\u0e40\u0e28\u0e29\u0e08\u0e32\u0e01\u0e42\u0e04\u0e49\u0e14\u0e02\u0e2d\u0e07 ", boxBoldPost: " \u0e2d\u0e35\u0e01 10 \u0e42\u0e17\u0e40\u0e04\u0e19",
      codePre: "\u0e42\u0e04\u0e49\u0e14 ", codeMid: " \u0e40\u0e01\u0e47\u0e1a\u0e44\u0e27\u0e49\u0e1a\u0e19\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49\u0e41\u0e04\u0e48 ", codePost: " \u0e27\u0e31\u0e19 \u0e2a\u0e21\u0e31\u0e04\u0e23\u0e01\u0e48\u0e2d\u0e19\u0e42\u0e04\u0e49\u0e14\u0e2b\u0e32\u0e22",
      tile1: "\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a\u0e2a\u0e21\u0e32\u0e0a\u0e34\u0e01\u0e43\u0e2b\u0e21\u0e48", tile2: "\u0e08\u0e32\u0e01\u0e42\u0e04\u0e49\u0e14\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19", tile3: "\u0e23\u0e31\u0e1a\u0e17\u0e31\u0e19\u0e17\u0e35", gold: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e40\u0e25\u0e22 \u0e23\u0e31\u0e1a 20 \u0e42\u0e17\u0e40\u0e04\u0e19",
      memberNote: "\u0e42\u0e04\u0e49\u0e14\u0e0a\u0e27\u0e19\u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49\u0e01\u0e31\u0e1a\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e43\u0e2b\u0e21\u0e48\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19 \u0e41\u0e15\u0e48\u0e04\u0e38\u0e13\u0e14\u0e39\u0e44\u0e1e\u0e48\u0e44\u0e14\u0e49\u0e15\u0e32\u0e21\u0e1b\u0e01\u0e15\u0e34\u0e14\u0e49\u0e27\u0e22\u0e42\u0e17\u0e40\u0e04\u0e19\u0e17\u0e35\u0e48\u0e21\u0e35\u0e2d\u0e22\u0e39\u0e48", startMember: "\u0e40\u0e23\u0e34\u0e48\u0e21\u0e14\u0e39\u0e44\u0e1e\u0e48",
      ownTitle: "\u0e19\u0e35\u0e48\u0e04\u0e37\u0e2d\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e0a\u0e27\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13", ownSub: "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e17\u0e35\u0e48\u0e40\u0e1b\u0e34\u0e14\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e19\u0e35\u0e49\u0e08\u0e30\u0e40\u0e2b\u0e47\u0e19\u0e04\u0e33\u0e0a\u0e27\u0e19\u0e08\u0e32\u0e01\u0e04\u0e38\u0e13 \u0e41\u0e25\u0e30\u0e04\u0e38\u0e13\u0e44\u0e14\u0e49 +5 \u0e42\u0e17\u0e40\u0e04\u0e19\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e14\u0e39\u0e14\u0e27\u0e07\u0e04\u0e23\u0e31\u0e49\u0e07\u0e41\u0e23\u0e01\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08",
      shareLine: "\u0e41\u0e0a\u0e23\u0e4c\u0e17\u0e32\u0e07 LINE", copyLink: "\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e25\u0e34\u0e07\u0e01\u0e4c", copied: "\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e41\u0e25\u0e49\u0e27!", seeStats: "\u0e14\u0e39\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e17\u0e35\u0e48\u0e0a\u0e27\u0e19\u0e41\u0e25\u0e49\u0e27 \u203a",
    };
  }
  return {
    titlePre: " invited you to a ", titleTail: "tarot reading",
    sub: "Create a free account, then pick 3 cards yourself and ask about anything.",
    boxBoldPre: "Sign up now for 10 extra tokens from ", boxBoldPost: "'s code",
    codePre: "Code ", codeMid: " is kept on this device for ", codePost: " days only. Sign up before it's gone.",
    tile1: "Welcome gift", tile2: "Friend's code", tile3: "Yours now", gold: "Create account now \u2013 get 20 tokens",
    memberNote: "Invite codes are for new accounts only, but you can read as usual with your tokens.",
    startMember: "Start a reading",
    ownTitle: "This is your invite link",
    ownSub: "Friends who open it see your invitation, and you get +5 tokens when they finish their first reading.",
    shareLine: "Share on LINE", copyLink: "Copy link", copied: "Copied!", seeStats: "See friends you invited \u203a",
  };
}

export function inviteLandingPage(opts: {
  ui: UiLang;
  origin: string;
  code: string;
  inviterName: string;
  state: InviteLandingState;
  inviteLink: string;
  social: SocialOpts;
}): string {
  const d = t(opts.ui);
  const c = copy(opts.ui);
  const name = opts.inviterName;
  const initial = ([...name][0] ?? "T").toUpperCase();
  const days = String(INVITE_REF_COOKIE_DAYS);
  const headRight = opts.state === "guest"
    ? `<a class="inv-signin" href="/sign-in?return=/">${escapeHtml(d.signIn)}</a>`
    : `<a class="inv-user" href="/" aria-label="${escapeHtml(d.backToHome)}">${escapeHtml(initial)}</a>`;
  let card = "";
  if (opts.state === "guest") {
    card = `<section class="inv-card" aria-labelledby="inv-title">
<span class="inv-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
<h1 id="inv-title">${escapeHtml(name + c.titlePre)}<span class="nowrap">${escapeHtml(c.titleTail)}</span></h1>
<p class="inv-sub">${escapeHtml(c.sub)}</p>
<div class="inv-box">
<p class="bold" style="margin:0"><span aria-hidden="true">${CLOCK}</span><span>${escapeHtml(c.boxBoldPre + name + c.boxBoldPost)}</span></p>
<p class="code-line" style="margin:0">${escapeHtml(c.codePre)}<b>${escapeHtml(opts.code)}</b>${escapeHtml(c.codeMid + days + c.codePost)}</p>
<div class="inv-tiles">
<div class="inv-tile"><small>${escapeHtml(c.tile1)}</small><b>+10</b></div>
<span class="inv-op" aria-hidden="true">+</span>
<div class="inv-tile"><small>${escapeHtml(c.tile2)}</small><b>+10</b></div>
<span class="inv-op" aria-hidden="true">=</span>
<div class="inv-tile total"><small>${escapeHtml(c.tile3)}</small><b>20</b></div>
</div>
</div>
${socialButtons(opts.social, d)}
<form class="inv-form" id="register-form">
<div class="inv-field"><label for="name">${escapeHtml(d.nicknameField)}</label>
<input id="name" autocomplete="name" required></div>
<div class="inv-field"><label for="email">${escapeHtml(d.emailLabel)}</label>
<input id="email" type="email" autocomplete="email" required></div>
<div class="inv-field"><label for="password">${escapeHtml(d.passwordLabel)}</label>
<input id="password" type="password" autocomplete="new-password" minlength="8" required>
<span class="inv-note" style="text-align:left">${escapeHtml(d.passwordRule)}</span></div>
<label class="inv-opt"><input type="checkbox" id="promo-opt"><span><b>${escapeHtml(d.notifyPromoLabel)}</b><small>${escapeHtml(d.notifyPromoSub)}</small></span></label>
<input type="hidden" id="return" value="/">
<p class="inv-err" id="err" role="alert"></p>
<button class="inv-gold" type="submit">${GEM}<span>${escapeHtml(c.gold)}</span></button>
</form>
<p class="inv-note">${escapeHtml(d.agreePrefix)}<a href="/terms" target="_blank" rel="noopener">${escapeHtml(d.terms)}</a>${escapeHtml(d.agreeAnd)}<a href="/privacy" target="_blank" rel="noopener">${escapeHtml(d.privacy)}</a>${escapeHtml(d.agreeSuffix)}</p>
<p class="inv-alt">${escapeHtml(d.alreadyRegistered)} <a href="/sign-in?return=/">${escapeHtml(d.signIn)}</a></p>
</section>
<script>
(function () {
  var CODE = ${JSON.stringify(opts.code)};
  document.getElementById("register-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = document.getElementById("err");
    err.textContent = "";
    var name = document.getElementById("name").value.trim();
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    if (!(/[A-Za-z]/.test(password) && /[0-9]/.test(password) && password.length >= 8)) { err.textContent = ${JSON.stringify(d.passwordRule)}; return; }
    try {
      var res = await fetch("/api/auth/sign-up/email", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: email, password: password, callbackURL: "/" }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) { err.textContent = data.message || "Could not create the account. Check your details and try again."; return; }
      try {
        await fetch("/api/me/prefs", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: name, notifyPromo: document.getElementById("promo-opt").checked }),
        });
      } catch (x) {}
      if (data.user && data.user.emailVerified === false && !data.token) {
        try { localStorage.setItem("tarotnice:pendingInvite", CODE); } catch (x) {}
        err.style.color = "#146c2e";
        err.textContent = "Account created. Check your email to confirm your address, then sign in.";
        return;
      }
      try {
        await fetch("/api/me/invite", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: CODE }),
        });
      } catch (x) {}
      location.href = "/";
    } catch (x) {
      err.textContent = "Network error. Please try again.";
    }
  });
})();
</script>`;
  } else if (opts.state === "member") {
    card = `<section class="inv-card">
<span class="inv-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
<h1>${escapeHtml(name + c.titlePre)}<span class="nowrap">${escapeHtml(c.titleTail)}</span></h1>
<p class="inv-sub">${escapeHtml(c.memberNote)}</p>
<a class="btn inv-start" href="/">${escapeHtml(c.startMember)}</a>
</section>`;
  } else {
    const msg = fmtInvite(d.inviteMessage, opts.code, opts.inviteLink);
    const lineText = msg.split(opts.inviteLink).join("").trim();
    const lineHref = "https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(opts.inviteLink) +
      (lineText ? "&text=" + encodeURIComponent(lineText) : "");
    card = `<section class="inv-card own">
<h1>${escapeHtml(c.ownTitle)}</h1>
<p class="inv-sub">${escapeHtml(c.ownSub)}</p>
<div class="inv-linkbox">${escapeHtml(opts.inviteLink.replace(/^https?:\/\//, ""))}</div>
<div class="inv-row">
<a class="btn inv-line-share" href="${escapeHtml(lineHref)}" target="_blank" rel="noopener">${escapeHtml(c.shareLine)}</a>
<button class="btn btn-outline" id="inv-copy" type="button">${escapeHtml(c.copyLink)}</button>
</div>
<a class="inv-stats" href="/billing">${escapeHtml(c.seeStats)}</a>
</section>
<script>
(function () {
  var btn = document.getElementById("inv-copy");
  btn.addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(${JSON.stringify(opts.inviteLink)}); btn.textContent = ${JSON.stringify(c.copied)}; } catch (x) {}
  });
})();
</script>`;
  }
  return pageShell({
    title: `TarotNice \u00b7 ${opts.code}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body: `<div class="inv-wrap"><header class="inv-head">${brandHtml()}<span style="flex:1"></span>${headRight}</header><main class="inv-main">${card}</main></div>${STYLE}`,
  });
}

function fmtInvite(template: string, code: string, link: string): string {
  return template.replace("{code}", code).replace("{link}", link);
}
