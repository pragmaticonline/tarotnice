// Share images (SPEC \u00a79.3): story 1080x1920 + OG 1200x630, rendered in
// the Worker. Hand-authored SVG (correct Thai shaping) rasterized with
// resvg-wasm; Thai + display fonts embedded. The wasm binary lives in
// R2 at share-assets/resvg.wasm (uploaded once, cached in global scope).
// Card art is the 480px JPEG copies (the rasterizer decodes JPEG/PNG,
// not WebP). OG images never include the question.
import { Resvg, initWasm } from "@resvg/resvg-wasm";
// Bundled at build time (2.5MB): R2 bytes cannot be compiled by the
// workerd embedder ("Wasm code generation disallowed"), so the module
// ships with the worker instead of living in the bucket. Imported
// lazily so unit tests (which never render) never load it.

export type ShareEnv = {
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
};

export type ShareCard = { key: string; name: string; reversed: boolean };

export type ShareSpec = {
  kind: "story" | "og";
  shareKind: "reading" | "daily";
  lang: "th" | "en";
  mode: "day" | "night";
  cards: ShareCard[];
  summary: string;
  /** Null = private (default): image shows the kept-private line. */
  question: string | null;
};

const DAY = { bg0: "#fbe9e1", bg1: "#f6f1fa", ink: "#2e2547", muted: "#76698f", accent: "#4a3d78", face: "#fffaf0" };
const NIGHT = { bg0: "#2a2150", bg1: "#15122b", ink: "#ece6d6", muted: "#a59fbf", accent: "#d8b46a", face: "#f3ecdc" };

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const mod = (await import(
        "../../node_modules/@resvg/resvg-wasm/index_bg.wasm"
      )) as unknown as { default: WebAssembly.Module };
      await initWasm(mod.default);
    })();
  }
  return wasmReady;
}

const fontCache = new Map<string, ArrayBuffer>();
async function font(env: ShareEnv, path: string): Promise<ArrayBuffer> {
  const hit = fontCache.get(path);
  if (hit) return hit;
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/${path}`));
  if (!res.ok) throw new Error(`font missing: ${path}`);
  const buf = await res.arrayBuffer();
  fontCache.set(path, buf);
  return buf;
}

async function fonts(env: ShareEnv): Promise<Uint8Array[]> {
  const bufs = await Promise.all([
    font(env, "fonts/cormorant-garamond-latin-600.woff2"),
    font(env, "fonts/ibm-plex-sans-thai-latin-400.woff2"),
    font(env, "fonts/ibm-plex-sans-thai-latin-500.woff2"),
    font(env, "fonts/ibm-plex-sans-thai-thai-400.woff2"),
    font(env, "fonts/ibm-plex-sans-thai-thai-500.woff2"),
  ]);
  return bufs.map((b) => new Uint8Array(b));
}

async function cardJpeg(env: ShareEnv, key: string): Promise<string> {
  const obj = await env.MEDIA.get(`cards/${key}.jpg`);
  if (!obj) throw new Error(`card art missing: cards/${key}.jpg`);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Greedy wrap: word-based when the text has spaces, grapheme-based for
 * Thai (never split a base consonant from its vowel/tone marks).
 */
export function wrapText(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const lines: string[] = [];
  if (clean.includes(" ")) {
    let line = "";
    for (const word of clean.split(" ")) {
      if ((line + " " + word).trim().length > maxChars && line) {
        lines.push(line.trim());
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    if (line) lines.push(line);
  } else {
    const graphemes = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(clean)].map(
      (s) => s.segment,
    );
    for (let i = 0; i < graphemes.length; i += maxChars) {
      lines.push(graphemes.slice(i, i + maxChars).join(""));
    }
  }
  return lines;
}

const STR = {
  th: {
    keptPrivate: "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e16\u0e39\u0e01\u0e0b\u0e48\u0e2d\u0e19\u0e44\u0e27\u0e49",
    footer: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e1f\u0e23\u0e35 tarotnice.com",
    ogLine: "\u0e44\u0e1e\u0e48\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49 \u0e25\u0e2d\u0e07\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e1f\u0e23\u0e35\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e1a\u0e49\u0e32\u0e07",
  },
  en: {
    keptPrivate: "Question kept private",
    footer: "Free tarot reading tarotnice.com",
    ogLine: "My cards today \u2014 get your own free tarot reading",
  },
};

function cardImage(x: number, y: number, w: number, h: number, uri: string, reversed: boolean): string {
  const img = `<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
  const body = reversed
    ? `<g transform="rotate(180 ${x + w / 2} ${y + h / 2})">${img}</g>`
    : img;
  return `${body}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#cdb27a" stroke-width="3" rx="10"/>`;
}

function storySvg(p: ShareSpec & { uris: string[] }): string {
  const c = p.mode === "night" ? NIGHT : DAY;
  const s = STR[p.lang];
  const W = 1080;
  const question = p.question ?? s.keptPrivate;
  const qLines = wrapText(question, 30).slice(0, 2);
  const sumLines = wrapText(p.summary, 32).slice(0, 5);
  const n = p.cards.length;
  const cw = n === 1 ? 420 : 290;
  const ch = Math.round((cw * 2689) / 1537);
  const gap = 36;
  const totalW = n * cw + (n - 1) * gap;
  const x0 = Math.round((W - totalW) / 2);
  const cardY = 560;
  let cards = "";
  p.cards.forEach((card, i) => {
    const x = x0 + i * (cw + gap);
    cards += cardImage(x, cardY, cw, ch, p.uris[i], card.reversed);
    cards += `<text x="${x + cw / 2}" y="${cardY + ch + 52}" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="34" fill="${c.muted}">${escXml(card.name)}</text>`;
  });
  let y = cardY + ch + 130;
  let summary = "";
  for (const line of sumLines) {
    summary += `<text x="540" y="${y}" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="40" fill="${c.ink}">${escXml(line)}</text>`;
    y += 58;
  }
  let q = "";
  let qy = 380;
  for (const line of qLines) {
    q += `<text x="540" y="${qy}" text-anchor="middle" font-family="Cormorant Garamond, IBM Plex Sans Thai" font-size="52" font-style="italic" fill="${c.accent}">${escXml(line)}</text>`;
    qy += 66;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bg0}"/><stop offset="1" stop-color="${c.bg1}"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#bg)"/><text x="540" y="150" text-anchor="middle" font-family="Cormorant Garamond, IBM Plex Sans Thai" font-size="84" font-weight="600" fill="${c.accent}">TarotNice</text><text x="540" y="225" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="36" fill="${c.muted}">${p.lang === "th" ? "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c" : "tarot reading"}</text>${q}${cards}${summary}<text x="540" y="1800" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="38" fill="${c.muted}">${escXml(s.footer)}</text></svg>`;
}

function ogSvg(p: ShareSpec & { uris: string[] }): string {
  const c = p.mode === "night" ? NIGHT : DAY;
  const s = STR[p.lang];
  const n = p.cards.length;
  const cw = n === 1 ? 190 : 170;
  const ch = Math.round((cw * 2689) / 1537);
  const gap = 24;
  const x0 = 90;
  const cardY = Math.round((630 - ch) / 2);
  let cards = "";
  p.cards.forEach((card, i) => {
    cards += cardImage(x0 + i * (cw + gap), cardY, cw, ch, p.uris[i], card.reversed);
  });
  const tx = x0 + n * (cw + gap) + 50;
  const sumLines = wrapText(p.summary, 24).slice(0, 4);
  const ogLines = wrapText(s.ogLine, 28).slice(0, 2);
  let y = 250;
  let summary = "";
  for (const line of sumLines) {
    summary += `<text x="${tx}" y="${y}" font-family="IBM Plex Sans Thai" font-size="34" fill="${c.ink}">${escXml(line)}</text>`;
    y += 48;
  }
  let oy = 520;
  let ogLine = "";
  for (const line of ogLines) {
    ogLine += `<text x="${tx}" y="${oy}" font-family="IBM Plex Sans Thai" font-size="30" fill="${c.muted}">${escXml(line)}</text>`;
    oy += 40;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.bg0}"/><stop offset="1" stop-color="${c.bg1}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#bg)"/>${cards}<text x="${tx}" y="130" font-family="Cormorant Garamond, IBM Plex Sans Thai" font-size="72" font-weight="600" fill="${c.accent}">TarotNice</text>${summary}${ogLine}<text x="${tx}" y="600" font-family="IBM Plex Sans Thai" font-size="28" fill="${c.muted}">tarotnice.com</text></svg>`;
}

function badgeSvg(opts: {
  kind: "story" | "og";
  label: string;
  lang: "th" | "en";
  mode: "day" | "night";
}): string {
  const c = opts.mode === "night" ? NIGHT : DAY;
  const lines = wrapText(opts.label, opts.kind === "story" ? 16 : 22);
  const title = lines
    .slice(0, 3)
    .map(
      (line, i) =>
        `<text x="50%" y="${opts.kind === "story" ? 880 + i * 110 : 300 + i * 88}" text-anchor="middle" font-family="Cormorant Garamond, IBM Plex Sans Thai" font-size="${opts.kind === "story" ? 96 : 76}" font-weight="600" fill="${c.accent}">${escXml(line)}</text>`,
    )
    .join("");
  // Sun-disc motif drawn as shapes (the embedded fonts have no
  // star glyph; text stars rendered as tofu in share images before).
  const sun = (cx: number, cy: number, r: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.accent}" stroke-width="${Math.max(3, r / 9)}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="${c.accent}"/>`;
  if (opts.kind === "story") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bg0}"/><stop offset="1" stop-color="${c.bg1}"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#bg)"/>${sun(540, 700, 90)}${title}<text x="50%" y="1780" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="34" fill="${c.muted}">tarotnice.com</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.bg0}"/><stop offset="1" stop-color="${c.bg1}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#bg)"/>${sun(180, 315, 70)}${title.replaceAll('x="50%"', 'x="660"')}<text x="660" y="560" font-family="IBM Plex Sans Thai" font-size="28" fill="${c.muted}" text-anchor="middle">tarotnice.com</text></svg>`;
}

const INVITE_STR = {
  th: {
    headline: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e14\u0e49\u0e27\u0e22\u0e01\u0e31\u0e19",
    invites: "{name} \u0e0a\u0e27\u0e19\u0e04\u0e38\u0e13",
    line: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e1f\u0e23\u0e35 \u0e16\u0e32\u0e21\u0e44\u0e14\u0e49\u0e17\u0e38\u0e01\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
    code: "\u0e42\u0e04\u0e49\u0e14",
    footer: "\u0e2a\u0e21\u0e31\u0e04\u0e23\u0e14\u0e49\u0e27\u0e22\u0e42\u0e04\u0e49\u0e14\u0e19\u0e35\u0e49 \u0e23\u0e31\u0e1a +1 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e42\u0e1a\u0e19\u0e31\u0e2a \u00b7 tarotnice.com",
  },
  en: {
    headline: "Draw the cards with me",
    invites: "{name} invites you",
    line: "Free tarot readings. Ask about anything.",
    code: "Code",
    footer: "Sign up with this code for +1 bonus question \u00b7 tarotnice.com",
  },
};

function inviteSvg(opts: { name: string | null; code: string; lang: "th" | "en"; mode: "day" | "night" }): string {
  const c = opts.mode === "night" ? NIGHT : DAY;
  const s = INVITE_STR[opts.lang];
  const who = opts.name ? s.invites.replace("{name}", opts.name) : "TarotNice";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bg0}"/><stop offset="1" stop-color="${c.bg1}"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#bg)"/><text x="540" y="150" text-anchor="middle" font-family="Cormorant Garamond, IBM Plex Sans Thai" font-size="76" font-weight="600" fill="${c.accent}">TarotNice</text><text x="540" y="330" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="44" fill="${c.muted}">${escXml(who)}</text><text x="540" y="450" text-anchor="middle" font-family="Cormorant Garamond, IBM Plex Sans Thai" font-size="72" font-weight="600" fill="${c.ink}">${escXml(s.headline)}</text><text x="540" y="540" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="38" fill="${c.muted}">${escXml(s.line)}</text><rect x="290" y="620" width="500" height="150" rx="16" fill="${c.face}" stroke="#cdb27a" stroke-width="2"/><text x="540" y="682" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="30" fill="${c.muted}">${escXml(s.code)}</text><text x="540" y="745" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="58" font-weight="600" fill="${c.accent}">${escXml(opts.code)}</text><text x="540" y="920" text-anchor="middle" font-family="IBM Plex Sans Thai" font-size="32" fill="${c.muted}">${escXml(s.footer)}</text></svg>`;
}

/** Render the 1080x1080 invite share image (design board 4). */
export async function renderInviteImage(
  env: ShareEnv,
  opts: { name: string | null; code: string; lang: "th" | "en"; mode: "day" | "night" },
): Promise<Uint8Array> {
  await ensureWasm();
  const fontBuffers = await fonts(env);
  const resvg = new Resvg(inviteSvg(opts), {
    font: { fontFiles: [], loadSystemFonts: false, fontBuffers },
    fitTo: { mode: "width", value: 1080 },
  });
  return resvg.render().asPng();
}

/** Render a milestone badge image (story 1080x1920 / og 1200x630). */
export async function renderBadgeImage(
  env: ShareEnv,
  opts: { kind: "story" | "og"; label: string; lang: "th" | "en"; mode: "day" | "night" },
): Promise<Uint8Array> {
  await ensureWasm();
  const fontBuffers = await fonts(env);
  const svg = badgeSvg(opts);
  const width = opts.kind === "story" ? 1080 : 1200;
  const resvg = new Resvg(svg, {
    font: { fontFiles: [], loadSystemFonts: false, fontBuffers },
    fitTo: { mode: "width", value: width },
  });
  return resvg.render().asPng();
}

/** Render a share image to PNG bytes (throws when assets are missing). */
export async function renderShareImage(env: ShareEnv, spec: ShareSpec): Promise<Uint8Array> {
  await ensureWasm();
  const [fontBuffers, ...uris] = await Promise.all([
    fonts(env),
    ...spec.cards.map((card) => cardJpeg(env, card.key)),
  ]);
  const withUris = { ...spec, uris: uris as string[] };
  const svg = spec.kind === "story" ? storySvg(withUris) : ogSvg(withUris);
  const width = spec.kind === "story" ? 1080 : 1200;
  const resvg = new Resvg(svg, {
    font: { fontFiles: [], loadSystemFonts: false, fontBuffers },
    fitTo: { mode: "width", value: width },
  });
  return resvg.render().asPng();
}
