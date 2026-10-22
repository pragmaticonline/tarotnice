import { describe, expect, it } from "vitest";
import {
  buildReadingPrompt,
  cleanQuestion,
  crisisMessage,
  drawReadingCards,
  isCrisisQuestion,
  isLang,
  isTopic,
  parseSummary,
  sseEvent,
  streamDeltas,
  toPromptCard,
} from "../src/lib/reading";

describe("question validation", () => {
  it("trims, collapses space, enforces 1..200 chars", () => {
    expect(cleanQuestion("  how will my week go?  ")).toBe("how will my week go?");
    expect(cleanQuestion("a  b")).toBe("a b");
    expect(cleanQuestion("")).toBeNull();
    expect(cleanQuestion("   ")).toBeNull();
    expect(cleanQuestion("x".repeat(200))).toHaveLength(200);
    expect(cleanQuestion("x".repeat(201))).toBeNull();
    expect(cleanQuestion(null)).toBeNull();
  });

  it("rejects HTML tags", () => {
    expect(cleanQuestion("<script>alert(1)</script>")).toBeNull();
    expect(cleanQuestion("love <b>me</b>?")).toBeNull();
    // Bare angle brackets without a tag are fine.
    expect(cleanQuestion("a < b and b > c?")).toBe("a < b and b > c?");
  });

  it("validates topic and lang enums", () => {
    for (const t of ["love", "career", "money", "health", "general"]) expect(isTopic(t)).toBe(true);
    expect(isTopic("wealth")).toBe(false);
    expect(isLang("th")).toBe(true);
    expect(isLang("en")).toBe(true);
    expect(isLang("es")).toBe(false);
  });
});

describe("drawReadingCards", () => {
  it("draws 3 unique cards with ~25% reversed", () => {
    let reversed = 0;
    for (let i = 0; i < 500; i++) {
      const cards = drawReadingCards();
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((c) => c.id)).size).toBe(3);
      for (const c of cards) {
        expect(c.id).toBeGreaterThanOrEqual(0);
        expect(c.id).toBeLessThanOrEqual(77);
        if (c.reversed) reversed++;
      }
    }
    const rate = reversed / 1500;
    expect(rate).toBeGreaterThan(0.18);
    expect(rate).toBeLessThan(0.32);
  });
});

describe("crisis pre-check", () => {
  it("catches English crisis signals", () => {
    expect(isCrisisQuestion("I want to kill myself")).toBe(true);
    expect(isCrisisQuestion("I have been cutting myself")).toBe(true);
    expect(isCrisisQuestion("he abuses me every night")).toBe(true);
    expect(isCrisisQuestion("will my new job go well?")).toBe(false);
  });

  it("catches Thai crisis signals", () => {
    expect(isCrisisQuestion("ผมอยากฆ่าตัวตาย")).toBe(true);
    expect(isCrisisQuestion("เธอถูกทำร้ายทุกวัน ควรทำอย่างไร")).toBe(true);
    expect(isCrisisQuestion("งานใหม่จะเป็นอย่างไร")).toBe(false);
  });

  it("answers supportively with the 1323 hotline in Thai", () => {
    expect(crisisMessage("th")).toContain("1323");
    expect(crisisMessage("th")).not.toContain("ไพ่");
    expect(crisisMessage("en")).toContain("crisis line");
  });
});

describe("prompt builder", () => {
  const card = {
    id: 6, slug: "the-lovers", arcana: "major", suit: null, rank: 6,
    imageKey: "cards/major-06", name: "The Lovers",
    keywordsUpright: ["union"], keywordsReversed: ["misalignment"],
    upright: "Union text.", reversed: "Off-key text.",
    love: "Love note.", career: null, money: null, health: null,
  };

  it("builds server-side prompts with topic notes and continuity", () => {
    const pc = toPromptCard(card, false, "love");
    expect(pc.topicNote).toBe("Love note.");
    expect(toPromptCard(card, true, "career").topicNote).toBeNull();
    const { system, user } = buildReadingPrompt({
      lang: "en", topic: "love", question: "Should we move in?",
      cards: [pc, pc, pc],
      prev: [{ topic: "career", cardNames: ["The Tower"], summary: "Change at work." }],
      nickname: "Ploy",
    });
    expect(system).toContain("No past/present/future framing");
    expect(system).toContain("Summary: ");
    expect(user).toContain("Should we move in?");
    expect(user).toContain("The Lovers");
    expect(user).toContain("Love note.");
    expect(user).toContain("Change at work.");
    expect(user).toContain("Ploy");
  });

  it("writes Thai prompts in Thai", () => {
    const { system, user } = buildReadingPrompt({
      lang: "th", topic: "general", question: "งานใหม่ดีไหม",
      cards: [toPromptCard(card, false, "general")],
      prev: [], nickname: null,
    });
    expect(system).toContain("สรุป: ");
    expect(user).toContain("งานใหม่ดีไหม");
  });
});

describe("parseSummary", () => {
  it("pulls the trailing Summary line", () => {
    const text = "Overview here.\nSome card text.\nSummary: Trust the slow build.";
    expect(parseSummary(text)).toBe("Trust the slow build.");
  });

  it("falls back to the first sentence", () => {
    expect(parseSummary("First wins. Second loses.")).toBe("First wins.");
  });

  it("caps at 140 chars", () => {
    expect(parseSummary("Summary: " + "x".repeat(200))).toHaveLength(140);
  });
});

describe("streamDeltas", () => {
  it("parses OpenAI-style SSE chunks", async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
      "data: [DONE]\n\n";
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of streamDeltas(async () => new Response(body), "m", [])) out.push(d);
    expect(out.join("")).toBe("Hello world");
    // Workers AI returns the raw ReadableStream for stream:true.
    const body2 = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("data: {\"response\":\"raw stream\"}\n\n"));
        c.close();
      },
    });
    const out2: string[] = [];
    for await (const d of streamDeltas(async () => body2, "m", [])) out2.push(d);
    expect(out2).toEqual(["raw stream"]);
  });

  it("accepts plain {response} fallbacks", async () => {
    const fake = async () => ({ response: "full text" });
    const out: string[] = [];
    for await (const d of streamDeltas(fake, "m", [])) out.push(d);
    expect(out).toEqual(["full text"]);
  });

  it("dedupes cumulative and double-carried chunks", async () => {
    const sse =
      'data: {"response":"Hello","choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"response":"Hello world","choices":[{"delta":{"content":"Hello world"}}]}\n\n';
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of streamDeltas(async () => body, "m", [])) out.push(d);
    expect(out.join("")).toBe("Hello world");
  });
});

describe("sseEvent", () => {
  it("frames SSE events", () => {
    expect(sseEvent("done", '{"a":1}')).toBe('event: done\ndata: {"a":1}\n\n');
  });
});
