import { describe, expect, it } from "vitest";
import {
  buildReadingPrompt,
  cleanQuestion,
  crisisMessage,
  drawReadingCards,
  classifyCrisis,
  crisisWatchHit,
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
  it("catches the expanded English + Thai phrasings", () => {
    expect(isCrisisQuestion("I want to die")).toBe(true);
    expect(isCrisisQuestion("I just want to end it all")).toBe(true);
    expect(isCrisisQuestion("There is no reason to live anymore")).toBe(true);
    expect(isCrisisQuestion("\u0e44\u0e21\u0e48\u0e2d\u0e22\u0e32\u0e01\u0e2d\u0e22\u0e39\u0e48\u0e41\u0e25\u0e49\u0e27")).toBe(true);
    expect(isCrisisQuestion("\u0e2d\u0e22\u0e32\u0e01\u0e2b\u0e32\u0e22\u0e44\u0e1b")).toBe(true);
    expect(isCrisisQuestion("\u0e42\u0e14\u0e14\u0e15\u0e36\u0e01")).toBe(true);
    expect(isCrisisQuestion("\u0e01\u0e34\u0e19\u0e22\u0e32\u0e15\u0e32\u0e22")).toBe(true);
    expect(crisisWatchHit("Everything feels hopeless lately")).toBe(true);
    expect(crisisWatchHit("Will my business grow this year?")).toBe(false);
  });

  it("classifies via the model and fails open", async () => {
    const yes = async () => ({ response: "YES" });
    const no = async () => ({ response: "NO" });
    const boom = async () => { throw new Error("ai down"); };
    expect(await classifyCrisis(yes, "anything")).toBe(true);
    expect(await classifyCrisis(no, "anything")).toBe(false);
    expect(await classifyCrisis(boom, "anything")).toBe(false);
  });

  it("catches English crisis signals", () => {
    expect(isCrisisQuestion("I want to kill myself")).toBe(true);
    expect(isCrisisQuestion("I have been cutting myself")).toBe(true);
    expect(isCrisisQuestion("he abuses me every night")).toBe(true);
    expect(isCrisisQuestion("will my new job go well?")).toBe(false);
  });

  it("catches Thai crisis signals", () => {
    expect(isCrisisQuestion("\u0e1c\u0e21\u0e2d\u0e22\u0e32\u0e01\u0e06\u0e48\u0e32\u0e15\u0e31\u0e27\u0e15\u0e32\u0e22")).toBe(true);
    expect(isCrisisQuestion("\u0e40\u0e18\u0e2d\u0e16\u0e39\u0e01\u0e17\u0e33\u0e23\u0e49\u0e32\u0e22\u0e17\u0e38\u0e01\u0e27\u0e31\u0e19 \u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23")).toBe(true);
    expect(isCrisisQuestion("\u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e08\u0e30\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23")).toBe(false);
  });

  it("answers supportively with the 1323 hotline in Thai", () => {
    expect(crisisMessage("th")).toContain("1323");
    expect(crisisMessage("th")).not.toContain("\u0e44\u0e1e\u0e48");
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
      lang: "th", topic: "general", question: "\u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e14\u0e35\u0e44\u0e2b\u0e21",
      cards: [toPromptCard(card, false, "general")],
      prev: [], nickname: null,
    });
    expect(system).toContain("\u0e2a\u0e23\u0e38\u0e1b: ");
    expect(user).toContain("\u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e14\u0e35\u0e44\u0e2b\u0e21");
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

  it("times out a stalled stream (SPEC 10.6: 25 s budget)", async () => {
    const stall = new ReadableStream({ start() { /* never yields */ } });
    await expect(async () => {
      for await (const d of streamDeltas(async () => stall, "m", [], 60)) void d;
    }).rejects.toThrow("timeout");
  });

  it("lets a slow drip finish inside the budget", async () => {
    const drip = new ReadableStream({
      async start(c) {
        const enc = new TextEncoder();
        c.enqueue(enc.encode('data: {"response":"a"}\n\n'));
        await new Promise((r) => setTimeout(r, 20));
        c.enqueue(enc.encode('data: {"response":"ab"}\n\n'));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of streamDeltas(async () => drip, "m", [], 2_000)) out.push(d);
    expect(out.join("")).toBe("ab");
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
