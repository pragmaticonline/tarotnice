// Daily card: server-side crypto draw, cached AI message, and the
// Thai weekday lucky colour (static table, never AI-generated).
import { bangkokWeekday } from "./bangkok";
import type { CardView } from "../db/tarot-store";

export type LuckyColour = { key: string; en: string; th: string };

// Thai tradition by weekday: Sun red, Mon yellow, Tue pink, Wed green,
// Thu orange, Fri blue, Sat purple.
const LUCKY: LuckyColour[] = [
  { key: "red", en: "Red", th: "\u0e41\u0e14\u0e07" },
  { key: "yellow", en: "Yellow", th: "\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e07" },
  { key: "pink", en: "Pink", th: "\u0e0a\u0e21\u0e1e\u0e39" },
  { key: "green", en: "Green", th: "\u0e40\u0e02\u0e35\u0e22\u0e27" },
  { key: "orange", en: "Orange", th: "\u0e2a\u0e49\u0e21" },
  { key: "blue", en: "Blue", th: "\u0e1f\u0e49\u0e32" },
  { key: "purple", en: "Purple", th: "\u0e21\u0e48\u0e27\u0e07" },
];

export function luckyColour(d = new Date()): LuckyColour {
  return LUCKY[bangkokWeekday(d)] ?? LUCKY[0];
}

function randomValues(count: number): number[] {
  const buf = new Uint32Array(count);
  crypto.getRandomValues(buf);
  return [...buf];
}

/** Uniform card 0..77 + 25% reversed, decided server-side. */
export function drawDailyCard(): { id: number; reversed: boolean } {
  const [a, b] = randomValues(2);
  return {
    id: a % 78,
    reversed: (b % 100) < 25,
  };
}

export type ReadingEnv = {
  AI?: Ai;
  READING_MODEL?: string;
};

/** 2-3 sentence daily message (topic: general). Tries Workers AI when
 *  a model is configured; falls back to the curated card text so the
 *  daily draw works before the M6 model eval picks a model. */
export async function dailyMessage(
  env: ReadingEnv,
  card: CardView,
  reversed: boolean,
  lang: "th" | "en",
): Promise<{ text: string; model: string | null }> {
  const model = env.READING_MODEL?.trim() || null;
  if (model && env.AI) {
    try {
      const orientation = reversed ? card.keywordsReversed : card.keywordsUpright;
      const text = await aiDailyMessage(env.AI, model, card.name, reversed, orientation, lang);
      if (text) return { text, model };
    } catch {
      /* fall through to the curated text */
    }
  }
  return { text: reversed ? card.reversed : card.upright, model: null };
}

async function aiDailyMessage(
  ai: Ai,
  model: string,
  name: string,
  reversed: boolean,
  keywords: string[],
  lang: "th" | "en",
): Promise<string | null> {
  const sys =
    lang === "th"
      ? "\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d\u0e40\u0e07\u0e34\u0e19 \u0e19\u0e31\u0e01\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e17\u0e35\u0e48\u0e2d\u0e1a\u0e2d\u0e38\u0e48\u0e19 \u0e40\u0e02\u0e35\u0e22\u0e19\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19 2-3 \u0e1b\u0e23\u0e30\u0e42\u0e22\u0e04 \u0e2d\u0e1a\u0e2d\u0e38\u0e48\u0e19 \u0e44\u0e21\u0e48\u0e1f\u0e31\u0e19\u0e18\u0e07\u0e23\u0e49\u0e32\u0e22"
      : "You are Ngern, a warm tarot reader. Write a 2-3 sentence daily card message. Warm, encouraging, never fatalistic.";
  const user =
    lang === "th"
      ? `\u0e44\u0e1e\u0e48: ${name}${reversed ? " (\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27)" : ""} \u0e04\u0e33\u0e2a\u0e33\u0e04\u0e31\u0e0d: ${keywords.join(", ")}`
      : `Card: ${name}${reversed ? " (reversed)" : ""}. Keywords: ${keywords.join(", ")}`;
  const res = (await ai.run(
    model as never,
    {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    } as never,
    { signal: AbortSignal.timeout(25000) } as never,
  )) as { response?: unknown };
  const text = typeof res?.response === "string" ? res.response.trim() : "";
  return text || null;
}
