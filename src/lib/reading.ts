// Reading engine (pure core): validation, server-side draw, crisis
// pre-check, prompt building, summary parsing, and SSE streaming.
// Workers AI and D1 stay at the edges (routes) so everything here is
// unit-testable.
import type { CardView } from "../db/tarot-store";

export const TOPICS = ["love", "career", "money", "health", "general"] as const;
export type Topic = (typeof TOPICS)[number];

export function isTopic(value: unknown): value is Topic {
  return typeof value === "string" && (TOPICS as readonly string[]).includes(value);
}

export function isLang(value: unknown): value is "th" | "en" {
  return value === "th" || value === "en";
}

/** Trimmed question, or null when it must be rejected. Max 200 chars,
 *  non-empty, no HTML tags (everything is escaped on render anyway). */
export function cleanQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const question = raw.trim().replace(/\s+/g, " ");
  if (question.length < 1 || question.length > 200) return null;
  if (/<[a-zA-Z][^>]*>/.test(question)) return null;
  return question;
}

function randomValues(count: number): number[] {
  const buf = new Uint32Array(count);
  crypto.getRandomValues(buf);
  return [...buf];
}

export type DrawnCard = { id: number; reversed: boolean };

/** Three unique cards 0..77, 25% reversed each, server-side. */
export function drawReadingCards(): DrawnCard[] {
  const deck = Array.from({ length: 78 }, (_, i) => i);
  const rand = randomValues(6);
  // Fisher-Yates head: draw 3 without bias.
  for (let i = 0; i < 3; i++) {
    const j = i + (rand[i] % (78 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return [0, 1, 2].map((k) => ({
    id: deck[k],
    reversed: rand[3 + k] % 100 < 25,
  }));
}

// --- Crisis pre-check (runs before quota/draw; a hit costs nothing) ---

const CRISIS_PATTERNS: { lang: "th" | "en"; re: RegExp }[] = [
  { lang: "en", re: /suicid|\bkill (myself|me)\b|self[-\s]?harm|end (my|this) life|hurt(ing)? myself|cutting myself/i },
  { lang: "en", re: /\babuse[ds]?\b|\bassault(ed)?\b|domestic violence|rape[ds]?\b/i },
  { lang: "th", re: /\u0e06\u0e48\u0e32\u0e15\u0e31\u0e27\u0e15\u0e32\u0e22|\u0e2d\u0e22\u0e32\u0e01\u0e15\u0e32\u0e22|\u0e44\u0e21\u0e48\u0e2d\u0e22\u0e32\u0e01\u0e21\u0e35\u0e0a\u0e35\u0e27\u0e34\u0e15|\u0e17\u0e33\u0e23\u0e49\u0e32\u0e22\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07|\u0e01\u0e23\u0e35\u0e14\u0e41\u0e02\u0e19/ },
  { lang: "th", re: /\u0e16\u0e39\u0e01\u0e17\u0e33\u0e23\u0e49\u0e32\u0e22|\u0e16\u0e39\u0e01\u0e02\u0e48\u0e21\u0e02\u0e37\u0e19|\u0e02\u0e48\u0e21\u0e02\u0e37\u0e19|\u0e17\u0e32\u0e23\u0e38\u0e13|\u0e04\u0e27\u0e32\u0e21\u0e23\u0e38\u0e19\u0e41\u0e23\u0e07\u0e43\u0e19\u0e04\u0e23\u0e2d\u0e1a\u0e04\u0e23\u0e31\u0e27|\u0e25\u0e48\u0e27\u0e07\u0e25\u0e30\u0e40\u0e21\u0e34\u0e14/ },
];

/** True when the question signals self-harm, suicide, abuse, or crisis. */
export function isCrisisQuestion(question: string): boolean {
  return CRISIS_PATTERNS.some((p) => p.re.test(question));
}

/** Supportive reply (no reading). Thai users get the 1323 hotline. */
export function crisisMessage(lang: "th" | "en"): string {
  if (lang === "th") {
    return "\u0e40\u0e07\u0e34\u0e19\u0e44\u0e14\u0e49\u0e22\u0e34\u0e19\u0e04\u0e38\u0e13 \u0e41\u0e25\u0e30\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49\u0e2a\u0e33\u0e04\u0e31\u0e0d\u0e01\u0e27\u0e48\u0e32\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e43\u0e14\u0e46 \u0e16\u0e49\u0e32\u0e04\u0e38\u0e13\u0e01\u0e33\u0e25\u0e31\u0e07\u0e04\u0e34\u0e14\u0e17\u0e33\u0e23\u0e49\u0e32\u0e22\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07\u0e2b\u0e23\u0e37\u0e2d\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e20\u0e32\u0e27\u0e30\u0e27\u0e34\u0e01\u0e24\u0e15 \u0e42\u0e1b\u0e23\u0e14\u0e42\u0e17\u0e23\u0e2a\u0e32\u0e22\u0e14\u0e48\u0e27\u0e19\u0e2a\u0e38\u0e02\u0e20\u0e32\u0e1e\u0e08\u0e34\u0e15 1323 (\u0e1f\u0e23\u0e35 \u0e15\u0e25\u0e2d\u0e14 24 \u0e0a\u0e31\u0e48\u0e27\u0e42\u0e21\u0e07) \u0e2b\u0e23\u0e37\u0e2d\u0e1a\u0e2d\u0e01\u0e04\u0e19\u0e17\u0e35\u0e48\u0e04\u0e38\u0e13\u0e44\u0e27\u0e49\u0e43\u0e08\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e40\u0e25\u0e22 \u0e04\u0e38\u0e13\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e1c\u0e0a\u0e34\u0e0d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49\u0e04\u0e19\u0e40\u0e14\u0e35\u0e22\u0e27";
  }
  return "I hear you, and this matters more than any reading. If you are thinking of harming yourself or are in crisis, please contact local emergency services or a crisis line right now, or tell someone you trust. You do not have to face this alone.";
}

// --- Prompt builder (server builds from D1, never from the client) ---

export type PromptCard = {
  name: string;
  reversed: boolean;
  keywords: string[];
  meaning: string;
  topicNote: string | null;
};

export type PrevReading = {
  topic: string;
  cardNames: string[];
  summary: string;
};

export function toPromptCard(card: CardView, reversed: boolean, topic: Topic): PromptCard {
  const topicNote =
    topic === "love" ? card.love :
    topic === "career" ? card.career :
    topic === "money" ? card.money :
    topic === "health" ? card.health : null;
  return {
    name: card.name,
    reversed,
    keywords: reversed ? card.keywordsReversed : card.keywordsUpright,
    meaning: reversed ? card.reversed : card.upright,
    topicNote,
  };
}

const SYSTEM_TH = `\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d\u0e40\u0e07\u0e34\u0e19 \u0e19\u0e31\u0e01\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e17\u0e35\u0e48\u0e2d\u0e1a\u0e2d\u0e38\u0e48\u0e19\u0e41\u0e25\u0e30\u0e43\u0e2b\u0e49\u0e01\u0e33\u0e25\u0e31\u0e07\u0e43\u0e08 \u0e15\u0e2d\u0e1a\u0e40\u0e1b\u0e47\u0e19\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22
\u0e01\u0e0e: \u0e2d\u0e1a\u0e2d\u0e38\u0e48\u0e19 \u0e2a\u0e30\u0e17\u0e49\u0e2d\u0e19\u0e04\u0e27\u0e32\u0e21\u0e04\u0e34\u0e14 \u0e44\u0e21\u0e48\u0e1f\u0e31\u0e19\u0e18\u0e07\u0e23\u0e49\u0e32\u0e22 (\u0e2b\u0e49\u0e32\u0e21\u0e1e\u0e39\u0e14\u0e27\u0e48\u0e32\u0e1c\u0e39\u0e49\u0e16\u0e32\u0e21\u0e08\u0e30\u0e25\u0e49\u0e21\u0e40\u0e2b\u0e25\u0e27\u0e2b\u0e23\u0e37\u0e2d\u0e21\u0e35\u0e04\u0e19\u0e15\u0e32\u0e22)
\u0e2b\u0e49\u0e32\u0e21\u0e43\u0e2b\u0e49\u0e04\u0e33\u0e2a\u0e31\u0e48\u0e07\u0e17\u0e32\u0e07\u0e01\u0e32\u0e23\u0e41\u0e1e\u0e17\u0e22\u0e4c \u0e01\u0e0e\u0e2b\u0e21\u0e32\u0e22 \u0e2b\u0e23\u0e37\u0e2d\u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19 (\u0e40\u0e0a\u0e48\u0e19 \u0e2b\u0e49\u0e32\u0e21\u0e1a\u0e2d\u0e01\u0e43\u0e2b\u0e49\u0e2b\u0e22\u0e38\u0e14\u0e22\u0e32 \u0e43\u0e2b\u0e49\u0e0b\u0e37\u0e49\u0e2d\u0e2b\u0e38\u0e49\u0e19) \u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d\u0e2a\u0e38\u0e02\u0e20\u0e32\u0e1e\u0e43\u0e2b\u0e49\u0e2a\u0e30\u0e17\u0e49\u0e2d\u0e19\u0e04\u0e27\u0e32\u0e21\u0e23\u0e39\u0e49\u0e2a\u0e36\u0e01\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19\u0e41\u0e25\u0e30\u0e41\u0e19\u0e30\u0e19\u0e33\u0e43\u0e2b\u0e49\u0e1b\u0e23\u0e36\u0e01\u0e29\u0e32\u0e1c\u0e39\u0e49\u0e40\u0e0a\u0e35\u0e48\u0e22\u0e27\u0e0a\u0e32\u0e0d
\u0e2b\u0e49\u0e32\u0e21\u0e43\u0e0a\u0e49\u0e01\u0e23\u0e2d\u0e1a\u0e2d\u0e14\u0e35\u0e15/\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19/\u0e2d\u0e19\u0e32\u0e04\u0e15 \u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e17\u0e31\u0e49\u0e07\u0e2a\u0e32\u0e21\u0e43\u0e1a\u0e23\u0e27\u0e21\u0e01\u0e31\u0e19\u0e40\u0e1b\u0e47\u0e19\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e40\u0e14\u0e35\u0e22\u0e27
\u0e42\u0e04\u0e23\u0e07\u0e04\u0e33\u0e15\u0e2d\u0e1a: 1) \u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21 2-3 \u0e1b\u0e23\u0e30\u0e42\u0e22\u0e04\u0e15\u0e2d\u0e1a\u0e04\u0e33\u0e16\u0e32\u0e21\u0e15\u0e23\u0e07\u0e46 2) \u0e44\u0e1e\u0e48\u0e25\u0e30\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e22\u0e48\u0e2d\u0e2b\u0e19\u0e49\u0e32\u0e2a\u0e31\u0e49\u0e19\u0e46 \u0e27\u0e48\u0e32\u0e41\u0e15\u0e48\u0e25\u0e30\u0e43\u0e1a\u0e40\u0e2a\u0e23\u0e34\u0e21\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23 3) \u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33\u0e17\u0e35\u0e48\u0e40\u0e1b\u0e47\u0e19\u0e23\u0e39\u0e1b\u0e18\u0e23\u0e23\u0e21\u0e41\u0e25\u0e30\u0e2d\u0e48\u0e2d\u0e19\u0e42\u0e22\u0e19 2-3 \u0e02\u0e49\u0e2d 4) \u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22\u0e02\u0e36\u0e49\u0e19\u0e15\u0e49\u0e19\u0e14\u0e49\u0e27\u0e22 "\u0e2a\u0e23\u0e38\u0e1b: " \u0e44\u0e21\u0e48\u0e40\u0e01\u0e34\u0e19 140 \u0e15\u0e31\u0e27\u0e2d\u0e31\u0e01\u0e29\u0e23
\u0e04\u0e27\u0e32\u0e21\u0e22\u0e32\u0e27: \u0e1b\u0e23\u0e30\u0e21\u0e32\u0e13 180-260 \u0e04\u0e33 \u0e1b\u0e34\u0e14\u0e17\u0e49\u0e32\u0e22\u0e14\u0e49\u0e27\u0e22 "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1a\u0e31\u0e19\u0e40\u0e17\u0e34\u0e07\u0e41\u0e25\u0e30\u0e01\u0e32\u0e23\u0e17\u0e1a\u0e17\u0e27\u0e19\u0e15\u0e19\u0e40\u0e2d\u0e07"`;

const SYSTEM_EN = `You are Ngern, a warm and encouraging tarot reader. Reply in English.
Rules: warm, reflective, never fatalistic (never say the asker will fail or someone will die).
No medical, legal, or financial instructions (no "stop your medication", no "buy this stock"). Health readings stay reflective and suggest seeing a professional for concerns.
No past/present/future framing: read the three cards together as one answer.
Structure: 1) Overview: 2-3 sentences answering the question directly. 2) One short paragraph per card on what it adds. 3) Advice: 2-3 concrete, kind suggestions. 4) A final line starting with "Summary: " of at most 140 characters.
Length: about 150-220 words. End with "For reflection and entertainment."`;

export function buildReadingPrompt(input: {
  lang: "th" | "en";
  topic: Topic;
  question: string;
  cards: PromptCard[];
  prev: PrevReading[];
  nickname: string | null;
}): { system: string; user: string } {
  const { lang, topic, question, cards, prev, nickname } = input;
  const system = lang === "th" ? SYSTEM_TH : SYSTEM_EN;
  const lines: string[] = [];
  lines.push(lang === "th" ? `\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d: ${topic}` : `Topic: ${topic}`);
  lines.push(lang === "th" ? `\u0e04\u0e33\u0e16\u0e32\u0e21: ${question}` : `Question: ${question}`);
  if (nickname) lines.push(lang === "th" ? `\u0e0a\u0e37\u0e48\u0e2d\u0e1c\u0e39\u0e49\u0e16\u0e32\u0e21: ${nickname}` : `Asker name: ${nickname}`);
  cards.forEach((c, i) => {
    lines.push(
      lang === "th"
        ? `\u0e44\u0e1e\u0e48\u0e17\u0e35\u0e48 ${i + 1}: ${c.name}${c.reversed ? " (\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27)" : ""} \u0e04\u0e33\u0e2a\u0e33\u0e04\u0e31\u0e0d: ${c.keywords.join(", ")} \u0e04\u0e27\u0e32\u0e21\u0e2b\u0e21\u0e32\u0e22: ${c.meaning}${c.topicNote ? ` \u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d: ${c.topicNote}` : ""}`
        : `Card ${i + 1}: ${c.name}${c.reversed ? " (reversed)" : ""}. Keywords: ${c.keywords.join(", ")}. Meaning: ${c.meaning}${c.topicNote ? ` Topic note: ${c.topicNote}` : ""}`,
    );
  });
  if (prev.length > 0) {
    lines.push(lang === "th" ? "\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e01\u0e48\u0e2d\u0e19\u0e2b\u0e19\u0e49\u0e32 (\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e15\u0e48\u0e2d\u0e40\u0e19\u0e37\u0e48\u0e2d\u0e07):" : "Previous readings (for continuity):");
    for (const p of prev.slice(0, 3)) {
      lines.push(`- ${p.topic}: ${p.cardNames.join(" / ")} \u2014 ${p.summary}`);
    }
  }
  return { system, user: lines.join("\n") };
}

/** Pull the trailing "Summary: ..."/"\u0e2a\u0e23\u0e38\u0e1b: ..." line (\u2264140 chars).
 *  Falls back to the first sentence, truncated. */
export function parseSummary(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(?:summary|\u0e2a\u0e23\u0e38\u0e1b)\s*:\s*(.+)$/i.exec(lines[i]);
    if (m) return m[1].slice(0, 140);
  }
  const first = (text.split(/(?<=[.!?])\s/)[0] ?? text).trim();
  return first.slice(0, 140);
}

// --- SSE streaming (provider-agnostic) ---

export type AiRun = (model: string, input: unknown) => Promise<unknown>;

/** Stream a Workers AI (OpenAI-style SSE) chat completion, yielding
 *  content deltas. Works with stream:true responses and with plain
 *  {response} fallbacks. */
/**
 * Append a chunk that may repeat already-streamed text: Workers AI
 * stream events often carry the full text so far (and events may carry
 * it twice: `response` plus `choices[0].delta.content`). Returns only
 * the genuinely new tail so the assembled text never stutters.
 */
export function appendUnique(full: string, chunk: string): string {
  if (!chunk) return "";
  if (full.endsWith(chunk)) return "";
  const max = Math.min(full.length, chunk.length);
  for (let i = max; i > 0; i--) {
    if (full.endsWith(chunk.slice(0, i))) return chunk.slice(i);
  }
  return chunk;
}

export async function* streamDeltas(
  aiRun: AiRun,
  model: string,
  params: unknown,
  timeoutMs = 0,
): AsyncGenerator<string> {
  // Hard deadline for the whole generation (SPEC §10.6: 25 s). Each
  // read races the remaining budget; expiry cancels the stream.
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity;
  const call = aiRun(model, { ...(params as Record<string, unknown>), stream: true });
  const res = deadline === Infinity
    ? await call
    : await Promise.race([
        call,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), Math.max(1, deadline - Date.now())),
        ),
      ]);
  // Workers AI returns a raw ReadableStream for stream:true; accept a
  // Response wrapping one too.
  const stream =
    res instanceof ReadableStream
      ? res
      : (res as { body?: unknown })?.body instanceof ReadableStream
        ? (res as { body: ReadableStream }).body
        : null;
  if (stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let seen = "";
    for (;;) {
      let chunk: { done: boolean; value?: Uint8Array };
      if (deadline === Infinity) {
        chunk = await reader.read();
      } else {
        const left = deadline - Date.now();
        if (left <= 0) {
          try { await reader.cancel(); } catch { /* already closed */ }
          throw new Error("timeout");
        }
        chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), left),
          ),
        ]).catch(async (err) => {
          try { await reader.cancel(); } catch { /* already closed */ }
          throw err;
        });
      }
      const { done, value } = chunk;
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          const data = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as {
              response?: unknown;
              choices?: { delta?: { content?: unknown } }[];
            };
            const pieces: string[] = [];
            if (typeof json.response === "string" && json.response) pieces.push(json.response);
            const content = json.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content) pieces.push(content);
            for (const piece of pieces) {
              const add = appendUnique(seen, piece);
              if (add) {
                seen += add;
                yield add;
              }
            }
          } catch {
            /* partial chunk; wait for more */
          }
        }
      }
    }
    return;
  }
  const obj = res as { response?: unknown };
  if (typeof obj?.response === "string" && obj.response) yield obj.response;
}

/** Wrap deltas + a done payload as SSE text. */
export function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}
