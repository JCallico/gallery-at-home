import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/env.d.ts'],
      // Fails the run if coverage drops well below where it stands.
      thresholds: { lines: 75, statements: 75, functions: 70, branches: 65 },
    },
  },
  define: {
    __DEV__: 'false',
    __VERSION__: '"test"',
  },
});
