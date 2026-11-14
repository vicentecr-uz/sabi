import { expect, test } from '@playwright/test';

test('default input keeps its native box fixed as text overflows', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#plain-user').locator('xpath=..');
  const input = page.locator('#plain-user');
  await expect(host).toHaveAttribute('data-stable-input', '');
  await input.fill('');
  const before = await input.boundingBox();
  await input.focus();
  await input.pressSequentially('a-username-long-enough-to-overflow-the-fixed-width-input-box');
  const after = await input.boundingBox();
  expect(after?.x).toBeCloseTo(before!.x, 1);
  expect(after?.width).toBeCloseTo(before!.width, 1);
  await expect.poll(() => input.evaluate((element: HTMLInputElement) => Math.abs(element.scrollLeft))).toBeGreaterThan(0);
  expect(await host.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect(host).toHaveAttribute('data-fade-left', '');
  await expect(host).not.toHaveAttribute('data-caret-hidden', '');
});

test('default input stays fixed behind a short prefix', async ({ page }) => {
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

test('default RTL input keeps its box fixed while its native text scrolls', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const input = page.locator('#rtl-user');
  const host = input.locator('xpath=..');
  await expect(host).toHaveAttribute('data-stable-input', '');
  await input.fill('');
  const before = await input.boundingBox();
  await input.focus();
  await input.pressSequentially('اسم-مستخدم-طويل-يتجاوز-عرض-الحقل-بكثير');
  const after = await input.boundingBox();
  expect(after?.x).toBeCloseTo(before!.x, 1);
  expect(after?.width).toBeCloseTo(before!.width, 1);
  await expect.poll(() => input.evaluate((element: HTMLInputElement) => Math.abs(element.scrollLeft))).toBeGreaterThan(0);
  expect(await host.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect.poll(() => host.evaluate((element) => element.hasAttribute('data-fade-left') || element.hasAttribute('data-fade-right'))).toBe(true);
});

test('a following suffix keeps measured-width behavior by default', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#suffix').locator('xpath=..');
  const input = page.locator('#suffix');
  await expect(host).not.toHaveAttribute('data-stable-input', '');
  await input.fill('');
  await expect.poll(async () => (await input.boundingBox())?.width).toBeLessThanOrEqual(2);
  await input.fill('a-much-longer-value-that-expands-the-input-before-its-suffix');
  await expect.poll(async () => (await input.boundingBox())?.width).toBeGreaterThan(2);
});

test('default eligibility follows changing affixes', async ({ page }) => {
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

test('grow-input opts out even when stable-input is present', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#plain-user').locator('xpath=..');
  await expect(host).toHaveAttribute('data-stable-input', '');
  await host.evaluate((element) => { element.setAttribute('stable-input', ''); element.setAttribute('grow-input', ''); });
  await expect(host).not.toHaveAttribute('data-stable-input', '');
  await host.evaluate((element) => element.removeAttribute('grow-input'));
  await expect(host).toHaveAttribute('data-stable-input', '');
});

test('grow-input retains measured sizing on an otherwise eligible input', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#plain-user').locator('xpath=..');
  const input = page.locator('#plain-user');
  await input.fill('');
  await host.evaluate((element) => element.setAttribute('grow-input', ''));
  await expect(host).not.toHaveAttribute('data-stable-input', '');
  await expect.poll(async () => (await input.boundingBox())?.width).toBeLessThanOrEqual(2);
  await input.fill('a-username-long-enough-to-expand-the-measured-input-box');
  await expect.poll(async () => (await input.boundingBox())?.width).toBeGreaterThan(2);
});

test('default sizing leaves room for a closed-shadow overlay and receives clicks', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#plain-user').locator('xpath=..');
  const input = page.locator('#plain-user');
  await input.fill('');
  const before = await input.boundingBox();
  await host.evaluate((element) => {
    const input = element.querySelector('input')!;
    const hostRect = element.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    customElements.define('test-autofill-icon', class extends HTMLElement {
      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'closed' });
        const button = document.createElement('button');
        button.style.cssText = 'all:initial;box-sizing:border-box;position:absolute;left:var(--button-left);top:var(--button-top);width:24px;height:24px;background:red;';
        button.addEventListener('click', () => this.setAttribute('data-clicked', 'yes'));
        shadow.append(button);
      }
    });
    const icon = document.createElement('test-autofill-icon');
    icon.style.cssText = `width:0;height:0;--button-left:${inputRect.right - hostRect.left - 24}px;--button-top:${inputRect.top - hostRect.top}px;`;
    element.append(icon);
  });
  await expect(host).toHaveAttribute('data-stable-input', '');
  const icon = host.locator('test-autofill-icon');
  await expect(icon).toHaveAttribute('data-sabi-stable-overlay', '');
  expect(await icon.evaluate((element) => getComputedStyle(element).marginInlineStart)).toBe('0px');
  expect(await icon.evaluate((element) => getComputedStyle(element).position)).toBe('static');
  expect(await icon.evaluate((element) => getComputedStyle(element).flex)).toBe('0 0 auto');
  await input.fill('a-username-long-enough-to-overflow-the-fixed-width-input-box');
  const after = await input.boundingBox();
  expect(after?.x).toBeCloseTo(before!.x, 1);
  expect(after?.width).toBeCloseTo(before!.width, 1);
  await page.mouse.click(after!.x + after!.width - 12, after!.y + 12);
  await expect(icon).toHaveAttribute('data-clicked', 'yes');
});

test('a custom suffix with an inline footprint stays on measured sizing', async ({ page }) => {
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#plain-user').locator('xpath=..');
  await host.evaluate((element) => {
    const suffix = document.createElement('test-visible-suffix');
    suffix.textContent = 'account';
    element.append(suffix);
  });
  await expect(host).not.toHaveAttribute('data-stable-input', '');
  await expect(host.locator('test-visible-suffix')).not.toHaveAttribute('data-sabi-stable-overlay', '');
});
