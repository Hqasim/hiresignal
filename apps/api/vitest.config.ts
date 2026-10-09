import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'evals/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main/**'],
      reporter: ['text-summary', 'lcov'],
      // SPEC §14 coverage gates, plus the Phase 3 bar for the safety layer (SPEC §20): redaction
      // and the injection guard are the code a reviewer most needs to trust.
      thresholds: {
        'src/domain/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/domain/redaction/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/domain/guard/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/application/**': { lines: 80, branches: 80, functions: 80, statements: 80 },
      },
    },
  },
});
