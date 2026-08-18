import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.config.*',
    ],
    reporters: ["default", "html"],
    outputFile: {
      html: "./reports/index.html",
    },
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.config.*',
        '**/__tests__/**',
      ],
    },
  },
});
