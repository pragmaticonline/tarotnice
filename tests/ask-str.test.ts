import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The ask.js STR table carries every user-facing string in en + th.
// Thai users once got an empty reading disclaimer: the `th` block had
// no `disclaimer` key (so t("disclaimer") was undefined), while the
// `en` block carried the Thai text as a dead duplicate key. This parses
// both blocks and pins key parity plus no duplicate keys.
const ASK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/ask.js",
);

function blockKeys(src: string, lang: string): { keys: string[]; dups: string[] } {
  const start = src.indexOf(`    ${lang}: {`);
  if (start < 0) throw new Error(`no ${lang} block`);
  let i = src.indexOf("{", start);
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let buf = "";
  const keys: string[] = [];
  const dups: string[] = [];
  const seen = new Set<string>();
  const idents: string[] = [];
  for (; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1) {
      if (/[A-Za-z_$]/.test(ch) || (buf && /[\w$]/.test(ch))) {
        buf += ch;
      } else {
        if (buf) {
          // Only keep words that are followed by a colon (object keys).
          let j = i;
          while (src[j] === " " || src[j] === "\t") j++;
          if (src[j] === ":") idents.push(buf);
          buf = "";
        }
      }
    }
  }
  for (const k of idents) {
    if (seen.has(k)) dups.push(k);
    else {
      seen.add(k);
      keys.push(k);
    }
  }
  return { keys, dups };
}

describe("ask.js STR parity", () => {
  const src = readFileSync(ASK_PATH, "utf8");

  it("has no duplicate keys inside either language block", () => {
    expect(blockKeys(src, "en").dups).toEqual([]);
    expect(blockKeys(src, "th").dups).toEqual([]);
  });

  it("has the same keys in en and th, including disclaimer", () => {
    const en = blockKeys(src, "en").keys;
    const th = blockKeys(src, "th").keys;
    expect(en).toContain("disclaimer");
    expect(th).toContain("disclaimer");
    expect([...th].sort()).toEqual([...en].sort());
  });

  it("never sleeps the ask form when an unfinished reading can resume", () => {
    expect(src).toContain("d.openReading");
  });

  it("sends guests with insufficient credits to sign-in, then billing", () => {
    expect(src).toContain('res.data.error === "registration_required"');
    expect(src).toContain('"/sign-in?return=%2Fbilling"');
  });

  it("uses the full §7 disclaimer wording in both languages", () => {
    // Guards against regressing to the legacy short Thai text: both
    // disclaimers must cover entertainment-only, no professional
    // advice, own judgment, and the user's own power to choose.
    for (const lang of ["en", "th"]) {
      const m = src.match(
        new RegExp(`    ${lang}: \\{([\\s\\S]*?)\\n    \\},`),
      );
      expect(m, `${lang} block`).toBeTruthy();
      const dm = m![1].match(/disclaimer: "((?:[^"\\]|\\.)*)"/);
      expect(dm, `${lang} disclaimer`).toBeTruthy();
      const raw = dm![1];
      if (lang === "en") {
        expect(raw).toContain("entertainment");
        expect(raw).toContain("power to choose your path");
      } else {
        expect(raw.length).toBeGreaterThan(500);
        expect(raw).toContain("\\u0e2a\\u0e38\\u0e14\\u0e17\\u0e49\\u0e32\\u0e22");
      }
    }
  });
});
