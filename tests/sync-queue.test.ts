import { describe, expect, it } from "vitest";
import { createQueue } from "../public/app/sync-queue.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

describe("sync queue", () => {
  it("accumulates completions in order", () => {
    const q = createQueue(memoryStorage());
    q.enqueue("listen-match");
    q.enqueue("image-phrase");
    expect(q.pending().map((p) => p.activity)).toEqual([
      "listen-match",
      "image-phrase",
    ]);
  });

  it("flush posts all in order and clears", async () => {
    const q = createQueue(memoryStorage());
    q.enqueue("listen-match");
    q.enqueue("image-phrase");
    const posted = [];
    const result = await q.flush(async (item) => {
      posted.push(item.activity);
    });
    expect(posted).toEqual(["listen-match", "image-phrase"]);
    expect(result).toEqual({ flushed: 2, remaining: 0 });
    expect(q.pending()).toEqual([]);
  });

  it("flush stops at the first failure and keeps the rest", async () => {
    const q = createQueue(memoryStorage());
    q.enqueue("listen-match");
    q.enqueue("image-phrase");
    q.enqueue("speak-score");
    const posted = [];
    const result = await q.flush(async (item) => {
      if (item.activity === "image-phrase") throw new Error("offline");
      posted.push(item.activity);
    });
    expect(posted).toEqual(["listen-match"]);
    expect(result).toEqual({ flushed: 1, remaining: 2 });
    expect(q.pending().map((p) => p.activity)).toEqual([
      "image-phrase",
      "speak-score",
    ]);
  });

  it("empty flush is a no-op", async () => {
    const q = createQueue(memoryStorage());
    let called = false;
    const result = await q.flush(async () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(result).toEqual({ flushed: 0, remaining: 0 });
  });
});
