import { expect, test } from '@playwright/test';

// Runs in Node, like a server renderer (Next.js, Astro, Remix) importing the package.
test('importing on the server does not throw', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'No browser involved; run once.');
  const sabi = await import('sabi-input');
  expect(typeof sabi.define).toBe('function');
  expect(() => sabi.define()).not.toThrow();
});
