import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    outputFile: {
      html: "./reports/index.html",
    },
    reporters: ["default", "html"],
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
});
