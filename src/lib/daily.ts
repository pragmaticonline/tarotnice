// Daily card: server-side crypto draw, cached AI message, and the
// Thai weekday lucky colour (static table, never AI-generated).
import { bangkokWeekday } from "./bangkok";
import type { CardView } from "../db/tarot-store";

export type LuckyColour = { key: string; en: string; th: string };

// Thai tradition by weekday: Sun red, Mon yellow, Tue pink, Wed green,
// Thu orange, Fri blue, Sat purple.
const LUCKY: LuckyColour[] = [
  { key: "red", en: "Red", th: "แดง" },
  { key: "yellow", en: "Yellow", th: "เหลือง" },
  { key: "pink", en: "Pink", th: "ชมพู" },
  { key: "green", en: "Green", th: "เขียว" },
  { key: "orange", en: "Orange", th: "ส้ม" },
  { key: "blue", en: "Blue", th: "ฟ้า" },
  { key: "purple", en: "Purple", th: "ม่วง" },
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
      ? "คุณคือเงิน นักอ่านไพ่ทาโรต์ที่อบอุ่น เขียนข้อความไพ่ประจำวัน 2-3 ประโยค อบอุ่น ไม่ฟันธงร้าย"
      : "You are Ngern, a warm tarot reader. Write a 2-3 sentence daily card message. Warm, encouraging, never fatalistic.";
  const user =
    lang === "th"
      ? `ไพ่: ${name}${reversed ? " (กลับหัว)" : ""} คำสำคัญ: ${keywords.join(", ")}`
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
