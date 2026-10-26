import { describe, expect, it } from "vitest";
import { fmt, isUiLang, t, uiLangFor, UI_LANGS } from "../src/lib/i18n";

describe("UI language resolution", () => {
  it("prefers the cookie, then country, then English", () => {
    expect(uiLangFor({ cookie: "th", country: "US" })).toBe("th");
    expect(uiLangFor({ cookie: "en", country: "TH" })).toBe("en");
    expect(uiLangFor({ cookie: null, country: "TH" })).toBe("th");
    expect(uiLangFor({ cookie: null, country: "US" })).toBe("en");
    expect(uiLangFor({ cookie: null, country: "FI" })).toBe("en");
    expect(uiLangFor({ cookie: "xx", country: "TH" })).toBe("th");
  });

  it("offers only Thai and English", () => {
    expect(UI_LANGS.map((l) => l.code).sort()).toEqual(["en", "th"]);
    expect(isUiLang("th")).toBe(true);
    expect(isUiLang("en")).toBe(true);
    expect(isUiLang("es")).toBe(false);
    expect(isUiLang("zh")).toBe(false);
  });

  it("has complete dictionaries for both UI languages", () => {
    for (const lang of ["en", "th"] as const) {
      const d = t(lang);
      for (const key of [
        "ask", "placeholder", "shuffle", "hintIdle", "hintNeed",
        "hintShuffling", "hintPick", "hintReveal", "hintDone", "hintSleep",
        "quota", "quotaLoading", "upright", "reversed", "again", "share", "shareTitle",
        "shareShowQ", "sharePrivate", "shareCta", "shareText",
        "themeDay", "themeNight",
      ] as const) {
        expect(d[key].length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
    expect(t("th").signIn).toBe("\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a");
    expect(t("th").shuffle).toBe("\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48");
    expect(t("en").shuffle).toBe("Shuffle");
  });

  it("formats {vars} and keeps missing ones visible", () => {
    expect(fmt("\u0e40\u0e2b\u0e25\u0e37\u0e2d {n}/3 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49", { n: 2 })).toBe("\u0e40\u0e2b\u0e25\u0e37\u0e2d 2/3 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49");
    expect(fmt("{n} of {total}", { n: 1 })).toContain("{total}");
  });
});
