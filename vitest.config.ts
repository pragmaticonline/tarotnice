import { defineConfig } from "vitest/config";

// .content/ holds the private content checkout post-merge; its tests/
// mirror would otherwise run twice (and fail: their ../src imports
// resolve inside .content/). The merge copies owned tests into tests/,
// which is the only suite vitest runs.
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.idea/**",
      "**/.git/**",
      "**/.cache/**",
      "**/.content/**",
    ],
  },
});
