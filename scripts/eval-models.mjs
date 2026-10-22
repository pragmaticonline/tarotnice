// Model eval (SPEC \u00a710.1): run 20 fixed readings (10 Thai, 10 English,
// mixed topics) through candidate Workers AI chat models and save every
// output for the owner to review. The winner goes in wrangler.toml as
// READING_MODEL.
//
// Usage:
//   set -a && . /root/.env
//   node scripts/eval-models.mjs [--models id1,id2] [--limit N] [--out eval-results]
//
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID. Card data comes
// from the local seeded D1 (run seed-cards.mjs --local-only first).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = (process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null) || "eval-results";
const LIMIT = (process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : null) || 20;
const MODELS = (
  (process.argv.includes("--models") ? process.argv[process.argv.indexOf("--models") + 1] : null) ||
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/qwen/qwen2.5-14b-instruct"
).split(",");

// 20 fixed cases: [lang, topic, question, [cardId, reversed] x3].
const CASES = [
  ["th", "career", "\u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e17\u0e35\u0e48\u0e01\u0e33\u0e25\u0e31\u0e07\u0e08\u0e30\u0e40\u0e23\u0e34\u0e48\u0e21 \u0e08\u0e30\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23", [[1, false], [17, false], [6, true]]],
  ["th", "love", "\u0e40\u0e02\u0e32\u0e04\u0e34\u0e14\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23\u0e01\u0e31\u0e1a\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e21\u0e1e\u0e31\u0e19\u0e18\u0e4c\u0e19\u0e35\u0e49", [[6, false], [18, false], [2, false]]],
  ["th", "money", "\u0e04\u0e27\u0e23\u0e25\u0e07\u0e17\u0e38\u0e19\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e44\u0e2b\u0e21", [[10, false], [4, false], [36, true]]],
  ["th", "health", "\u0e23\u0e48\u0e32\u0e07\u0e01\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e2d\u0e30\u0e44\u0e23\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49", [[3, false], [14, false], [9, true]]],
  ["th", "general", "\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e21\u0e35\u0e2d\u0e30\u0e44\u0e23\u0e23\u0e2d\u0e2d\u0e22\u0e39\u0e48", [[21, false], [16, true], [0, false]]],
  ["th", "career", "\u0e04\u0e27\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e07\u0e32\u0e19\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e40\u0e25\u0e22\u0e44\u0e2b\u0e21", [[7, false], [13, true], [8, false]]],
  ["th", "love", "\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e19\u0e35\u0e49\u0e08\u0e30\u0e44\u0e1b\u0e15\u0e48\u0e2d\u0e44\u0e14\u0e49\u0e44\u0e2b\u0e21", [[19, false], [5, false], [12, true]]],
  ["th", "money", "\u0e2b\u0e19\u0e35\u0e49\u0e01\u0e49\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e08\u0e30\u0e2b\u0e21\u0e14\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e44\u0e2b\u0e23\u0e48", [[15, true], [11, false], [64, false]]],
  ["th", "health", "\u0e17\u0e33\u0e44\u0e21\u0e19\u0e2d\u0e19\u0e44\u0e21\u0e48\u0e2b\u0e25\u0e31\u0e1a \u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23", [[18, true], [9, false], [14, true]]],
  ["th", "general", "\u0e04\u0e27\u0e23\u0e43\u0e2b\u0e49\u0e2d\u0e20\u0e31\u0e22\u0e40\u0e02\u0e32\u0e44\u0e2b\u0e21", [[20, false], [6, true], [3, true]]],
  ["en", "career", "How will the new job I'm starting go?", [[1, false], [17, false], [6, true]]],
  ["en", "love", "What does this relationship need most?", [[6, false], [18, false], [2, false]]],
  ["en", "money", "Should I invest more right now?", [[10, false], [4, false], [36, true]]],
  ["en", "health", "What does my body need right now?", [[3, false], [14, false], [9, true]]],
  ["en", "general", "What is waiting for me this month?", [[21, false], [16, true], [0, false]]],
  ["en", "career", "Should I change jobs now?", [[7, false], [13, true], [8, false]]],
  ["en", "love", "Can this love last?", [[19, false], [5, false], [12, true]]],
  ["en", "money", "When will this debt end?", [[15, true], [11, false], [64, false]]],
  ["en", "health", "Why can't I sleep? What should I do?", [[18, true], [9, false], [14, true]]],
  ["en", "general", "Should I forgive them?", [[20, false], [6, true], [3, true]]],
];

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) {
  console.error("needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN");
  process.exit(2);
}

// Bundle the prompt builder (src is TypeScript; eval runs in plain node).
execFileSync("npx", ["--yes", "esbuild", "src/lib/reading.ts", "--bundle", "--format=esm", "--outfile=build/reading-eval.mjs"], { stdio: "inherit" });
const { buildReadingPrompt, toPromptCard } = await import("../build/reading-eval.mjs");

// Card data from the local seeded D1.
const rows = JSON.parse(
  execFileSync("npx", ["wrangler", "d1", "execute", "tarotnice", "--local", "--json", "--command",
    "SELECT c.id, c.slug, c.arcana, c.suit, c.rank, c.image_key AS imageKey, m.lang, m.name, m.keywords_upright AS ku, m.keywords_reversed AS kr, m.upright, m.reversed, m.love, m.career, m.money, m.health FROM cards c JOIN card_meanings m ON m.card_id = c.id"],
    { encoding: "utf-8" }),
)[0].results;
const byIdLang = {};
for (const r of rows) byIdLang[`${r.id}:${r.lang}`] = r;

function cardView(id, lang) {
  const r = byIdLang[`${id}:${lang}`] ?? byIdLang[`${id}:en`];
  return {
    id: r.id, slug: r.slug, arcana: r.arcana, suit: r.suit, rank: r.rank,
    imageKey: r.imageKey, name: r.name,
    keywordsUpright: JSON.parse(r.ku), keywordsReversed: JSON.parse(r.kr),
    upright: r.upright, reversed: r.reversed,
    love: r.love, career: r.career, money: r.money, health: r.health,
  };
}

async function runModel(model, messages) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data.errors ?? data).slice(0, 300)}`);
  return typeof data.result?.response === "string" ? data.result.response : JSON.stringify(data.result).slice(0, 4000);
}

mkdirSync(OUT, { recursive: true });
for (const model of MODELS) {
  const safe = model.replace(/[^a-zA-Z0-9]+/g, "_");
  const md = [`# Eval: ${model}`, ""];
  let ok = 0;
  for (const [i, [lang, topic, question, drawn]] of CASES.slice(0, LIMIT).entries()) {
    const cards = drawn.map(([id, reversed]) => toPromptCard(cardView(id, lang), reversed, topic));
    const { system, user } = buildReadingPrompt({ lang, topic, question, cards, prev: [], nickname: null });
    md.push(`## Case ${i + 1} (${lang}/${topic}): ${question}`);
    md.push(`Cards: ${cards.map((c) => c.name + (c.reversed ? " (rev)" : "")).join(" / ")}`, "");
    try {
      const out = await runModel(model, [
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      ok++;
      md.push(out.trim(), "");
    } catch (e) {
      md.push(`ERROR: ${e.message}`, "");
    }
  }
  writeFileSync(`${OUT}/${safe}.md`, md.join("\n"));
  console.log(`${model}: ${ok}/${Math.min(LIMIT, CASES.length)} ok -> ${OUT}/${safe}.md`);
}
