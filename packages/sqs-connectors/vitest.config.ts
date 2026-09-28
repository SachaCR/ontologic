import { defineConfig } from "vitest/config";

export default defineConfig({
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
});
