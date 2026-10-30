import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression test: after a reading finished, tapping a suggested
// follow-up returned to step 1 but the cat bubble still said
// "Warming up the deck…". Two defects combined: stopWait never
// restored the idle hint, and the completion bubble raced the 280ms
// step-2→3 transition, landing on the step-2 cat while step 1 kept
// stale wait text. This drives the real ask.js flow with faithful
// step visibility (including the deferred showStep) and a slow POST
// so the wait lines actually advance.
const ASK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/ask.js",
);

const IDLE_HINT = "Hi, I'm Ngern. Ask me anything.";
const WAIT_LINE = "Warming up the deck…";
const READY_LINE = "Here is your reading";

function makeEl(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const noop = () => {};
  const el: Record<string, unknown> = {
    innerHTML: "",
    textContent: "",
    className: "",
    dataset: {},
    style: {},
    disabled: false,
    hidden: false,
    value: "",
    classList: {
      add: noop,
      remove: noop,
      toggle: noop,
      contains: (c: string) =>
        String(el.className || "")
          .split(" ")
          .includes(c),
    },
    addEventListener: noop,
    appendChild: noop,
    replaceWith: noop,
    remove: noop,
    focus: noop,
    click: noop,
    getAttribute: () => "",
    querySelector: () => null,
    querySelectorAll: () => [],
    ...extra,
  };
  return el;
}

async function runFollowUpFlow(postRemaining = 2, summary: unknown = null) {
  const created: Record<string, unknown>[] = [];
  const fetchCalls: string[] = [];
  const guideAskBubble = { textContent: IDLE_HINT };
  const guideBubble = { textContent: "" };
  // Faithful step visibility: step 1 shown, draw + read hidden.
  const sections: Record<string, Record<string, unknown>> = {
    "1": makeEl(),
    "2": makeEl({ hidden: true }),
    "3": makeEl({ hidden: true }),
  };
  const formHandlers: Record<string, (e: unknown) => unknown> = {};
  const form = makeEl({
    addEventListener: (type: string, fn: (e: unknown) => unknown) => {
      formHandlers[type] = fn;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const question = makeEl({ value: "Will tomorrow go well?" });
  let followUp: { onFollowUp: (q: string) => void } | null = null;
  const byId: Record<string, unknown> = {
    "ask-form": form,
    q: question,
    "guide-ask": makeEl({ querySelector: () => guideAskBubble }),
    guide: makeEl({ querySelector: () => guideBubble }),
    "draw-topic": makeEl(),
    "draw-q": makeEl(),
    "read-eyebrow": makeEl(),
    "read-q": makeEl(),
    "read-cards": makeEl(),
    reading: makeEl(),
    // Old bubble() routing reads step-draw visibility directly.
    "step-draw": sections["2"],
  };
  const sandbox: Record<string, unknown> = {
    console,
    setTimeout,
    // Browser semantics: timeouts and intervals share one timer pool,
    // so clearTimeout stops the wait-line interval (Node separates
    // them; the code under test relies on the browser behavior).
    clearTimeout: ((id: unknown) => {
      clearTimeout(id as NodeJS.Timeout);
      clearInterval(id as NodeJS.Timeout);
    }) as typeof clearTimeout,
    setInterval,
    clearInterval,
    history: { pushState: () => {}, back: () => {} },
    location: { search: "" },
    fetch: async (url: unknown) => {
      fetchCalls.push(String(url));
      if (String(url).includes("/api/readings")) {
        // Slow mobile POST: the wait-line interval (1.6s) ticks to
        // "Warming up the deck…" before the draw arrives.
        await new Promise((r) => setTimeout(r, 1700));
        return {
          status: 200,
          json: async () => ({
            id: "r1",
            cards: [{ id: 0, reversed: false }],
            remaining: postRemaining,
          }),
        };
      }
      return { status: 200, json: async () => ({ cards: [] }) };
    },
    document: {
      readyState: "complete",
      documentElement: { lang: "en" },
      querySelector: (sel: string) => {
        if (sel === "#guide-ask .bubble") return guideAskBubble;
        if (sel === "#guide .bubble") return guideBubble;
        if (sel === "[data-step]:not([hidden])") {
          for (const n of ["1", "2", "3"]) {
            if (!sections[n].hidden) return sections[n];
          }
          return null;
        }
        const step = sel.match(/\[data-step="(\d)"\]/);
        if (step) return sections[step[1]] ?? null;
        const ind = sel.match(/\[data-step-ind="(\d)"\]/);
        if (ind) {
          return makeEl({
            querySelector: () =>
              makeEl({ textContent: `${ind[1]} step`, dataset: {} }),
          });
        }
        if (sel === "main") return makeEl();
        return null;
      },
      querySelectorAll: () => [],
      getElementById: (id: string) => byId[id] ?? null,
      addEventListener: () => {},
      createElement: () => {
        const e = makeEl();
        created.push(e);
        return e;
      },
    },
    window: {},
  };
  sandbox.window = {
    TarotDraw: {
      run: async () => {},
      renderReading: (
        _mount: unknown,
        _reading: unknown,
        _lang: unknown,
        _url: unknown,
        opts: { onDone: (s: string, f: string) => void; onFollowUp: (q: string) => void },
      ) => {
        followUp = opts;
        opts.onDone("A summary", "Full text");
      },
    },
    TarotHome: { refresh: () => {}, data: summary },
    sessionStorage: {
      store: {} as Record<string, string>,
      getItem(k: string) { return (this as { store: Record<string, string> }).store[k] ?? null; },
      setItem(k: string, v: string) { (this as { store: Record<string, string> }).store[k] = v; },
      removeItem(k: string) { delete (this as { store: Record<string, string> }).store[k]; },
    },
    scrollTo: () => {},
    addEventListener: () => {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ASK_PATH, "utf8"), sandbox, {
    filename: "ask.js",
  });
  await formHandlers.submit({ preventDefault: () => {} });
  if (summary) {
    await new Promise((r) => setTimeout(r, 300));
    return {
      guideAskBubble, guideBubble, question, created,
      location: sandbox.location as { href?: string },
      fetchCalls,
      session: sandbox.window.sessionStorage as unknown as { store: Record<string, string> },
    };
  }
  // The submit handler is fire-and-forget and the POST is slow by
  // design (1.7s): poll for the stream to start, then let the
  // deferred step-2→3 transition (280ms) settle.
  for (let i = 0; i < 100 && !followUp; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 400));
  // The user taps a suggested follow-up under the finished reading.
  if (!followUp) throw new Error("renderReading never ran");
  (followUp as { onFollowUp: (q: string) => void }).onFollowUp("Is it serious?");
  await new Promise((r) => setTimeout(r, 400));
  return { guideAskBubble, guideBubble, question, created };
}

describe("ask flow step-1 bubble", () => {
  it(
    "shows the idle hint (not a wait line) when a follow-up returns to step 1",
    async () => {
      const { guideAskBubble, guideBubble, question } =
        await runFollowUpFlow();
      // The finished reading announces itself on the visible cat…
      expect(guideBubble.textContent).toBe(READY_LINE);
      // …while step 1 goes back to the idle hint, not a wait line.
      expect(question.value).toBe("Is it serious?");
      expect(guideAskBubble.textContent).toBe(IDLE_HINT);
    },
    15000,
  );

  it("never leaves the reported stale wait line behind", async () => {
    const { guideAskBubble } = await runFollowUpFlow();
    expect(guideAskBubble.textContent).not.toBe(WAIT_LINE);
  }, 15000);

  it("under 5 credits: guest is sent to sign-in then billing, question preserved, no draw POST", async () => {
    const summary = {
      quota: { used: 1, limit: 1, resetsAt: null },
      tokens: { remaining: 0, freeLeft: 0, balance: 3 },
      user: { isAnonymous: true },
      openReading: null,
    };
    const r = await runFollowUpFlow(2, summary) as unknown as {
      location: { href?: string };
      fetchCalls: string[];
      session: { store: Record<string, string> };
      question: { value: string };
    };
    expect(r.location.href).toBe("/sign-in?return=%2Fbilling");
    expect(r.fetchCalls.some((u) => u.includes("/api/readings"))).toBe(false);
    expect(r.session.store["tarotnice:pending-question"]).toBe(r.question.value || "Will it go well?");
  }, 15000);

  it("still shows Ask again when the last free question was just used (remaining 0)", async () => {
    const { created } = await runFollowUpFlow(0);
    const labels = created.map((e) => String(e.textContent || ""));
    expect(labels.some((l) => l.startsWith("Ask again"))).toBe(true);
  }, 15000);
});
