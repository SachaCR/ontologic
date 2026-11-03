import { defineConfig } from "vitest/config";

import { loadLocalEnv } from "./src/env";

export default defineConfig(({ mode }) => {
  // `pnpm test:brokers` (`--mode brokers`) points the opt-in broker suites at
  // the brokers in .env. Plain `pnpm test` leaves .env alone, so they skip.
  if (mode === "brokers" && !loadLocalEnv()) {
    throw new Error(
      "pnpm test:brokers reads .env, and there is none: cp .env.example .env",
    );
  }

  return {
    test: {
      include: ["src/**/__tests__/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      reporters: ["default", "html"],
      outputFile: {
        html: "./reports/index.html",
      },
      coverage: {
        enabled: true,
        provider: "v8",
        reporter: ["html"],
        reportsDirectory: "./reports/coverage",
        exclude: [
          "**/node_modules/**",
          "**/dist/**",
          "**/*.config.*",
          "**/__tests__/**",
        ],
      },
    },
  };
});
