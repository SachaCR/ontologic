import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    reporters: ['default', 'html'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.config.*',
        '**/__tests__/**',
      ],
    },
  },
});
