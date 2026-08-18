import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],

    // Every suite here builds a real ts.Program in beforeAll — around a quarter
    // of a second locally, but this package's work is compiler-bound and CI
    // runs the files in parallel on far fewer cores. Vitest's 10s default is
    // sized for unit tests that touch nothing; these hooks legitimately need
    // more headroom, and a timeout here reports as a failed suite rather than a
    // slow one, which is badly misleading.
    hookTimeout: 60_000,
    testTimeout: 30_000,

    reporters: ["default", "html"],
    outputFile: {
      html: "./reports/index.html",
    },

    coverage: {
      // Off deliberately, unlike the sibling packages. These tests drive the
      // TypeScript compiler, so v8 instruments several megabytes of typescript.js
      // in every worker — a large cost for coverage of code that is mostly not
      // ours. The HTML test report is unaffected.
      enabled: false,
    },
  },
});
