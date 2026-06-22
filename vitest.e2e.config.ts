import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/e2e/**/*.test.ts'],
    // E2E tests involving Podman builds can take several minutes
    testTimeout: 300_000, // 5 minutes
  },
});
