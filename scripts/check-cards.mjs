// Verifies every expected card key exists: in content/cards.json,
// in build/cards/ (local WebP output), and \u2014 with --remote \u2014 in the
// R2 bucket. Fails (exit 1) on any missing key.
// Usage: node scripts/check-cards.mjs [--remote]
import { existsSync, readFileSync } from "node:fs";

const { cards } = JSON.parse(readFileSync("content/cards.json", "utf-8"));

const expected = new Set();
for (const c of cards) {
  expected.add(`${c.image}.webp`);
  expected.add(`${c.image}@2x.webp`);
  // JPEG copies feed server-side share-image rendering (never pages).
  expected.add(`${c.image}.jpg`);
}
// Card back (owner-supplied art; see content/REVIEW.md).
expected.add("cards/back.webp");
expected.add("cards/back@2x.webp");
expected.add("cards/back.jpg");
// resvg-wasm binary for share-image rendering.
expected.add("share-assets/resvg.wasm");

let missing = [];
for (const key of expected) {
  // The renderer wasm ships from node_modules (uploaded to R2 once).
  const local = key === "share-assets/resvg.wasm" ? "node_modules/@resvg/resvg-wasm/index_bg.wasm" : `build/${key}`;
  if (!existsSync(local)) missing.push(`local:${local}`);
}
if (missing.length) {
  console.error(`missing ${missing.length} local files (showing 10):\n${missing.slice(0, 10).join("\n")}`);
}

if (process.argv.includes("--remote")) {
  // wrangler 3 has no `r2 object list`; list through the R2 REST API.
  // Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in env.
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) {
    console.error("CHECK-CARDS: --remote needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN");
    process.exit(2);
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/tarotnice-media/objects?prefix=cards/&per_page=1000`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  const listed = new Set((data.result ?? []).map((o) => o.key).filter(Boolean));
  for (const key of expected) {
    if (!listed.has(key)) missing.push(`r2:${key}`);
  }
}

if (missing.length) {
  console.error(`CHECK-CARDS FAIL: ${missing.length} missing (showing 20):\n${missing.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log(`CHECK-CARDS OK: ${expected.size} keys present`);
