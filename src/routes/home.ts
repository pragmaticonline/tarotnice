// Home / draw screen: quota row, daily card block, ask form with
// topic chips, the draw stage (slots + deck mount), and Ngern with
// the speech bubble. The shuffle/fan/pick/flip choreography
// (public/app/draw.js) and the readings API land in M5; this file
// owns the static structure both build on.
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { computeStreak, localDayString } from "../lib/streaks";
import { headerHtml, pageShell, siteFooterHtml } from "./shell";

export type HomeOpts = {
  uiLang?: UiLang;
  origin?: string;
  streakDays?: string[];
};

export type Topic = "love" | "career" | "money" | "health" | "general";

export const TOPICS: { code: Topic; labelKey: "topicLove" | "topicCareer" | "topicMoney" | "topicHealth" | "topicGeneral" }[] = [
  { code: "love", labelKey: "topicLove" },
  { code: "career", labelKey: "topicCareer" },
  { code: "money", labelKey: "topicMoney" },
  { code: "health", labelKey: "topicHealth" },
  { code: "general", labelKey: "topicGeneral" },
];

const CLIENT = `<script>
(function(){
  var form=document.getElementById("ask-form");
  if(!form)return;
  var q=document.getElementById("q");
  var bubble=document.querySelector("#guide .bubble");
  var needMsg=form.getAttribute("data-need")||"";
  form.addEventListener("submit",function(e){
    var v=(q&&q.value||"").trim();
    if(!v){
      e.preventDefault();
      if(q){q.classList.add("need");q.focus();}
      if(bubble&&needMsg)bubble.textContent=needMsg;
    }
  });
  if(q)q.addEventListener("input",function(){q.classList.remove("need");});
})();
</script>`;

function quotaRow(ui: UiLang, remaining: number): string {
  const d = t(ui);
  const pips = [0, 1, 2]
    .map((i) => `<span class="pip${i < remaining ? " on" : ""}" aria-hidden="true"></span>`)
    .join("");
  return `<p class="quota" role="status"><span class="pips">${pips}</span> <span data-quota-label>${escapeHtml(fmt(d.quota, { n: remaining }))}</span></p>`;
}

function topicChips(ui: UiLang): string {
  const d = t(ui);
  return `<div class="topics" role="radiogroup" aria-label="Topic">${TOPICS.map((topic) =>
    `<label class="chip"><input type="radio" name="topic" value="${topic.code}"${topic.code === "general" ? " checked" : ""}><span>${escapeHtml(d[topic.labelKey])}</span></label>`,
  ).join("")}</div>`;
}

export function homePage(opts: HomeOpts = {}): string {
  const ui = opts.uiLang ?? "en";
  const d = t(ui);
  const origin = opts.origin ?? "";
  const streak = computeStreak(opts.streakDays ?? [], localDayString());
  const head = headerHtml({ ui, streak, path: "/" });
  const body = `<main>
${quotaRow(ui, 3)}
<section class="daily-block" id="daily" aria-label="Daily card" aria-live="polite">
<p class="daily-prompt">${escapeHtml(ui === "th" ? "\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13" : "Your card for today")}</p>
</section>
<form id="ask-form" action="/api/readings" method="post" data-need="${escapeHtml(d.hintNeed)}">
<label class="ask-label" for="q">${escapeHtml(d.ask)}</label>
<textarea id="q" name="question" rows="2" maxlength="200" placeholder="${escapeHtml(d.placeholder)}"></textarea>
${topicChips(ui)}
<button class="btn btn-primary" type="submit">${escapeHtml(d.shuffle)}</button>
</form>
<div id="draw-stage" class="stage" aria-live="polite"><div class="slots"><span class="slot"></span><span class="slot"></span><span class="slot"></span></div><div class="deck" id="deck"></div></div>
<div id="guide" class="guide s-idle"><img src="/mascot/ngern-sitting.svg" alt="Ngern the Korat cat" width="120" height="120"><p class="bubble">${escapeHtml(d.hintIdle)}</p></div>
</main>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#org`, name: "TarotNice", url: origin, logo: `${origin}/mascot/ngern-head-mark.svg` },
      { "@type": "WebSite", url: origin, name: "TarotNice", publisher: { "@id": `${origin}/#org` }, inLanguage: ["th", "en"] },
    ],
  }).replace(/</g, "\\u003c");
  return pageShell({
    title: `TarotNice \u2014 ${d.homeTitle}`,
    lang: ui,
    origin,
    canonicalPath: "/",
    description: d.homeLede,
    extraHead: `<script src="/app/home.js" defer></script>`,
    jsonLd,
    body: `${head}${body}${siteFooterHtml(ui, "/")}${CLIENT}`,
  });
}
