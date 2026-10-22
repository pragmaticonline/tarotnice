// Model eval (SPEC §10.1): run 20 fixed readings (10 Thai, 10 English,
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
  ["th", "career", "งานใหม่ที่กำลังจะเริ่ม จะเป็นอย่างไร", [[1, false], [17, false], [6, true]]],
  ["th", "love", "เขาคิดอย่างไรกับความสัมพันธ์นี้", [[6, false], [18, false], [2, false]]],
  ["th", "money", "ควรลงทุนเพิ่มตอนนี้ไหม", [[10, false], [4, false], [36, true]]],
  ["th", "health", "ร่างกายของฉันต้องการอะไรตอนนี้", [[3, false], [14, false], [9, true]]],
  ["th", "general", "เดือนนี้มีอะไรรออยู่", [[21, false], [16, true], [0, false]]],
  ["th", "career", "ควรเปลี่ยนงานตอนนี้เลยไหม", [[7, false], [13, true], [8, false]]],
  ["th", "love", "ความรักครั้งนี้จะไปต่อได้ไหม", [[19, false], [5, false], [12, true]]],
  ["th", "money", "หนี้ก้อนนี้จะหมดเมื่อไหร่", [[15, true], [11, false], [64, false]]],
  ["th", "health", "ทำไมนอนไม่หลับ ควรทำอย่างไร", [[18, true], [9, false], [14, true]]],
  ["th", "general", "ควรให้อภัยเขาไหม", [[20, false], [6, true], [3, true]]],
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
