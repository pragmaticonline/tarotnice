// Seeds D1 cards + card_meanings from content/*.json.
// Builds one SQL file, then applies it locally and remotely:
//   node scripts/seed-cards.mjs [--local-only | --remote-only]
// Requires content/cards.json + content/meanings.{en,th}.json
// + content/imagery.{en,th}.json (imagery lands on both rows; the
// Thai lines are translations of the reviewed EN canon, pending a
// Thai-reader review pass before reviewed flips true)
// (see scripts/build-meanings.mjs).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("build", { recursive: true });

function esc(value) {
  return String(value ?? "").replace(/'/g, "''");
}

const { cards } = JSON.parse(readFileSync("content/cards.json", "utf-8"));
const en = JSON.parse(readFileSync("content/meanings.en.json", "utf-8"));
const th = JSON.parse(readFileSync("content/meanings.th.json", "utf-8"));
const imageryEn = JSON.parse(readFileSync("content/imagery.en.json", "utf-8"));
const imageryTh = JSON.parse(readFileSync("content/imagery.th.json", "utf-8"));

const lines = [];
for (const c of cards) {
  lines.push(
    `INSERT INTO cards (id, slug, arcana, suit, rank, image_key) VALUES (${c.id}, '${esc(c.slug)}', '${esc(c.arcana)}', ${c.suit ? `'${esc(c.suit)}'` : "NULL"}, ${c.rank}, '${esc(c.image)}') ON CONFLICT (id) DO UPDATE SET slug=excluded.slug, arcana=excluded.arcana, suit=excluded.suit, rank=excluded.rank, image_key=excluded.image_key;`,
  );
  for (const [lang, table] of [["en", en], ["th", th]]) {
    const m = table[String(c.id)];
    if (!m) throw new Error(`missing ${lang} meaning for card ${c.id}`);
    const reviewed = m.reviewed === true ? 1 : 0;
    // RWS scene note: reviewed EN canon on en rows, its Thai
    // translation on th rows (both fail loudly when missing).
    const imgTable = lang === "en" ? imageryEn : imageryTh;
    const img = imgTable[String(c.id)]?.imagery ?? null;
    if (!img) throw new Error(`missing ${lang} imagery for card ${c.id}`);
    lines.push(
      `INSERT INTO card_meanings (card_id, lang, name, keywords_upright, keywords_reversed, upright, reversed, love, career, money, health, reviewed, imagery) VALUES (${c.id}, '${lang}', '${esc(m.name)}', '${esc(JSON.stringify(m.keywords_upright))}', '${esc(JSON.stringify(m.keywords_reversed))}', '${esc(m.upright)}', '${esc(m.reversed)}', '${esc(m.love)}', '${esc(m.career)}', '${esc(m.money)}', '${esc(m.health)}', ${reviewed}, ${img ? `'${esc(img)}'` : "NULL"}) ON CONFLICT (card_id, lang) DO UPDATE SET name=excluded.name, keywords_upright=excluded.keywords_upright, keywords_reversed=excluded.keywords_reversed, upright=excluded.upright, reversed=excluded.reversed, love=excluded.love, career=excluded.career, money=excluded.money, health=excluded.health, reviewed=excluded.reviewed, imagery=excluded.imagery;`,
    );
  }
}
writeFileSync("build/seed-cards.sql", lines.join("\n") + "\n");
console.log(`seed SQL: ${cards.length} cards, ${lines.length} statements`);

const only = process.argv[2];
const targets = only === "--local-only" ? ["--local"] : only === "--remote-only" ? ["--remote"] : ["--local", "--remote"];
for (const target of targets) {
  execFileSync("npx", ["wrangler", "d1", "execute", "tarotnice", target, "--file", "build/seed-cards.sql"], { stdio: "inherit" });
}
