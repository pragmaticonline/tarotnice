import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Renderer regression test for expert-spread readings: the model now
// leads each card paragraph with its spread position
// ("1 · What are my options — **Two of Wands**: ..."). The renderer
// must strip that prefix before card matching, show it above the card
// name, and keep rendering old position-less paragraphs.
const DRAW_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/draw.js",
);

function makeEl() {
  return {
    tag: "",
    className: "",
    innerHTML: "",
    textContent: "",
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    children: [] as unknown[],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    addEventListener() {},
    appendChild(c: unknown) {
      (this as unknown as { children: unknown[] }).children.push(c);
      return c;
    },
    querySelector() {
      return null;
    },
  };
}

type ESHandler = (e: { data: string }) => void;

function loadDraw() {
  const handlers: Record<string, ESHandler> = {};
  const intervals: (() => void)[] = [];
  const clock = { now: 1_000_000 };
  const sandbox: Record<string, unknown> = {
    window: {} as Record<string, unknown>,
    document: { createElement: () => makeEl(), querySelector: () => null },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: (fn: () => void) => {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval: () => {},
    Date: { now: () => clock.now },
    EventSource: class {
      url: string;
      closed = false;
      constructor(url: string) {
        this.url = url;
        (sandbox.__es as unknown[]).push(this);
      }
      addEventListener(ev: string, fn: ESHandler) {
        handlers[ev] = fn;
      }
      close() {
        this.closed = true;
      }
    },
    __es: [] as unknown[],
  };
  sandbox.window = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(DRAW_PATH, "utf8"), sandbox, { filename: "draw.js" });
  const TarotDraw = (sandbox.window as Record<string, unknown>).TarotDraw as {
    renderReading: (
      mount: unknown,
      reading: unknown,
      lang: string,
      streamUrl: string,
      opts: unknown,
    ) => { close: () => void };
  };
  return {
    TarotDraw,
    handlers,
    intervals,
    clock,
    esList: sandbox.__es as { closed: boolean }[],
  };
}

function renderOnce(fullText: string, lang = "en") {
  const { TarotDraw, handlers } = loadDraw();
  const mount = makeEl();
  const reading = {
    id: "r1",
    cards: [
      { name: "Two of Wands", keywords: ["planning"], image: "/a.png", image2x: "", reversed: false },
      { name: "Eight of Cups", keywords: ["walking away"], image: "/b.png", image2x: "", reversed: false },
      { name: "The Star", keywords: ["hope"], image: "/c.png", image2x: "", reversed: false },
    ],
  };
  TarotDraw.renderReading(mount, reading, lang, "/stream", {});
  handlers["delta"]({ data: JSON.stringify(fullText) });
  const synth = (mount.children as ReturnType<typeof makeEl>[]).find((c) =>
    String(c.className).includes("rtext"),
  );
  return synth ? String(synth.innerHTML) : "";
}

describe("renderReading positions", () => {
  it("renders position-led card paragraphs with the position shown", () => {
    const html = renderOnce(
      "Together these cards tell a story of change.\n\n" +
        "1 · What are my options — **Two of Wands**: You stand between security and a wider world.\n\n" +
        "2 · Am I where I want to be — Eight of Cups: Your job no longer gives what you need.\n\n" +
        "Summary: Map options before stepping out.",
    );
    expect(html).toContain("card-row");
    expect(html).toContain("pos-line");
    expect(html).toContain("What are my options");
    expect(html).toContain("Two of Wands");
    expect(html).toContain("Eight of Cups");
    // The position prefix must not leak into the body copy.
    expect(html).not.toContain("1 · What are my options —");
  });

  it("holds a shimmer slot for the lead until the Summary streams in", () => {
    const { TarotDraw, handlers } = loadDraw();
    const mount = makeEl();
    const reading = {
      id: "r1",
      cards: [
        { name: "Two of Wands", keywords: ["planning"], image: "/a.png", image2x: "", reversed: false },
      ],
    };
    TarotDraw.renderReading(mount, reading, "en", "/stream", {});
    const synthOf = () =>
      (mount.children as ReturnType<typeof makeEl>[]).find((c) =>
        String(c.className).includes("rtext"),
      );
    handlers["delta"]({ data: JSON.stringify("Together these cards tell a story of change.") });
    let html = String(synthOf()!.innerHTML);
    expect(html).toContain("is-waiting");
    expect(html).toContain("lead-ngern");
    expect(html).toContain("Putting it all together");
    expect(html).not.toContain("glance-lead\">Map");
    handlers["delta"]({
      data: JSON.stringify(
        "\n\n1 · What are my options — **Two of Wands**: plan well.\n\nSummary: Map options before stepping out.",
      ),
    });
    html = String(synthOf()!.innerHTML);
    expect(html).not.toContain("is-waiting");
    expect(html).toContain("Map options before stepping out");
  });

  it("keeps rendering old position-less paragraphs without a pos line", () => {
    const html = renderOnce(
      "Together these cards tell a story of change.\n\n" +
        "**The Star**: Rest and recovery return little by little.\n\n" +
        "Summary: Rest gently.",
    );
    expect(html).toContain("card-row");
    expect(html).toContain("The Star");
    expect(html).not.toContain("pos-line");
  });

  it("renders card paragraphs whose position contains a colon (live bug: card 1 fell back to '1.' text)", () => {
    const html = renderOnce(
      "Together these cards tell a story of change.\n\n" +
        "1 · What to do: next steps — **Two of Wands**: You stand between security and a wider world.\n\n" +
        "2 · Am I where I want to be — **Eight of Cups**: Your job no longer gives what you need.\n\n" +
        "3 · What do I fear most — **The Star**: Hope returns little by little.\n\n" +
        "Summary: Map options before stepping out.",
    );
    // All three cards get thumbnail rows; the raw "1 ·" prefix never leaks.
    expect(html.match(/card-thumb/g)).toHaveLength(3);
    expect(html).toContain("Two of Wands");
    expect(html).toContain("Eight of Cups");
    expect(html).toContain("The Star");
    expect(html).not.toContain("<p>1 ·");
    expect(html).toContain("What to do: next steps");
  });

  it("bold **Summary:** line fills the At-a-glance lead (no waiting cat)", () => {
    const html = renderOnce(
      "Together these cards tell a story of change.\n\n" +
        "**Two of Wands**: You stand between security and a wider world.\n\n" +
        "**Summary:** Map options before stepping out.",
    );
    expect(html).not.toContain("is-waiting");
    expect(html).toContain("Map options before stepping out.");
  });

  it("bold Thai summary line fills the At-a-glance lead (no waiting cat)", () => {
    const html = renderOnce(
      "Together these cards tell a story of change.\n\n" +
        "**Two of Wands**: You stand between security and a wider world.\n\n" +
        "**\u0e2a\u0e23\u0e38\u0e1b:** \u0e27\u0e32\u0e07\u0e41\u0e1c\u0e19\u0e01\u0e48\u0e2d\u0e19\u0e01\u0e49\u0e32\u0e27\u0e2d\u0e2d\u0e01\u0e44\u0e1b",
      "th",
    );
    expect(html).not.toContain("is-waiting");
    expect(html).toContain("\u0e27\u0e32\u0e07\u0e41\u0e1c\u0e19\u0e01\u0e48\u0e2d\u0e19\u0e01\u0e49\u0e32\u0e27\u0e2d\u0e2d\u0e01\u0e44\u0e1b");
  });

  it("done with no Summary line still clears the waiting cat via server summary", () => {
    const { TarotDraw, handlers } = loadDraw();
    const mount = makeEl();
    const reading = {
      id: "r1",
      cards: [
        { name: "Two of Wands", keywords: ["planning"], image: "/a.png", image2x: "", reversed: false },
      ],
    };
    TarotDraw.renderReading(mount, reading, "en", "/stream", {});
    handlers["delta"]({
      data: JSON.stringify("Together these cards tell a story.\n\n**Two of Wands**: plan well."),
    });
    handlers["done"]({ data: JSON.stringify({ summary: "Server side summary." }) });
    const synth = (mount.children as ReturnType<typeof makeEl>[]).find((c) =>
      String(c.className).includes("rtext"),
    );
    const html = String(synth!.innerHTML);
    expect(html).not.toContain("is-waiting");
    expect(html).toContain("Server side summary.");
  });

  it("watchdog re-opens a silent stream and does not duplicate text", () => {
    const { TarotDraw, handlers, intervals, clock, esList } = loadDraw();
    const mount = makeEl();
    const reading = {
      id: "r1",
      cards: [
        { name: "Two of Wands", keywords: ["planning"], image: "/a.png", image2x: "", reversed: false },
      ],
    };
    const errors: string[] = [];
    TarotDraw.renderReading(mount, reading, "en", "/stream", {
      onError: (k: string) => errors.push(k),
    });
    handlers["delta"]({ data: JSON.stringify("Together these cards tell a story.") });
    expect(esList).toHaveLength(1);
    // 61s of silence: watchdog closes the dead source and reconnects.
    clock.now += 61_000;
    intervals[0]();
    expect(esList).toHaveLength(2);
    expect(esList[0].closed).toBe(true);
    // Server replays from the start on the new connection; the client
    // reset `full`, so the replayed text renders once, not twice.
    handlers["delta"]({ data: JSON.stringify("Together these cards tell a story.") });
    const synth = (mount.children as ReturnType<typeof makeEl>[]).find((c) =>
      String(c.className).includes("rtext"),
    );
    const html = String(synth!.innerHTML);
    expect(html.match(/Together these cards/g)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("watchdog gives up after 5 silent reconnects via onError", () => {
    const { TarotDraw, intervals, clock, esList } = loadDraw();
    const mount = makeEl();
    const reading = { id: "r1", cards: [] };
    const errors: string[] = [];
    TarotDraw.renderReading(mount, reading, "en", "/stream", {
      onError: (k: string) => errors.push(k),
    });
    for (let i = 0; i < 6; i++) {
      clock.now += 61_000;
      intervals[0]();
    }
    expect(esList.length).toBeGreaterThanOrEqual(5);
    expect(errors).toEqual(["reading_failed"]);
  });

  it("tolerates Card N, paren and bolded leads", () => {
    const html = renderOnce(
      "Together these cards tell a story of change.\n\n" +
        "Card 1 (What are my options): **Two of Wands**. You stand between security and a wider world.\n\n" +
        "2) Am I where I want to be — **Eight of Cups**: Your job no longer gives what you need.\n\n" +
        "**3 · What do I fear most — The Star**: Hope returns little by little.\n\n" +
        "Summary: Map options before stepping out.",
    );
    expect(html.match(/card-thumb/g)).toHaveLength(3);
    expect(html).not.toContain("<p>Card 1");
    expect(html).not.toContain("<p>2)");
  });
});
