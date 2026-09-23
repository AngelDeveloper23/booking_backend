import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Reservation tests intentionally fire concurrent requests against the
    // same SQLite file; running test files in parallel workers would let
    // unrelated suites contend for the same db connection.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
