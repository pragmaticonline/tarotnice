// Offline progress queue: pending completions persisted in storage
// (localStorage in the browser, in-memory stand-in in tests) and flushed
// in order when the network returns. Zero dependencies.

const KEY = "tarotnice:pending";

export function createQueue(storage) {
  function pending() {
    try {
      return JSON.parse(storage.getItem(KEY) ?? "[]");
    } catch {
      return [];
    }
  }

  function save(items) {
    storage.setItem(KEY, JSON.stringify(items));
  }

  return {
    pending,

    enqueue(activity, lessonId = "lesson-01") {
      const items = pending();
      items.push({ lessonId, activity, at: Date.now() });
      save(items);
    },

    // Posts each item in order. Stops at the first failure so server-side
    // order gating never sees a reordered or gapped sequence.
    async flush(post) {
      const items = pending();
      let flushed = 0;
      for (const item of items) {
        try {
          await post(item);
        } catch {
          break;
        }
        flushed++;
      }
      save(items.slice(flushed));
      return { flushed, remaining: items.length - flushed };
    },
  };
}
