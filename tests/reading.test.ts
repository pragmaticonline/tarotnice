import { describe, expect, it } from "vitest";
import {
  alienCardNames,
  appendUnique,
  buildReadingPrompt,
  cleanQuestion,
  crisisMessage,
  drawReadingCards,
  extractOptions,
  guessTopic,
  classifyCrisis,
  crisisWatchHit,
  isCrisisQuestion,
  isLang,
  isTopic,
  hasSummaryLine,
  isCompleteReading,
  missingCardNames,
  normalizeCardSummaries,
  parseSummary,
  pickSpread,
  pickAnchor,
  sseEvent,
  streamDeltas,
  toPromptCard,
  inputShape,
} from "../src/lib/reading";

describe("question validation", () => {
  it("trims, collapses space, enforces 1..300 chars (board counter)", () => {
    expect(cleanQuestion("  how will my week go?  ")).toBe("how will my week go?");
    expect(cleanQuestion("a  b")).toBe("a b");
    expect(cleanQuestion("")).toBeNull();
    expect(cleanQuestion("   ")).toBeNull();
    expect(cleanQuestion("x".repeat(300))).toHaveLength(300);
    expect(cleanQuestion("x".repeat(301))).toBeNull();
    expect(cleanQuestion(null)).toBeNull();
  });

  it("rejects HTML tags", () => {
    expect(cleanQuestion("<script>alert(1)</script>")).toBeNull();
    expect(cleanQuestion("love <b>me</b>?")).toBeNull();
    // Bare angle brackets without a tag are fine.
    expect(cleanQuestion("a < b and b > c?")).toBe("a < b and b > c?");
  });

  it("guesses topic from wording so typed questions land on the right history tab", () => {
    expect(guessTopic("will i find love?")).toBe("love");
    expect(guessTopic("will i be rich?")).toBe("money");
    expect(guessTopic("should I take the new job?")).toBe("career");
    expect(guessTopic("how can I feel less stressed?")).toBe("health");
    expect(guessTopic("what should I focus on this week?")).toBe("general");
    expect(guessTopic("Should I buy this tarot deck?")).toBe("general");
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

  it("uses the English card name in prompts even for Thai readings", () => {
    const thCard = { ...card, name: "\u0e04\u0e39\u0e48\u0e23\u0e31\u0e01", nameEn: "The Lovers" };
    expect(toPromptCard(thCard, false, "general").name).toBe("The Lovers");
    const { system, user } = buildReadingPrompt({
      lang: "th", topic: "general", question: "?",
      cards: [toPromptCard(thCard, false, "general")],
      prev: [], nickname: null,
    });
    expect(user).toContain("The Lovers");
    expect(system).toContain("Two of Wands");
  });

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
    expect(system).toContain("Never");
    expect(system).toContain("Explore further");
    expect(system).toContain("Summary: ");
    expect(user).toContain("Should we move in?");
    expect(user).toContain("The Lovers");
    expect(user).toContain("Love note.");
    expect(user).toContain("Change at work.");
    expect(user).toContain("Ploy");
  });

  it("passes imagery through and prints it on the card line", () => {
    const withImg = { ...card, imagery: "A fool at a cliff edge with a white dog." };
    const pc = toPromptCard(withImg, false, "general");
    expect(pc.imagery).toBe("A fool at a cliff edge with a white dog.");
    const { user } = buildReadingPrompt({
      lang: "en", topic: "general", question: "What lies ahead?",
      cards: [pc, pc, pc],
      prev: [], nickname: null,
    });
    expect(user).toContain("Imagery: A fool at a cliff edge with a white dog.");
  });

  it("instructs the model to ground cards in their imagery (en+th)", () => {
    for (const lang of ["en", "th"] as const) {
      const { system } = buildReadingPrompt({
        lang, topic: "general", question: "What lies ahead?",
        cards: [toPromptCard(card, false, "general")],
        prev: [], nickname: null,
      });
      expect(system).toContain(lang === "en" ? "CARD IMAGERY" : "Imagery");
    }
    const { system } = buildReadingPrompt({
      lang: "en", topic: "general", question: "What lies ahead?",
      cards: [toPromptCard(card, false, "general")],
      prev: [], nickname: null,
    });
    expect(system).toContain("Never invent details.");
    expect(system).toContain("DO NOT describe the pictures");
  });

  it("asks the question-first and one-story shape in both languages", () => {
    const en = buildReadingPrompt({
      lang: "en", topic: "general", question: "Will we match?",
      cards: [toPromptCard(card, false, "general")],
      prev: [], nickname: null,
    }).system;
    for (const marker of [
      "HOW NGERN READS",
      "STEP 1 \u2014 UNDERSTAND THE QUESTION FIRST",
      "TRANSLATE, DON'T COPY",
      "STEP 3 \u2014 READ THE THREE CARDS",
      "DO NOT describe the pictures",
      "STEP 6 \u2014 OUTPUT",
      "NGERN'S VOICE",
      "Your energy",
    ]) expect(en).toContain(marker);
    expect(en).not.toMatch(/[\u0e00-\u0e7f]/);
    const th = buildReadingPrompt({
      lang: "th", topic: "general", question: "\u0e2a\u0e33\u0e23\u0e31\u0e1a\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22\u0e40\u0e02\u0e49\u0e32\u0e01\u0e31\u0e19\u0e44\u0e2b\u0e21",
      cards: [toPromptCard(card, false, "general")],
      prev: [], nickname: null,
    }).system;
    for (const marker of [
      "\u0e27\u0e34\u0e18\u0e35\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e02\u0e2d\u0e07\u0e19\u0e49\u0e2d\u0e07\u0e40\u0e07\u0e34\u0e19", "STEP 1 \u2014 \u0e40\u0e02\u0e49\u0e32\u0e43\u0e08\u0e04\u0e33\u0e16\u0e32\u0e21\u0e01\u0e48\u0e2d\u0e19", "\u0e2d\u0e22\u0e48\u0e32\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22\u0e20\u0e32\u0e1e\u0e43\u0e2b\u0e49\u0e1c\u0e39\u0e49\u0e43\u0e0a\u0e49\u0e1f\u0e31\u0e07", "\u0e2a\u0e23\u0e38\u0e1b: ", "\u0e40\u0e2a\u0e35\u0e22\u0e07\u0e02\u0e2d\u0e07\u0e19\u0e49\u0e2d\u0e07\u0e40\u0e07\u0e34\u0e19",
    ]) expect(th).toContain(marker);
  });

  it("tells the Thai prompt to spell every word completely (no dropped letters)", () => {
    const { system } = buildReadingPrompt({
      lang: "th", topic: "general", question: "What lies ahead?",
      cards: [toPromptCard(card, false, "general")],
      prev: [], nickname: null,
    });
    expect(system).toContain("\u0e04\u0e27\u0e32\u0e21\u0e21\u0e31\u0e48\u0e19\u0e04\u0e07");
    expect(system).toContain("\u0e01\u0e32\u0e23\u0e2d\u0e2d\u0e21");
    expect(system).toContain("\u0e04\u0e27\u0e1a\u0e04\u0e38\u0e21");
  });

  it("omits the imagery line when the card has none", () => {
    const pc = toPromptCard(card, false, "general");
    expect(pc.imagery).toBeNull();
    const { user } = buildReadingPrompt({
      lang: "en", topic: "general", question: "What lies ahead?",
      cards: [pc, pc, pc],
      prev: [], nickname: null,
    });
    expect(user).not.toContain("Imagery:");
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

describe("pickSpread", () => {
  it("picks a compatibility spread for fit questions (en+th)", () => {
    expect(pickSpread("Will we match?", "general", "en")).toEqual([
      "Your energy",
      "Its energy",
      "The fit",
    ]);
    expect(pickSpread("\u0e2a\u0e33\u0e23\u0e31\u0e1a\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22\u0e40\u0e02\u0e49\u0e32\u0e01\u0e31\u0e19\u0e44\u0e2b\u0e21", "general", "th")).toEqual([
      "\u0e1e\u0e25\u0e31\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
      "\u0e1e\u0e25\u0e31\u0e07\u0e02\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e1d\u0e48\u0e32\u0e22",
      "\u0e04\u0e27\u0e32\u0e21\u0e40\u0e02\u0e49\u0e32\u0e01\u0e31\u0e19",
    ]);
    // A deck question stays on the deck, never drifting to decisions.
    expect(pickSpread("Is this deck good for beginners?", "general", "en")).toEqual([
      "Your energy",
      "Its energy",
      "The fit",
    ]);
  });

  it("reads should-I questions as yes-no", () => {
    expect(pickSpread("Should I quit my job?", "career", "en")).toEqual([
      "What supports",
      "What blocks",
      "Likely answer",
    ]);
  });

  it("reads Thai should-I questions as yes-no", () => {
    expect(pickSpread("\u0e04\u0e27\u0e23\u0e25\u0e32\u0e2d\u0e2d\u0e01\u0e14\u0e35\u0e44\u0e2b\u0e21", "career", "th")).toEqual([
      "\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e38\u0e19",
      "\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e02\u0e27\u0e32\u0e07",
      "\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e04\u0e33\u0e15\u0e2d\u0e1a",
    ]);
  });

  it("picks a get-back spread for come-back questions", () => {
    expect(pickSpread("Will we get back together?", "love", "en")).toEqual([
      "What pulls you together",
      "What pushes apart",
      "What needs care",
    ]);
  });

  it("picks relationship positions for love topics", () => {
    expect(pickSpread("My partner and I keep fighting", "love", "en")).toEqual([
      "You",
      "The other side",
      "The relationship",
    ]);
  });

  it("picks a timeline spread for how-will-it-go questions", () => {
    expect(pickSpread("How will my month go?", "general", "en")).toEqual([
      "Past",
      "Present",
      "Future",
    ]);
  });

  it("picks a timeline spread for about-to / going-to questions (en+th)", () => {
    const future = ["Past", "Present", "Future"];
    expect(pickSpread("What kind of disaster am I about to face?", "general", "en")).toEqual(future);
    expect(pickSpread("What is going to happen with my job?", "general", "en")).toEqual(future);
    expect(pickSpread("\u0e0a\u0e48\u0e27\u0e07\u0e19\u0e35\u0e49\u0e08\u0e30\u0e40\u0e08\u0e2d\u0e2d\u0e30\u0e44\u0e23", "general", "th")).toEqual(["\u0e2d\u0e14\u0e35\u0e15", "\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19", "\u0e2d\u0e19\u0e32\u0e04\u0e15"]);
    expect(pickSpread("\u0e01\u0e33\u0e25\u0e31\u0e07\u0e08\u0e30\u0e40\u0e01\u0e34\u0e14\u0e2d\u0e30\u0e44\u0e23\u0e02\u0e36\u0e49\u0e19\u0e01\u0e31\u0e1a\u0e07\u0e32\u0e19", "general", "th")).toEqual(["\u0e2d\u0e14\u0e35\u0e15", "\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19", "\u0e2d\u0e19\u0e32\u0e04\u0e15"]);
  });

  it("falls back to a general spread", () => {
    expect(pickSpread("What do I need to know right now?", "general", "en")).toEqual([
      "The situation",
      "What to handle",
      "Advice",
    ]);
  });

  it("extracts two options from choice questions (en+th)", () => {
    expect(extractOptions("Tea or coffee?")).toEqual(["Tea", "coffee"]);
    expect(extractOptions("Should I stay or go?")).toEqual(["stay", "go"]);
    expect(extractOptions("\u0e04\u0e27\u0e23\u0e25\u0e32\u0e2d\u0e2d\u0e01\u0e2b\u0e23\u0e37\u0e2d\u0e2d\u0e22\u0e39\u0e48\u0e15\u0e48\u0e2d")).toEqual(["\u0e25\u0e32\u0e2d\u0e2d\u0e01", "\u0e2d\u0e22\u0e39\u0e48\u0e15\u0e48\u0e2d"]);
    expect(extractOptions("Will he come back or not?")).toBeNull();
    expect(extractOptions("What should I focus on this week?")).toBeNull();
  });

  it("extracts three options for choice-of-3", () => {
    expect(extractOptions("\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22 vs \u0e17\u0e2d\u0e18 vs \u0e2a\u0e21\u0e34\u0e18")).toEqual(["\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22", "\u0e17\u0e2d\u0e18", "\u0e2a\u0e21\u0e34\u0e18"]);
  });

  it("names the options in choice spreads (en+th)", () => {
    expect(pickSpread("Tea or coffee?", "general", "en")).toEqual([
      "Option A: Tea",
      "The heart of the matter",
      "Option B: coffee",
    ]);
    expect(pickSpread("\u0e04\u0e27\u0e23\u0e25\u0e32\u0e2d\u0e2d\u0e01\u0e2b\u0e23\u0e37\u0e2d\u0e2d\u0e22\u0e39\u0e48\u0e15\u0e48\u0e2d", "general", "th")).toEqual([
      "\u0e17\u0e32\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01 A: \u0e25\u0e32\u0e2d\u0e2d\u0e01",
      "\u0e2b\u0e31\u0e27\u0e43\u0e08\u0e02\u0e2d\u0e07\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
      "\u0e17\u0e32\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01 B: \u0e2d\u0e22\u0e39\u0e48\u0e15\u0e48\u0e2d",
    ]);
    expect(pickSpread("\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22 vs \u0e17\u0e2d\u0e18 vs \u0e2a\u0e21\u0e34\u0e18", "general", "th")).toEqual(["\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22", "\u0e17\u0e2d\u0e18", "\u0e2a\u0e21\u0e34\u0e18"]);
  });

  it("reads yes-no and fit questions by type (en+th)", () => {
    expect(pickSpread("Will I pass the exam?", "general", "en")).toEqual([
      "What supports",
      "What blocks",
      "Likely answer",
    ]);
    expect(pickSpread("\u0e08\u0e30\u0e2a\u0e2d\u0e1a\u0e1c\u0e48\u0e32\u0e19\u0e44\u0e2b\u0e21", "general", "th")).toEqual(["\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e38\u0e19", "\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e02\u0e27\u0e32\u0e07", "\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e04\u0e33\u0e15\u0e2d\u0e1a"]);
    expect(pickSpread("\u0e40\u0e23\u0e32\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e01\u0e31\u0e19\u0e44\u0e2b\u0e21", "general", "th")).toEqual(["\u0e1e\u0e25\u0e31\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13", "\u0e1e\u0e25\u0e31\u0e07\u0e02\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e1d\u0e48\u0e32\u0e22", "\u0e04\u0e27\u0e32\u0e21\u0e40\u0e02\u0e49\u0e32\u0e01\u0e31\u0e19"]);
  });

  it("covers goal, problem, feelings, lost-object and what-to-do questions", () => {
    expect(pickSpread("How can I achieve my goal?", "general", "en")[0]).toBe("Where you are");
    expect(pickSpread("I feel stuck at work", "general", "en")[0]).toBe("The root cause");
    expect(pickSpread("I am feeling anxious lately", "general", "en")[0]).toBe("Thoughts");
    expect(pickSpread("Where did I lose my keys?", "general", "en")).toEqual([
      "What was lost",
      "Where to look",
      "How to find it",
    ]);
    expect(pickSpread("What should I do about this?", "general", "en")[0]).toBe("Stop");
    expect(pickSpread("\u0e01\u0e38\u0e0d\u0e41\u0e08\u0e2b\u0e32\u0e22\u0e44\u0e1b\u0e44\u0e2b\u0e19", "general", "th")).toEqual(["\u0e17\u0e35\u0e48\u0e2b\u0e32\u0e22\u0e44\u0e1b", "\u0e17\u0e35\u0e48\u0e17\u0e35\u0e48\u0e04\u0e27\u0e23\u0e2b\u0e32", "\u0e27\u0e34\u0e18\u0e35\u0e40\u0e08\u0e2d"]);
    expect(pickSpread("\u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23\u0e14\u0e35", "general", "th")[0]).toBe("\u0e2b\u0e22\u0e38\u0e14");
  });

  it("classifies FIND by question word, not the polite ending (en+th)", () => {
    const q = "\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2a\u0e48\u0e27\u0e19\u0e44\u0e2b\u0e19\u0e02\u0e2d\u0e07 TarotNice \u0e17\u0e35\u0e48\u0e09\u0e31\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e0a\u0e31\u0e14\u0e40\u0e08\u0e19\u0e01\u0e27\u0e48\u0e32\u0e19\u0e35\u0e49\u0e01\u0e48\u0e2d\u0e19\u0e40\u0e23\u0e34\u0e48\u0e21\u0e42\u0e06\u0e29\u0e13\u0e32\u0e44\u0e2b\u0e21?";
    expect(guessTopic(q)).toBe("find");
    expect(pickSpread(q, guessTopic(q), "th")).toEqual(["\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e14\u0e35\u0e2d\u0e22\u0e39\u0e48\u0e41\u0e25\u0e49\u0e27", "\u0e08\u0e38\u0e14\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e41\u0e01\u0e49", "\u0e04\u0e27\u0e23\u0e40\u0e23\u0e34\u0e48\u0e21\u0e08\u0e32\u0e01"]);
    expect(guessTopic("Is there anything I should fix before running ads?")).toBe("find");
    expect(pickSpread("Is there anything I should fix before running ads?", "find", "en")).toEqual([
      "What's already working",
      "What needs fixing",
      "Where to start",
    ]);
    // A plain yes/no keeps the yes-no spread, never FIND.
    expect(guessTopic("Should I start ads this month?")).not.toBe("find");
    expect(pickSpread("Should I start ads this month?", "general", "en")).toEqual([
      "What supports",
      "What blocks",
      "Likely answer",
    ]);
  });

  it("classifies why/how/when by question word (server-side)", () => {
    expect(pickSpread("Why is this happening?", "general", "en")[0]).toBe("The root cause");
    expect(pickSpread("How can I reach my goal?", "general", "en")[0]).toBe("Where you are");
    expect(pickSpread("When will things improve?", "general", "en")).toEqual(["Past", "Present", "Future"]);
  });

  it("is deterministic: same question always yields the same spread", () => {
    const q = "Should I move to a new city?";
    expect(pickSpread(q, "general", "en")).toEqual(pickSpread(q, "general", "en"));
  });

  it("reads will-questions as yes-no even for career/money topics", () => {
    expect(pickSpread("Will my husband's salary increase?", "career", "en")).toEqual([
      "What supports",
      "What blocks",
      "Likely answer",
    ]);
    expect(pickSpread("\u0e40\u0e07\u0e34\u0e19\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e02\u0e2d\u0e07\u0e2a\u0e32\u0e21\u0e35\u0e08\u0e30\u0e02\u0e36\u0e49\u0e19\u0e44\u0e2b\u0e21", "money", "th")).toEqual([
      "\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e38\u0e19",
      "\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e02\u0e27\u0e32\u0e07",
      "\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e04\u0e33\u0e15\u0e2d\u0e1a",
    ]);
  });

  it("labels prompt cards with their spread positions", () => {
    const pc = toPromptCard(
      {
        id: 6, slug: "the-lovers", arcana: "major", suit: null, rank: 6,
        imageKey: "cards/major-06", name: "The Lovers",
        keywordsUpright: ["union"], keywordsReversed: ["misalignment"],
        upright: "Union text.", reversed: "Off-key text.",
        love: null, career: null, money: null, health: null,
      },
      false,
      "general",
    );
    const { user } = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [pc, pc, pc], prev: [], nickname: null,
    });
    expect(user).toContain("What supports");
    expect(user).toContain("Card 1");
  });

  it("declares Normal vs Care mode in the system prompt", () => {
    const { system } = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(system).toContain("Normal mode");
    expect(system).toContain("Care mode");
  });

  it("never tells the user which mode applied (en + th)", () => {
    for (const lang of ["en", "th"] as const) {
      const { system } = buildReadingPrompt({
        lang, topic: "general", question: "Should I quit my job?",
        cards: [], prev: [], nickname: null,
      });
      expect(system).toMatch(/never mention modes|\u0e2b\u0e49\u0e32\u0e21\u0e40\u0e2d\u0e48\u0e22\u0e16\u0e36\u0e07\u0e42\u0e2b\u0e21\u0e14/i);
    }
  });

  it("teaches story links and timing from RWS canon", () => {
    for (const lang of ["en", "th"] as const) {
      const { system } = buildReadingPrompt({
        lang, topic: "general", question: "Should I quit my job?",
        cards: [], prev: [], nickname: null,
      });
      expect(system).toMatch(/cause \/ contrast \/ progression|\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e14\u0e49\u0e27\u0e22\u0e04\u0e33\u0e1a\u0e2d\u0e01\u0e40\u0e2b\u0e15\u0e38/u);
      expect(system).toMatch(/Wands days to weeks|\u0e44\u0e21\u0e49\u0e04\u0e37\u0e2d\u0e27\u0e31\u0e19\u0e16\u0e36\u0e07\u0e2a\u0e31\u0e1b\u0e14\u0e32\u0e2b\u0e4c/u);
    }
  });

  it("puts the Summary first, then card stories, with no Overview", () => {
    const en = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(en.system).toContain("The Summary line comes FIRST");
    expect(en.system).not.toContain("Overview:");
    expect(en.system).toContain("For each card, in draw order");
    expect(en.system).toContain("2\u20133 sentences");
    expect(en.system).toContain("exactly 2 follow-up questions");
    expect(en.system).toContain("If the user message names a key card, build the reading around it");
    expect(en.system).not.toContain("**What next:**");
    const th = buildReadingPrompt({
      lang: "th", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(th.system).toContain("\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14\u0e2a\u0e23\u0e38\u0e1b\u0e21\u0e32\u0e01\u0e48\u0e2d\u0e19");
    expect(th.system).not.toContain("\u0e40\u0e23\u0e34\u0e48\u0e21\u0e14\u0e49\u0e27\u0e22\u0e43\u0e08\u0e04\u0e27\u0e32\u0e21\u0e2b\u0e25\u0e31\u0e01");
    expect(th.user).toContain("\u0e22\u0e48\u0e2d\u0e2b\u0e19\u0e49\u0e32\u0e44\u0e1e\u0e48\u0e15\u0e32\u0e21\u0e25\u0e33\u0e14\u0e31\u0e1a 1 2 3");
    expect(en.user).toContain("in order 1-2-3 in plain words");
  });

  it("encodes HOW NGERN READS steps in both languages", () => {
    for (const lang of ["en", "th"] as const) {
      const { system } = buildReadingPrompt({
        lang, topic: "general", question: "Should I quit my job?",
        cards: [], prev: [], nickname: null,
      });
      expect(system).toContain("STEP 2");
      expect(system).toContain("STEP 4");
    }
    const en = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(en.system).toContain("HOW NGERN READS (replaces ALL older reading-method rules)");
    expect(en.system).toContain("STEP 1 \u2014 UNDERSTAND THE QUESTION FIRST");
    expect(en.system).toContain("STEP 5 \u2014 ANSWER TYPES");
    expect(en.system).toContain("No closing paragraph that repeats the Summary");
    expect(en.system).toContain("the opposite meaning (last resort)");
    const th = buildReadingPrompt({
      lang: "th", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(th.system).toContain("\u0e27\u0e34\u0e18\u0e35\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e02\u0e2d\u0e07\u0e19\u0e49\u0e2d\u0e07\u0e40\u0e07\u0e34\u0e19");
    expect(th.system).toContain("STEP 4 \u2014 \u0e44\u0e1e\u0e48\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27");
    expect(th.system).toContain("\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14\u0e2a\u0e23\u0e38\u0e1b\u0e21\u0e32\u0e01\u0e48\u0e2d\u0e19");
    expect(th.system).toContain("\u0e44\u0e21\u0e48\u0e21\u0e35\u0e22\u0e48\u0e2d\u0e2b\u0e19\u0e49\u0e32\u0e1b\u0e34\u0e14\u0e17\u0e49\u0e32\u0e22\u0e17\u0e35\u0e48\u0e1e\u0e39\u0e14\u0e2a\u0e23\u0e38\u0e1b\u0e0b\u0e49\u0e33");
  });

  it("derives guidance from the whole spread in both languages", () => {
    const en = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(en.system).toContain("combined message of the spread");
    expect(en.system).toContain("never from a single card's meaning");
    expect(en.system).toContain("stay inside the question's scope");
    const th = buildReadingPrompt({
      lang: "th", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(th.system).toContain("\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21\u0e02\u0e2d\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e31\u0e49\u0e07\u0e2a\u0e33\u0e23\u0e31\u0e1a");
    expect(th.system).toContain("\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e08\u0e32\u0e01\u0e44\u0e1e\u0e48\u0e43\u0e1a\u0e40\u0e14\u0e35\u0e22\u0e27");
    expect(th.system).toContain("\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e02\u0e2d\u0e1a\u0e40\u0e02\u0e15\u0e04\u0e33\u0e16\u0e32\u0e21");
  });

  it("reads pictures without inventing in both languages", () => {
    const en = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    for (const phrase of [
      "colours (red = action",
      "facing direction",
      "Never invent details",
      "let the number add meaning",
      "Wheel of Fortune = depends on timing",
      "STEP 5",
    ]) expect(en.system).toContain(phrase);
    const th = buildReadingPrompt({
      lang: "th", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    for (const phrase of [
      "\u0e2a\u0e35 (\u0e41\u0e14\u0e07 = \u0e25\u0e07\u0e21\u0e37\u0e2d\u0e17\u0e33",
      "\u0e17\u0e34\u0e28\u0e17\u0e35\u0e48\u0e2b\u0e31\u0e19",
      "\u0e2b\u0e49\u0e32\u0e21\u0e41\u0e15\u0e48\u0e07\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e40\u0e1e\u0e34\u0e48\u0e21",
      "\u0e44\u0e1e\u0e48\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27\u0e21\u0e31\u0e01\u0e19\u0e31\u0e1a\u0e27\u0e48\u0e32\u0e22\u0e32\u0e01",
      "\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e01\u0e27\u0e48\u0e32 \u0e40\u0e1e\u0e23\u0e32\u0e30",
    ]) expect(th.system).toContain(phrase);
  });

  it("organises the method as HOW NGERN READS steps", () => {
    const en = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    for (const step of [
      "HOW NGERN READS",
      "STEP 2 \u2014 CHOOSE POSITIONS BY TYPE",
      "STEP 3 \u2014 READ THE THREE CARDS",
      "STEP 5 \u2014 ANSWER TYPES",
      "STEP 6 \u2014 OUTPUT",
      "Fit / compatibility",
      "Choice of 2 (A vs B)",
    ]) expect(en.system).toContain(step);
    const th = buildReadingPrompt({
      lang: "th", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(th.system).toContain("\u0e27\u0e34\u0e18\u0e35\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e02\u0e2d\u0e07\u0e19\u0e49\u0e2d\u0e07\u0e40\u0e07\u0e34\u0e19");
    expect(th.system).toContain("STEP 2 \u2014 \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e15\u0e32\u0e21\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17\u0e04\u0e33\u0e16\u0e32\u0e21");
    expect(th.system).toContain("\u0e40\u0e02\u0e49\u0e32\u0e01\u0e31\u0e19\u0e44\u0e14\u0e49\u0e44\u0e2b\u0e21");
    expect(th.system).toContain("\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14\u0e2a\u0e23\u0e38\u0e1b\u0e21\u0e32\u0e01\u0e48\u0e2d\u0e19");
    expect(th.system).toContain("\u0e40\u0e17\u0e27\u0e32\u0e25\u0e31\u0e22\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e01\u0e27\u0e48\u0e32 \u0e40\u0e1e\u0e23\u0e32\u0e30");
  });

  it("keeps mode names, numbers and energy summaries out of the structure", () => {
    const { system } = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I quit my job?",
      cards: [], prev: [], nickname: null,
    });
    expect(system).not.toContain("Normal mode starts");
    expect(system).not.toContain("One paragraph per card");
    expect(system).not.toContain("dominant suit/element");
    expect(system).not.toMatch(/[0-9]\) Overview/);
    expect(system).toContain("stay inside the question's scope");
    expect(system).toContain("Name the question's subject");
    expect(system).toContain("2\u20133 sentences");
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

  it("fallback summary strips the section header and does not cut mid-word", () => {
    const thHead = "\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21";
    const body = "\u0e0a\u0e48\u0e27\u0e07\u0e19\u0e35\u0e49\u0e04\u0e38\u0e13\u0e21\u0e35\u0e1e\u0e25\u0e31\u0e07\u0e43\u0e2b\u0e21\u0e48\u0e46 \u0e17\u0e35\u0e48\u0e04\u0e2d\u0e22\u0e01\u0e23\u0e30\u0e15\u0e38\u0e49\u0e19\u0e43\u0e2b\u0e49\u0e04\u0e38\u0e13\u0e2b\u0e32\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e43\u0e2b\u0e21\u0e48\u0e46 \u0e2d\u0e22\u0e39\u0e48\u0e40\u0e2a\u0e21\u0e2d \u0e40\u0e21\u0e37\u0e48\u0e2d\u0e04\u0e38\u0e13\u0e23\u0e39\u0e49\u0e2a\u0e36\u0e01\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08\u0e41\u0e25\u0e30\u0e40\u0e15\u0e34\u0e21\u0e40\u0e15\u0e47\u0e21\u0e43\u0e19\u0e14\u0e49\u0e32\u0e19\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e41\u0e25\u0e49\u0e27 \u0e01\u0e47\u0e16\u0e36\u0e07\u0e40\u0e27\u0e25\u0e32\u0e17\u0e35\u0e48\u0e08\u0e30\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e1c\u0e08\u0e0d\u0e20\u0e31\u0e22\u0e04\u0e23\u0e31\u0e49\u0e07\u0e15\u0e48\u0e2d\u0e44\u0e1b\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e21\u0e32\u0e01\u0e21\u0e32\u0e22";
    const out = parseSummary(thHead + ":\n\n" + body);
    expect(out.startsWith(thHead)).toBe(false);
    expect(out).not.toContain("\n");
    expect(body.startsWith(out.slice(0, -1)) || out.length <= 140).toBe(true);
    expect(out.length).toBeLessThanOrEqual(140);
    // Ends at a word boundary (space in Thai text), not mid-word.
    expect(body.charAt(out.length) === " " || out.length >= body.length).toBe(true);
  });

  it("never cuts a Thai summary mid-word on the main path", () => {
    const sentence = "\u0e21\u0e35\u0e42\u0e2d\u0e01\u0e32\u0e2a\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e40\u0e07\u0e34\u0e19\u0e41\u0e25\u0e30\u0e07\u0e32\u0e19\u0e1c\u0e48\u0e32\u0e19\u0e04\u0e27\u0e32\u0e21\u0e0a\u0e48\u0e27\u0e22\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e08\u0e32\u0e01\u0e04\u0e19\u0e04\u0e38\u0e49\u0e19\u0e40\u0e04\u0e22 \u0e41\u0e15\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23\u0e04\u0e27\u0e32\u0e21\u0e27\u0e38\u0e48\u0e19\u0e27\u0e32\u0e22\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e08\u0e31\u0e14\u0e2a\u0e23\u0e23\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e32\u0e01\u0e23\u0e41\u0e25\u0e30\u0e1b\u0e31\u0e0d\u0e2b\u0e32\u0e01\u0e32\u0e23\u0e17\u0e33\u0e07\u0e32\u0e19\u0e23\u0e48\u0e27\u0e21\u0e01\u0e31\u0e1a\u0e1c\u0e39\u0e49\u0e2d\u0e37\u0e48\u0e19\u0e43\u0e2b\u0e49\u0e25\u0e07\u0e15\u0e31\u0e27\u0e01\u0e48\u0e2d\u0e19\u0e04\u0e48\u0e30";
    const out = parseSummary("\u0e2a\u0e23\u0e38\u0e1b: " + sentence);
    expect(out.length).toBeLessThanOrEqual(140);
    // The exact live breakage: the cut must not strand a broken tail.
    expect(out).not.toContain("\u0e25\u0e07\u0e15\u0e31\u0e27\u0e01\u0e48");
    // Cut lands on a word boundary of the source sentence.
    expect(sentence.startsWith(out)).toBe(true);
    const rest = sentence.slice(out.length);
    expect(rest === "" || rest[0] === " ").toBe(true);
  });

  it("never strands a combining mark in spaceless text", () => {
    const s = "\u0e01" + "\u0e02".repeat(138) + "\u0e48\u0e04\u0e07";
    const out = parseSummary("\u0e2a\u0e23\u0e38\u0e1b: " + s);
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.length).toBeGreaterThan(130);
    const parts = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(out)].map((g) => g.segment);
    for (const p of parts) expect(/^[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]$/u.test(p)).toBe(false);
  });

  it("cuts English summaries at a word boundary on the main path", () => {
    const sentence = "The quick brown fox jumps over the lazy dog. ".repeat(5).trim();
    const out = parseSummary("Summary: " + sentence);
    expect(out.length).toBeLessThanOrEqual(140);
    expect(sentence.startsWith(out)).toBe(true);
    const rest = sentence.slice(out.length);
    expect(rest === "" || rest[0] === " ").toBe(true);
  });

  it("hasSummaryLine detects plain and bold summary lines only", () => {
    expect(hasSummaryLine("Body.\nSummary: done.")).toBe(true);
    expect(hasSummaryLine("Body.\n**\u0e2a\u0e23\u0e38\u0e1b:** done.")).toBe(true);
    expect(hasSummaryLine("Body with no closing line at all")).toBe(false);
  });

  it("hasSummaryLine only counts the closing line, not per-card closers", () => {
    expect(hasSummaryLine("Card text.\nSummary: per-card closer.\nMore text.")).toBe(false);
    expect(hasSummaryLine("Card text.\nSummary: per-card closer.\nSummary: final.")).toBe(true);
  });

  it("normalizeCardSummaries folds echoed closers into Summary lines with a gap", () => {
    expect(
      normalizeCardSummaries(
        "1 · Q — **The Star**: Hope returns.\nSummary of this card's message for the question: keep hoping.",
      ),
    ).toBe("1 · Q — **The Star**: Hope returns.\n\nSummary: keep hoping.");
    expect(
      normalizeCardSummaries("Hope returns. Summary of this card's message for the question: keep going."),
    ).toBe("Hope returns.\n\nSummary: keep going.");
  });

  it("normalizeCardSummaries is idempotent and leaves real closings alone", () => {
    expect(normalizeCardSummaries("Body.\n\nSummary: done.")).toBe("Body.\n\nSummary: done.");
    const once = normalizeCardSummaries("Para one.\nSummary of this card's message for the question: x.");
    expect(normalizeCardSummaries(once)).toBe(once);
  });

  it("normalizeCardSummaries handles the Thai closer", () => {
    const TH = (...codes: number[]) => String.fromCharCode(...codes);
    const sum = TH(0x0e2a, 0x0e23, 0x0e38, 0x0e1b);
    const forQ = TH(0x0e2a, 0x0e33, 0x0e2b, 0x0e23, 0x0e31, 0x0e1a, 0x0e04, 0x0e33, 0x0e16, 0x0e32, 0x0e21);
    expect(normalizeCardSummaries("Para one.\n" + sum + " test " + forQ + ": ok")).toBe(
      "Para one.\n\n" + sum + ": ok",
    );
  });

  it("alienCardNames flags translated card names absent from the source", () => {
    const cardWord = String.fromCharCode(0x0e44, 0x0e1e, 0x0e48);
    expect(alienCardNames("Guidance: trust the process.", cardWord + " The Fool brings change.")).toEqual([
      "The Fool",
    ]);
  });

  it("alienCardNames ignores drawn names and plain prose", () => {
    const cardWord = String.fromCharCode(0x0e44, 0x0e1e, 0x0e48);
    expect(alienCardNames("The Star brings hope.", cardWord + " The Star brings hope.")).toEqual([]);
    expect(alienCardNames("Trust the process.", "Trust the process.")).toEqual([]);
  });

  it("isCompleteReading accepts a full structure without a Summary line, rejects early stops", () => {
    const full = "Overview text. ".repeat(60) + "\n\n**Guidance:** do this.\n\n**What to do:**\n- one\n- two";
    expect(isCompleteReading(full)).toBe(true);
    expect(isCompleteReading("Body.\nSummary: done.")).toBe(true);
    expect(isCompleteReading("Overview only, stopped early. ")).toBe(false);
    expect(isCompleteReading("short")).toBe(false);
  });

  it("missingCardNames flags a transliterated card name, passes kept ones", () => {
    const names = ["King of Pentacles", "Two of Wands", "The Fool"];
    const src =
      "3 · Advice — **King of Pentacles**: steady hands build wealth.\n\n" +
      "1 · Options — **Two of Wands**: a wide world.\n\n" +
      "2 · Past — **The Fool**: a fresh start.";
    // Exact copies pass, "The"-forms dedupe to the full name.
    expect(missingCardNames(src, src, names)).toEqual([]);
    // Live bug: Thai paragraph kept the suit word elsewhere but not
    // the card name — the bare suit must not satisfy the check.
    const mangled =
      "3 · Advice: the king paragraph in Thai with no English name.\n\n" +
      "The mix suits you: Pentacles ground the spread.";
    expect(missingCardNames(src, mangled, names)).toEqual([
      "King of Pentacles",
      "Two of Wands",
      "The Fool",
    ]);
    // Cards absent from the source block are not required.
    expect(missingCardNames("No cards here.", "No cards here.", names)).toEqual([]);
  });

  it("isCompleteReading requires every drawn card to be interpreted", () => {
    const names = ["Page of Cups", "The High Priestess", "Ace of Wands"];
    // Card paragraphs sit before the closing Summary, matching the
    // prompt's fixed section order (overview, cards, then the close).
    const noCards =
      "Overview only, no card paragraphs at all, but a tidy ending. ".repeat(4) +
      "\n\n**Page of Cups**: new feelings.\n\n**Guidance:** start gently.\n\n**What to do:**\n- one\n\nSummary: You are ready.";
    expect(isCompleteReading(noCards, names)).toBe(false);
    const withCards =
      noCards.replace(
        "**Page of Cups**: new feelings.",
        "**Page of Cups**: new feelings.\n\n**The High Priestess**: listen in.\n\n**Ace of Wands**: begin.",
      );
    expect(isCompleteReading(withCards, names)).toBe(true);
  });

  it("prompts match tone to the stakes of the question in both languages", () => {
    const en = buildReadingPrompt({
      lang: "en", topic: "general", question: "Should I get ice cream today?",
      cards: [], prev: [], nickname: null,
    });
    expect(en.system).toContain("Match the stakes of the question");
    const th = buildReadingPrompt({
      lang: "th", topic: "general", question: "Should I get ice cream today?",
      cards: [], prev: [], nickname: null,
    });
    expect(th.system).toContain("\u0e43\u0e2b\u0e49\u0e40\u0e02\u0e49\u0e32\u0e01\u0e31\u0e1a\u0e19\u0e49\u0e33\u0e2b\u0e19\u0e31\u0e01\u0e02\u0e2d\u0e07\u0e04\u0e33\u0e16\u0e32\u0e21");
  });

  it("takes the next line when the summary label sits on its own line (live TH bug: summary parsed as **)", () => {
    const th = "Body text.\n**\u0e2a\u0e23\u0e38\u0e1b:**\n\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e04\u0e38\u0e13\u0e21\u0e35\u0e2b\u0e25\u0e32\u0e22\u0e44\u0e2d\u0e40\u0e14\u0e35\u0e22";
    expect(parseSummary(th)).toBe("\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e04\u0e38\u0e13\u0e21\u0e35\u0e2b\u0e25\u0e32\u0e22\u0e44\u0e2d\u0e40\u0e14\u0e35\u0e22");
    expect(parseSummary("Body.\n**Summary:**\nTrust the slow build.")).toBe("Trust the slow build.");
    expect(parseSummary("Body.\nSummary:\nTrust the slow build.")).toBe("Trust the slow build.");
  });

  it("never returns markdown punctuation as a summary", () => {
    expect(parseSummary("Body.\n**Summary:** **")).not.toBe("**");
    expect(parseSummary("Body.\nSummary: **")).not.toBe("**");
  });

  it("pulls a bold-labelled summary (Thai model often writes **label:**)", () => {
    expect(parseSummary("Body.\n**Summary:** Trust the slow build.")).toBe("Trust the slow build.");
    const th = "Body.\n**\u0e2a\u0e23\u0e38\u0e1b:** \u0e44\u0e27\u0e49\u0e43\u0e08\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e30\u0e02\u0e2d\u0e07\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07";
    expect(parseSummary(th)).toBe("\u0e44\u0e27\u0e49\u0e43\u0e08\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e30\u0e02\u0e2d\u0e07\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07");
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
        c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'));
        await new Promise((r) => setTimeout(r, 20));
        c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"b"}}]}\n\n'));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of streamDeltas(async () => drip, "m", [], 2_000)) out.push(d);
    expect(out.join("")).toBe("ab");
  });

  it("uses one field per event: delta wins, response is not also appended", async () => {
    const sse =
      'data: {"response":"IGNORED","choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"response":"IGNORED","choices":[{"delta":{"content":" world"}}]}\n\n' +
      'data: {"response":"!"}\n\n';
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of streamDeltas(async () => body, "m", [])) out.push(d);
    expect(out.join("")).toBe("Hello world!");
  });

  it("strips only a clearly cumulative long re-send", async () => {
    const opening = "Hello world, this is a long opening";
    const sse =
      `data: {"choices":[{"delta":{"content":${JSON.stringify(opening)}}}]}\n\n` +
      `data: {"choices":[{"delta":{"content":${JSON.stringify(opening + " indeed")}}}]}\n\n`;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of streamDeltas(async () => body, "m", [])) out.push(d);
    expect(out.join("")).toBe(opening + " indeed");
  });

  it("does not strip shared leading characters from true deltas (dropped-letters regression)", async () => {
    const cases: [string[], string][] = [
      [["\u0e2d\u0e32\u0e08", "\u0e08\u0e30"], "\u0e2d\u0e32\u0e08\u0e08\u0e30"],
      [["\u0e15\u0e2d\u0e19", "\u0e19\u0e35\u0e49"], "\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49"],
      [["\u0e2b\u0e25\u0e31\u0e01", "\u0e01\u0e32\u0e23"], "\u0e2b\u0e25\u0e31\u0e01\u0e01\u0e32\u0e23"],
      [["\u0e04\u0e27\u0e32\u0e21", "\u0e21\u0e31\u0e48\u0e19", "\u0e04\u0e07"], "\u0e04\u0e27\u0e32\u0e21\u0e21\u0e31\u0e48\u0e19\u0e04\u0e07"],
      [["\u0e01\u0e33\u0e25\u0e31\u0e07", "\u0e25\u0e31\u0e07", "\u0e40\u0e25"], "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e25\u0e31\u0e07\u0e40\u0e25"],
      [["soon", "!", "!"], "soon!!"],
    ];
    for (const [pieces, expected] of cases) {
      const sse = pieces
        .map((p) => `data: {"choices":[{"delta":{"content":${JSON.stringify(p)}}}]}\n\n`)
        .join("");
      const body = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(sse));
          c.close();
        },
      });
      const out: string[] = [];
      for await (const d of streamDeltas(async () => body, "m", [])) out.push(d);
      expect(out.join("")).toBe(expected);
    }
  });
});

describe("appendUnique", () => {
  it("appends true deltas verbatim, even with shared leading characters", () => {
    expect(appendUnique("\u0e2d\u0e32\u0e08", "\u0e08\u0e30")).toBe("\u0e08\u0e30");
    expect(appendUnique("soon!", "!")).toBe("!");
    expect(appendUnique("ab", "b")).toBe("b");
    expect(appendUnique("", "x")).toBe("x");
    expect(appendUnique("x", "")).toBe("");
  });

  it("does not treat a short cumulative-looking chunk as cumulative", () => {
    expect(appendUnique("a", "ab")).toBe("ab");
    expect(appendUnique("Hello", "Hello world")).toBe("Hello world");
  });

  it("strips the prefix only for a long cumulative re-send", () => {
    const seen = "Hello world, this is a long opening";
    expect(appendUnique(seen, seen + " indeed")).toBe(" indeed");
    expect(appendUnique(seen, "unrelated chunk")).toBe("unrelated chunk");
  });
});

describe("sseEvent", () => {
  it("frames SSE events", () => {
    expect(sseEvent("done", '{"a":1}')).toBe('event: done\ndata: {"a":1}\n\n');
  });
});

describe("pickAnchor", () => {
  const cards = [
    { name: "Two of Cups", keywords: ["love", "union"], meaning: "a joyful union", reversed: false, topicNote: null, imagery: null },
    { name: "Eight of Pentacles", keywords: ["craft", "diligence"], meaning: "steady work and skill", reversed: false, topicNote: null, imagery: null },
    { name: "The Star", keywords: ["hope", "healing"], meaning: "quiet hope", reversed: false, topicNote: null, imagery: null },
  ];
  it("picks the card whose words match the question", () => {
    expect(pickAnchor("should I quit my job to focus on craft?", cards)).toBe("Eight of Pentacles");
  });
  it("breaks ties toward the earliest card", () => {
    const tied = [
      { name: "Two of Cups", keywords: ["love"], meaning: "qqq", reversed: false, topicNote: null, imagery: null },
      { name: "Eight of Pentacles", keywords: ["work"], meaning: "qqq", reversed: false, topicNote: null, imagery: null },
      cards[2],
    ];
    expect(pickAnchor("love and work", tied)).toBe("Two of Cups");
  });
  it("returns null when nothing matches", () => {
    expect(pickAnchor("zxcv bnml", cards)).toBeNull();
  });
  it("matches Thai keywords in Thai questions", () => {
    const th = [
      { name: "The Lovers", keywords: ["\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e01"], meaning: "\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e21\u0e1e\u0e31\u0e19\u0e18\u0e4c", reversed: false, topicNote: null, imagery: null },
      cards[1],
      cards[2],
    ];
    expect(pickAnchor("\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e01\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19\u0e08\u0e30\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23", th)).toBe("The Lovers");
  });
});

describe("anchor card in prompt", () => {
  const cards = [
    { name: "The Fool", keywords: ["beginnings"], meaning: "a fresh start", reversed: false, topicNote: null, imagery: null },
    { name: "Eight of Pentacles", keywords: ["craft"], meaning: "steady work", reversed: false, topicNote: null, imagery: null },
    { name: "The Star", keywords: ["hope"], meaning: "quiet hope", reversed: false, topicNote: null, imagery: null },
  ];
  it("names the anchor card in English prompts", () => {
    const out = buildReadingPrompt({ lang: "en", topic: "general", question: "how do I master my craft?", cards, prev: [], nickname: null });
    expect(out.user).toContain("Key card: Eight of Pentacles");
  });
  it("names the anchor card in Thai prompts", () => {
    const th = cards.map((c) => ({ ...c, keywords: ["\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e01"], meaning: "\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e21\u0e1e\u0e31\u0e19\u0e18\u0e4c" }));
    const out = buildReadingPrompt({ lang: "th", topic: "general", question: "\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e01\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19\u0e08\u0e30\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23", cards: th, prev: [], nickname: null });
    expect(out.user).toContain("\u0e44\u0e1e\u0e48\u0e43\u0e1a\u0e2a\u0e33\u0e04\u0e31\u0e0d:");
  });
  it("omits the anchor line when nothing matches", () => {
    const out = buildReadingPrompt({ lang: "en", topic: "general", question: "zxcv bnml", cards, prev: [], nickname: null });
    expect(out.user).not.toContain("Key card:");
  });
});

describe("plain-language and question-type blocks", () => {
  const dummyCard = {
    id: 17, slug: "the-star", arcana: "major", suit: null, rank: 17,
    imageKey: "cards/major-17", name: "The Star", nameEn: "The Star",
    keywordsUpright: ["hope"], keywordsReversed: ["dim"],
    upright: "hope returns", reversed: "hope dims",
    love: null, career: null, money: null, health: null, imagery: null,
  };
  const cards = [toPromptCard(dummyCard as never, false, "general")];
  it("ends both systems with THINKS, VOICE, FIXED FORMAT then QUESTION SHAPE, with no opener table or verdict scripts", () => {
    for (const lang of ["en", "th"] as const) {
      const { system } = buildReadingPrompt({
        lang, topic: "general", question: "hello", cards, prev: [], nickname: null,
      });
      const thinks = system.indexOf(lang === "en" ? "HOW NGERN THINKS" : "วิธีคิดของน้องเงิน");
      const voice = system.indexOf(lang === "en" ? "NGERN'S VOICE" : "เสียงของน้องเงิน");
      const fixed = system.indexOf(lang === "en" ? "FIXED FORMAT (the website depends on this)" : "รูปแบบตายตัว");
      const shape = system.indexOf(lang === "en" ? "=== QUESTION SHAPE ===" : "=== รูปแบบคำถาม ===");
      expect(thinks).toBeGreaterThan(-1);
      expect(voice).toBeGreaterThan(thinks);
      expect(fixed).toBeGreaterThan(voice);
      expect(shape).toBeGreaterThan(fixed);
      expect(system).toContain(lang === "en" ? "Clear explainer" : "นักอธิบายชัดเจน");
      expect(system).not.toContain("PLAIN-LANGUAGE CARD PARAGRAPHS");
      expect(system).not.toContain("QUESTION TYPE & ANSWER WORDING");
      expect(system).not.toContain("เงาะ");
    }
    const en = buildReadingPrompt({ lang: "en", topic: "general", question: "hello", cards, prev: [], nickname: null }).system;
    expect(en).not.toContain("Yes, there is / No, there isn't");
    expect(en).not.toMatch(/[฀-๿]/);
  });

  it("tells the model the input shape", () => {
    const cat = "โอกาสเรื่องเงินและงานที่กำลังเดินทางมาหาคุณ (ผู้เลือกแมวตัวที่ 3)";
    const find = "มีข้อมูลส่วนไหนของ TarotNice ที่ต้องทำให้ชัดก่อนโฆษณาไหม";
    const yn = "เดือนหน้าการเงินจะดีขึ้นไหม";
    const shapeOf = (q: string, lang: "th" | "en") => inputShape(q, pickSpread(q, guessTopic(q), lang), lang);
    expect(shapeOf(cat, "th")).toBe("topic");
    expect(shapeOf(find, "th")).toBe("find");
    expect(shapeOf("Is there anything I should fix before running ads?", "en")).toBe("find");
    expect(shapeOf("Your career next month", "en")).toBe("topic");
    expect(shapeOf("How will the new job go?", "en")).toBe("question");
    expect(["yesno", "question"]).toContain(shapeOf(yn, "th"));
    const u = buildReadingPrompt({ lang: "en", topic: "general", question: "Your career next month", cards, prev: [], nickname: null }).user;
    expect(u).toContain("Input shape: Topic (not a question)");
  });
});

describe("method rules in system prompts", () => {
  const dummy = [
    { name: "The Fool", keywords: ["beginnings"], meaning: "a fresh start", reversed: false, topicNote: null, imagery: null },
    { name: "Eight of Pentacles", keywords: ["craft"], meaning: "steady work", reversed: false, topicNote: null, imagery: null },
    { name: "The Star", keywords: ["hope"], meaning: "quiet hope", reversed: false, topicNote: null, imagery: null },
  ];
  const en = buildReadingPrompt({ lang: "en", topic: "general", question: "hello", cards: dummy, prev: [], nickname: null }).system;
  const th = buildReadingPrompt({ lang: "th", topic: "general", question: "hello", cards: dummy, prev: [], nickname: null }).system;
  it("teaches answer types with yes-no patterns in English", () => {
    expect(en).toContain("STEP 5 \u2014 ANSWER TYPES");
    expect(en).toContain("The LAST card weighs most");
    expect(en).toContain("good \u2013 bad \u2013 good");
    expect(en).toContain("the opposite meaning (last resort)");
    expect(en).toContain("If the user message names a key card");
  });
  it("teaches answer types with yes-no patterns in Thai", () => {
    expect(th).toContain("\u0e44\u0e1e\u0e48\u0e43\u0e1a\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22\u0e19\u0e49\u0e33\u0e2b\u0e19\u0e31\u0e01\u0e2a\u0e38\u0e14");
    expect(th).toContain("\u0e14\u0e35 \u2013 \u0e41\u0e22\u0e48 \u2013 \u0e14\u0e35");
    expect(th).toContain("\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14\u0e2a\u0e23\u0e38\u0e1b\u0e1a\u0e2d\u0e01\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e01\u0e48\u0e2d\u0e19");
    expect(th).toContain("\u0e44\u0e1e\u0e48\u0e43\u0e1a\u0e2a\u0e33\u0e04\u0e31\u0e0d");
  });
});
