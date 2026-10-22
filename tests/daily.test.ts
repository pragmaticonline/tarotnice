import { describe, expect, it } from "vitest";
import { dailyMessage, drawDailyCard, luckyColour } from "../src/lib/daily";

describe("drawDailyCard", () => {
  it("draws ids 0..77 with ~25% reversed", () => {
    let reversed = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const { id, reversed: rev } = drawDailyCard();
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(77);
      seen.add(id);
      if (rev) reversed++;
    }
    expect(seen.size).toBeGreaterThan(70);
    const rate = reversed / 2000;
    expect(rate).toBeGreaterThan(0.18);
    expect(rate).toBeLessThan(0.32);
  });
});

describe("luckyColour", () => {
  it("follows the Thai weekday table", () => {
    // 2026-10-18 Sunday -> red; 10-19 Monday -> yellow; ... 10-24 Saturday -> purple.
    const keys = [18, 19, 20, 21, 22, 23, 24].map(
      (day) => luckyColour(new Date(`2026-10-${day}T05:00:00Z`)).key,
    );
    expect(keys).toEqual(["red", "yellow", "pink", "green", "orange", "blue", "purple"]);
  });

  it("carries both languages", () => {
    const c = luckyColour(new Date("2026-10-18T05:00:00Z"));
    expect(c.en).toBe("Red");
    expect(c.th.length).toBeGreaterThan(0);
  });
});

describe("dailyMessage", () => {
  const card = {
    id: 0, slug: "the-fool", arcana: "major", suit: null, rank: 0,
    imageKey: "cards/major-00", name: "The Fool",
    keywordsUpright: ["beginnings"], keywordsReversed: ["recklessness"],
    upright: "Fresh start text.", reversed: "Pause text.",
  };

  it("falls back to curated text without a model", async () => {
    await expect(dailyMessage({}, card, false, "en")).resolves.toEqual({ text: "Fresh start text.", model: null });
    await expect(dailyMessage({}, card, true, "en")).resolves.toEqual({ text: "Pause text.", model: null });
  });

  it("falls back when AI throws", async () => {
    const env = {
      READING_MODEL: "unit-test-model",
      AI: { run: async () => { throw new Error("down"); } },
    };
    await expect(dailyMessage(env, card, false, "en")).resolves.toEqual({ text: "Fresh start text.", model: null });
  });

  it("uses AI when configured and responding", async () => {
    const env = {
      READING_MODEL: "unit-test-model",
      AI: { run: async () => ({ response: "  AI message here.  " }) },
    };
    await expect(dailyMessage(env, card, false, "en")).resolves.toEqual({ text: "AI message here.", model: "unit-test-model" });
  });
});
