import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Live canary: real Google/Bing endpoints. Not part of `npm test`; run before releases and when users report breakage.
export default defineConfig({
  plugins: [WxtVitest()],
  test: { include: ['tests/smoke/**/*.test.ts'], environment: 'node', testTimeout: 20_000 },
});
