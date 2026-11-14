import { expect, test } from '@playwright/test';

test('stable input keeps its native box fixed as text overflows', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#plain-user').locator('xpath=..');
  const input = page.locator('#plain-user');
  await expect(host).toHaveAttribute('data-stable-input', '');
  await input.fill('');
  const before = await input.boundingBox();
  await input.fill('a-username-long-enough-to-overflow-the-fixed-width-input-box');
  const after = await input.boundingBox();
  expect(after?.x).toBeCloseTo(before!.x, 1);
  expect(after?.width).toBeCloseTo(before!.width, 1);
  await expect.poll(() => host.evaluate((element) => element.hasAttribute('data-fade-left') || element.hasAttribute('data-fade-right'))).toBe(true);
});

test('stable input stays fixed behind a prefix', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#prefix-user').locator('xpath=..');
  const input = page.locator('#prefix-user');
  await expect(host).toHaveAttribute('data-stable-input', '');
  await input.fill('');
  const before = await input.boundingBox();
  await input.fill('a-prefixed-username-long-enough-to-overflow-the-fixed-width-input');
  const after = await input.boundingBox();
  expect(after?.x).toBeCloseTo(before!.x, 1);
  expect(after?.width).toBeCloseTo(before!.width, 1);
});

test('a following suffix keeps the measured-width behavior', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#suffix').locator('xpath=..');
  const input = page.locator('#suffix');
  await expect(host).not.toHaveAttribute('data-stable-input', '');
  await input.fill('');
  await expect.poll(async () => (await input.boundingBox())?.width).toBeLessThanOrEqual(2);
  await input.fill('a-much-longer-value-that-expands-the-input-before-its-suffix');
  await expect.poll(async () => (await input.boundingBox())?.width).toBeGreaterThan(2);
});

test('stable eligibility follows changing affixes', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#prefix-user').locator('xpath=..');
  await expect(host).toHaveAttribute('data-stable-input', '');
  await host.evaluate((element) => element.querySelector('input')!.insertAdjacentElement('afterend', document.createElement('span')));
  await expect(host).not.toHaveAttribute('data-stable-input', '');
  await host.evaluate((element) => element.querySelector('span:last-of-type')!.remove());
  await expect(host).toHaveAttribute('data-stable-input', '');
  await host.locator('span').evaluate((element) => { element.textContent = 'a-prefix-too-wide-to-leave-enough-room-for-the-input'; });
  await expect(host).not.toHaveAttribute('data-stable-input', '');
});
