import { describe, expect, it } from "vitest";
import cardsJson from "../content/cards.json";
import en from "../content/meanings.en.json";
import th from "../content/meanings.th.json";

const cards = cardsJson.cards as {
  id: number; slug: string; arcana: string; suit: string | null; rank: number; image: string;
}[];

describe("content/cards.json", () => {
  it("holds all 78 cards with unique ids and slugs", () => {
    expect(cards).toHaveLength(78);
    expect(new Set(cards.map((c) => c.id)).size).toBe(78);
    expect(new Set(cards.map((c) => c.slug)).size).toBe(78);
    expect(Math.min(...cards.map((c) => c.id))).toBe(0);
    expect(Math.max(...cards.map((c) => c.id))).toBe(77);
  });

  it("follows the SPEC 3.4 naming: major-00..21 + {suit}-{rank}", () => {
    const majors = cards.filter((c) => c.arcana === "major");
    const minors = cards.filter((c) => c.arcana === "minor");
    expect(majors).toHaveLength(22);
    expect(minors).toHaveLength(56);
    for (const c of majors) {
      expect(c.image).toBe(`cards/major-${String(c.rank).padStart(2, "0")}`);
      expect(c.suit).toBeNull();
    }
    for (const c of minors) {
      expect(["wands", "cups", "swords", "pentacles"]).toContain(c.suit);
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(14);
      expect(c.image).toBe(`cards/${c.suit}-${String(c.rank).padStart(2, "0")}`);
    }
  });

  it("uses slugs like the-fool and ten-of-wands", () => {
    const byId = Object.fromEntries(cards.map((c) => [c.id, c.slug]));
    expect(byId[0]).toBe("the-fool");
    expect(byId[21]).toBe("the-world");
    expect(byId[12]).toBe("the-hanged-man");
    // wands block starts at 22: rank 10 -> ten-of-wands.
    expect(byId[22 + 9]).toBe("ten-of-wands");
    expect(byId[22 + 13]).toBe("king-of-wands");
  });
});

describe("meanings drafts", () => {
  it("covers every card in both languages, all unreviewed", () => {
    for (const c of cards) {
      for (const [lang, table] of [["en", en], ["th", th]] as const) {
        const m = (table as Record<string, Record<string, unknown>>)[String(c.id)];
        expect(m, `${lang}:${c.id}`).toBeDefined();
        expect(m.reviewed).toBe(false);
        expect(m.slug).toBe(c.slug);
        for (const key of ["name", "keywords_upright", "keywords_reversed", "upright", "reversed", "love", "career", "money", "health"]) {
          expect(m[key], `${lang}:${c.id}.${key}`).toBeDefined();
        }
        expect((m.upright as string).length).toBeGreaterThan(20);
      }
    }
  });

  // C2 regression: minors are individually authored, never generated from
  // suit x rank tables. No two cards share a topic-note set, and the
  // review-named cards carry standard RWS meanings.
  it("gives every minor its own topic notes (no shared suit-level sets)", () => {
    for (const [lang, table] of [["en", en], ["th", th]] as const) {
      const minors = cards.filter((c) => c.arcana === "minor");
      const sets = minors.map((c) => {
        const m = (table as Record<string, Record<string, unknown>>)[String(c.id)];
        return [m.love, m.career, m.money, m.health].join("|");
      });
      expect(new Set(sets).size, lang).toBe(minors.length);
      const ups = minors.map((c) => (table as Record<string, Record<string, unknown>>)[String(c.id)].upright);
      expect(new Set(ups).size, lang).toBe(minors.length);
    }
  });

  it("matches standard RWS meanings for the review-named minors", () => {
    const bySlug = (table: unknown) =>
      Object.fromEntries(Object.values(table as Record<string, { slug: string; keywords_upright: string[] }>).map((m) => [m.slug, m]));
    const enBy = bySlug(en);
    expect(enBy["three-of-swords"].keywords_upright).toContain("heartbreak");
    expect(enBy["ten-of-swords"].keywords_upright).toContain("rock bottom");
    // Expert wording (2026-10-26) renders the same RWS idea as
    // security/saving/control/protection; pin that instead of "holding on".
    expect(enBy["four-of-pentacles"].keywords_upright).toContain("control");
  });
});
