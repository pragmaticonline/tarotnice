import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression test: GET /api/me/summary went through the service
// worker's cache-first tail, so a normal refresh kept showing
// yesterday's quota (only a hard refresh bypassed the worker).
// The worker must never serve API responses from cache.
const SW_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/sw.js",
);

type FetchHandler = (event: {
  request: { url: string; method: string; mode: string };
  respondWith: (p: Promise<unknown>) => void;
}) => void;

function loadFetchHandler(network: (url: string) => Promise<unknown>): FetchHandler {
  const store = new Map<string, unknown>();
  const cache = {
    match: async (req: { url: string }) => store.get(req.url) ?? null,
    put: async (req: { url: string }, res: unknown) => {
      store.set(req.url, res);
    },
  };
  const handlers = new Map<string, FetchHandler>();
  const sandbox: Record<string, unknown> = {
    URL,
    location: { origin: "https://tarotnice.com" },
    caches: {
      open: async () => cache,
      keys: async () => [] as string[],
      match: async (req: { url: string }) => store.get(req.url) ?? null,
      delete: async () => true,
    },
    fetch: async (req: { url: string }) => network(req.url),
    self: {
      addEventListener: (type: string, fn: FetchHandler) => {
        handlers.set(type, fn);
      },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(SW_PATH, "utf8"), sandbox, {
    filename: "sw.js",
  });
  const fetchHandler = handlers.get("fetch");
  if (!fetchHandler) throw new Error("sw.js registered no fetch handler");
  return fetchHandler;
}

// When the worker does not call respondWith, the browser falls
// through to the network — model that here.
function getEvent(url: string, mode = "cors") {
  let promise: Promise<unknown> | null = null;
  const event = {
    request: { url, method: "GET", mode },
    respondWith(p: Promise<unknown>) {
      promise = p;
    },
  };
  return {
    event,
    done: (network: () => Promise<unknown>) => (promise ?? network()),
  };
}

function apiResponse(used: number) {
  return {
    ok: true,
    used,
    clone() {
      return apiResponse(used);
    },
  };
}

describe("service worker API freshness", () => {
  it("never serves /api/me/summary from cache", async () => {
    let networkCalls = 0;
    // Quota resets overnight: first load sees used=2, next day used=0.
    const onNetwork = () => Promise.resolve(apiResponse(networkCalls++ === 0 ? 2 : 0));
    const onFetch = loadSW(onNetwork);

    const first = getEvent("https://tarotnice.com/api/me/summary");
    onFetch(first.event);
    expect(((await first.done(onNetwork)) as { used: number }).used).toBe(2);

    // A normal refresh must hit the network again, not the cache.
    const second = getEvent("https://tarotnice.com/api/me/summary");
    onFetch(second.event);
    expect(((await second.done(onNetwork)) as { used: number }).used).toBe(0);
    expect(networkCalls).toBe(2);
  });

  it("still serves versioned /static/ art cache-first", async () => {
    let networkCalls = 0;
    const onNetwork = () => {
      networkCalls++;
      return Promise.resolve({ ok: true, clone() { return this; } });
    };
    const onFetch = loadSW(onNetwork);

    const url = "https://tarotnice.com/static/cards/major-00.png";
    const first = getEvent(url);
    onFetch(first.event);
    await first.done(onNetwork);
    const second = getEvent(url);
    onFetch(second.event);
    await second.done(onNetwork);
    expect(networkCalls).toBe(1);
  });
});

function loadSW(network: (url: string) => Promise<unknown>): FetchHandler {
  return loadFetchHandler(network);
}
