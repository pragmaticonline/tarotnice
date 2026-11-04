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
  const formControls: Record<string, unknown>[] = [];
  const docListeners: Record<string, ((e: unknown) => void)[]> = {};
  // The top-up sheet is always in the page: pre-fix, any gate opened it
  // (even for guests, whose only action inside is another sign-in link).
  const packSheet = makeEl({ hidden: true });
  const form = makeEl({
    addEventListener: (type: string, fn: (e: unknown) => unknown) => {
      formHandlers[type] = fn;
    },
    querySelector: () => null,
    querySelectorAll: () => formControls,
  });
  const question = makeEl({ value: "Will tomorrow go well?" });
  const askLabel = makeEl({ textContent: "What would you like to ask today?" });
  const readQ = makeEl();
  const freshRow = makeEl({ hidden: true });
  const freshLink = makeEl();
  const freshHandlers: Record<string, (e: unknown) => unknown> = {};
  freshLink.addEventListener = (type: string, fn: (e: unknown) => unknown) => {
    freshHandlers[type] = fn;
  };
  let followUp: { onFollowUp: (q: string) => void } | null = null;
  const byId: Record<string, unknown> = {
    "ask-form": form,
    q: question,
    "guide-ask": makeEl({ querySelector: () => guideAskBubble }),
    guide: makeEl({ querySelector: () => guideBubble }),
    "draw-topic": makeEl(),
    "draw-q": makeEl(),
    "read-eyebrow": makeEl(),
    "read-q": readQ,
    "ask-label": askLabel,
    "fresh-ask-row": freshRow,
    "fresh-ask-link": freshLink,
    "pack-sheet": packSheet,
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
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        (docListeners[type] ||= []).push(fn);
      },
      createElement: () => {
        const e = makeEl();
        const handlers: Record<string, (e: unknown) => unknown> = {};
        e.addEventListener = (type: string, fn: (e: unknown) => unknown) => {
          handlers[type] = fn;
        };
        e.handlers = handlers;
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
  return { guideAskBubble, guideBubble, question, created, askLabel, readQ, freshRow, freshHandlers, readingOpts: followUp, win: sandbox.window, location: sandbox.location as { href?: string }, formControls, docListeners, packSheet };
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

  it("under 5 tokens: guest is sent to sign-in then billing, question preserved, no draw POST", async () => {
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

  it("still shows Follow up when the last free question was just used (remaining 0)", async () => {
    const { created } = await runFollowUpFlow(0);
    const labels = created.map((e) => String(e.textContent || ""));
    expect(labels.some((l) => l.startsWith("Follow up"))).toBe(true);
  }, 15000);

  it("Follow up reopens the ask form titled as a follow-up on the finished reading", async () => {
    const { created, question, askLabel, readQ } = await runFollowUpFlow(0) as unknown as {
      created: Record<string, unknown>[];
      question: Record<string, unknown>;
      askLabel: Record<string, unknown>;
      readQ: Record<string, unknown>;
    };
    readQ.textContent = "\u201cWill tomorrow go well?\u201d";
    const btn = created.find((e) => String(e.textContent || "").startsWith("Follow up"));
    expect(btn).toBeTruthy();
    ((btn as Record<string, unknown>).handlers as Record<string, (e: unknown) => unknown>).click({});
    expect(question.value).toBe("");
    expect(askLabel.textContent).toBe("This is a follow-up on \u201cWill tomorrow go well?\u201d");
  }, 15000);

  it("offers a fresh-question escape under the follow-up label", async () => {
    // remaining 1: the reading did not exhaust quota, so the cat is
    // awake and a fresh start returns the full idle state.
    const { created, question, askLabel, readQ, freshRow, freshHandlers, guideAskBubble, win } = await runFollowUpFlow(1) as unknown as {
      created: Record<string, unknown>[];
      question: Record<string, unknown>;
      askLabel: Record<string, unknown>;
      readQ: Record<string, unknown>;
      freshRow: Record<string, unknown>;
      freshHandlers: Record<string, (e: unknown) => unknown>;
      guideAskBubble: Record<string, unknown>;
      win: Record<string, unknown>;
    };
    readQ.textContent = "\u201cWill tomorrow go well?\u201d";
    const btn = created.find((e) => String(e.textContent || "").startsWith("Follow up"));
    ((btn as Record<string, unknown>).handlers as Record<string, (e: unknown) => unknown>).click({});
    expect(askLabel.textContent).toContain("follow-up on");
    expect(freshRow.hidden).toBe(false);
    // Dirty the fresh state first, like a previous ask would.
    win.__tnTopic = "love";
    guideAskBubble.textContent = "stale bubble";
    freshHandlers.click({});
    expect(question.value).toBe("");
    expect(askLabel.textContent).toBe("What would you like to ask today?");
    expect(freshRow.hidden).toBe(true);
    expect(win.__tnTopic).toBe("general");
    expect(guideAskBubble.textContent).toBe("Hi, I'm Ngern. Ask me anything.");
  }, 15000);

  it("Ask something new under Explore further starts a fresh question", async () => {
    // remaining 1: the reading did not exhaust quota, so the cat is
    // awake and a fresh start returns the full idle state.
    const { created, question, askLabel, readQ, freshRow, readingOpts, guideAskBubble, win } = await runFollowUpFlow(1) as unknown as {
      created: Record<string, unknown>[];
      question: Record<string, unknown>;
      askLabel: Record<string, unknown>;
      readQ: Record<string, unknown>;
      freshRow: Record<string, unknown>;
      readingOpts: { onFreshAsk: () => void } | null;
      guideAskBubble: Record<string, unknown>;
      win: Record<string, unknown>;
    };
    readQ.textContent = "\u201cWill tomorrow go well?\u201d";
    // Enter follow-up mode first so there is context to drop.
    const btn = created.find((e) => String(e.textContent || "").startsWith("Follow up"));
    ((btn as Record<string, unknown>).handlers as Record<string, (e: unknown) => unknown>).click({});
    expect(freshRow.hidden).toBe(false);
    expect(readingOpts).toBeTruthy();
    win.__tnTopic = "love";
    guideAskBubble.textContent = "stale bubble";
    readingOpts!.onFreshAsk();
    expect(question.value).toBe("");
    expect(askLabel.textContent).toBe("What would you like to ask today?");
    expect(freshRow.hidden).toBe(true);
    expect(win.__tnTopic).toBe("general");
    expect(guideAskBubble.textContent).toBe("Hi, I'm Ngern. Ask me anything.");
  }, 15000);

  it("sleep mode leaves every form control enabled so taps reach the gates", async () => {
    const r = await runFollowUpFlow(0) as unknown as {
      formControls: Record<string, unknown>[];
      docListeners: Record<string, ((e: unknown) => void)[]>;
    };
    const ta = makeEl({});
    const submit = makeEl({});
    const fresh = makeEl({});
    (fresh as Record<string, unknown>).id = "fresh-ask-link";
    r.formControls.push(ta, submit, fresh);
    const onSummary = (r.docListeners["tarot:summary"] || [])[0];
    expect(onSummary).toBeTruthy();
    onSummary({ detail: { quota: { used: 3, limit: 3, resetsAt: null } } });
    // Disabled controls swallow taps silently; the gates below must see them.
    expect(ta.disabled).toBeFalsy();
    expect(submit.disabled).toBeFalsy();
    expect(fresh.disabled).toBeFalsy();
  }, 15000);

  it("fresh start while asleep clears the staged question but keeps the resting cat and does not navigate", async () => {
    const r = await runFollowUpFlow(0) as unknown as {
      question: Record<string, unknown>;
      askLabel: Record<string, unknown>;
      freshHandlers: Record<string, (e: unknown) => unknown>;
      guideAskBubble: Record<string, unknown>;
      location: { href?: string };
      docListeners: Record<string, ((e: unknown) => void)[]>;
    };
    const onSummary = (r.docListeners["tarot:summary"] || [])[0];
    onSummary({ detail: { quota: { used: 3, limit: 3, resetsAt: null } } });
    expect(r.guideAskBubble.textContent).toBe("Ngern is resting now. New questions tomorrow.");
    r.freshHandlers.click({});
    expect(r.question.value).toBe("");
    expect(r.askLabel.textContent).toBe("What would you like to ask today?");
    // Resting state is preserved: no idle bubble over the sleeping cat,
    // and no navigation anywhere.
    expect(r.guideAskBubble.textContent).toBe("Ngern is resting now. New questions tomorrow.");
    expect(r.location.href).toBeUndefined();
  }, 15000);

  it("fresh start with no tokens routes to top-up and leaves the resting UI alone", async () => {
    const r = await runFollowUpFlow(0) as unknown as {
      question: Record<string, unknown>;
      askLabel: Record<string, unknown>;
      freshHandlers: Record<string, (e: unknown) => unknown>;
      guideAskBubble: Record<string, unknown>;
      location: { href?: string };
      win: Record<string, unknown>;
    };
    (r.win.TarotHome as { data: unknown }).data = {
      tokens: { remaining: 0, freeTotal: 0 },
      quota: { used: 3, limit: 3, resetsAt: null },
      user: { isAnonymous: true },
    };
    r.guideAskBubble.textContent = "stale bubble";
    r.freshHandlers.click({});
    expect(r.question.value).toBe("");
    expect(r.askLabel.textContent).toBe("What would you like to ask today?");
    expect(r.guideAskBubble.textContent).toBe("stale bubble");
    expect(r.location.href).toBe("/sign-in?return=%2Fbilling");
  }, 15000);

  // Any tap inside the ask form — shuffle button, input box, or a
  // suggested-question chip — takes the same document-capture path.
  function inFormTap(prevented: { v: boolean }) {
    return {
      target: { closest: (sel: string) => (sel === "#ask-form" ? {} : null) },
      preventDefault: () => { prevented.v = true; },
    };
  }

  it("out-of-tokens guest tapping the ask form goes straight to sign-in", async () => {
    const r = await runFollowUpFlow(1) as unknown as {
      location: { href?: string };
      docListeners: Record<string, ((e: unknown) => void)[]>;
      packSheet: Record<string, unknown>;
      win: Record<string, unknown>;
    };
    (r.win.TarotHome as { data: unknown }).data = {
      tokens: { remaining: 0, freeTotal: 0 },
      quota: { used: 3, limit: 3, resetsAt: null },
      user: { isAnonymous: true },
    };
    const onDocClick = (r.docListeners["click"] || [])[0];
    expect(onDocClick).toBeTruthy();
    const prevented = { v: false };
    onDocClick(inFormTap(prevented));
    expect(prevented.v).toBe(true);
    // Guests skip the top-up sheet: its only guest action is a
    // sign-in link to the same destination.
    expect(r.packSheet.hidden).toBe(true);
    expect(r.location.href).toBe("/sign-in?return=%2Fbilling");
  }, 15000);

  it("out-of-tokens registered user tapping the ask form gets the top-up sheet", async () => {
    const r = await runFollowUpFlow(1) as unknown as {
      location: { href?: string };
      docListeners: Record<string, ((e: unknown) => void)[]>;
      packSheet: Record<string, unknown>;
      win: Record<string, unknown>;
    };
    (r.win.TarotHome as { data: unknown }).data = {
      tokens: { remaining: 0, freeTotal: 0 },
      quota: { used: 3, limit: 3, resetsAt: null },
      user: { isAnonymous: false },
    };
    const onDocClick = (r.docListeners["click"] || [])[0];
    onDocClick(inFormTap({ v: false }));
    expect(r.packSheet.hidden).toBe(false);
    expect(r.location.href).toBeUndefined();
  }, 15000);

  it("sleeping guest tapping the ask form is routed to sign-in", async () => {
    const r = await runFollowUpFlow(1) as unknown as {
      location: { href?: string };
      docListeners: Record<string, ((e: unknown) => void)[]>;
      win: Record<string, unknown>;
    };
    (r.win.TarotHome as { data: unknown }).data = {
      tokens: { remaining: 5 },
      quota: { used: 3, limit: 3, resetsAt: null },
      user: { isAnonymous: true },
    };
    // Quota-only summary (no tokens key): the quota branch sleeps.
    const onSummary = (r.docListeners["tarot:summary"] || [])[0];
    onSummary({ detail: { quota: { used: 3, limit: 3, resetsAt: null } } });
    const onDocClick = (r.docListeners["click"] || [])[0];
    onDocClick(inFormTap({ v: false }));
    expect(r.location.href).toBe("/sign-in?return=%2Fbilling");
  }, 15000);
});
