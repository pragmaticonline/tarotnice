import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The server renders a loading line ("Finding your questions…", never
// a wrong count). home.js replaces it with fresh /api/me/summary
// numbers; a failed fetch falls back to today's cached count when
// there is one, and otherwise keeps the loading line.
const HOME_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/home.js",
);

function makeClassList() {
  const set = new Set<string>();
  return {
    add: (c: string) => {
      set.add(c);
    },
    remove: (c: string) => {
      set.delete(c);
    },
    toggle: (c: string, on: boolean) => {
      if (on) set.add(c);
      else set.delete(c);
    },
    contains: (c: string) => set.has(c),
  };
}

function loadHome(
  fetchFn: (url: string) => Promise<{ json: () => Promise<unknown> }>,
  store: Record<string, string> = {},
) {
  const label = { textContent: "One moment please" };
  const row = {
    classList: makeClassList(),
    querySelector: () => label,
  };
  const sandbox: Record<string, unknown> = {
    console,
    setTimeout,
    clearTimeout,
    fetch: fetchFn,
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
    CustomEvent: class {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    document: {
      documentElement: { lang: "en" },
      querySelector: (sel: string) => {
        if (sel === ".quota") return row;
        if (sel === "[data-streak]") return null;
        return null;
      },
      addEventListener: () => {},
      dispatchEvent: () => true,
    },
    window: { addEventListener: () => {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(HOME_PATH, "utf8"), sandbox, {
    filename: "home.js",
  });
  return { label };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("quota loading line", () => {
  it("paints fresh numbers over the loading line", async () => {
    const { label } = loadHome(async () => ({
      json: async () => ({ user: { id: "u" }, quota: { used: 1, limit: 3 }, streak: null }),
    }));
    await tick();
    await tick();
    expect(label.textContent).toBe("2 of 3 questions left today");
  });

  it("shows tokens remaining (free + wallet) instead of questions left", async () => {
    const { label } = loadHome(async () => ({
      json: async () => ({
        user: { id: "u" },
        quota: { used: 0, limit: 1 },
        tokens: { balance: 50, freeLeft: 5, remaining: 11, configured: true },
        streak: null,
      }),
    }));
    await tick();
    await tick();
    expect(label.textContent).toBe("55 tokens remaining");
  });

  it("falls back to today's cached count when the fetch fails", async () => {
    const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const { label } = loadHome(
      () => Promise.reject(new Error("offline")),
      { "tarotnice:quota": JSON.stringify({ day, used: 2 }) },
    );
    await tick();
    await tick();
    expect(label.textContent).toBe("1 of 3 questions left today");
  });

  it("keeps the loading line when the fetch fails with no cache", async () => {
    const { label } = loadHome(() => Promise.reject(new Error("offline")));
    await tick();
    await tick();
    expect(label.textContent).toBe("One moment please");
  });
});
