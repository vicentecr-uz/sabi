import { expect, test, type Page } from '@playwright/test';

const row = (page: Page, section: string, label: string) => page.locator(`#${section} dd[data-row="${label}"]`);

let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/react');
  await expect(page.locator('#controlled sabi-input')).toBeVisible();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('typing reaches React: one onChange per keystroke', async ({ page }) => {
  await page.locator('#controlled input').pressSequentially('abc');
  await expect(row(page, 'controlled', 'value')).toHaveText('"abc"');
  await expect(row(page, 'controlled', 'onChange')).toHaveText('3');
});

test('setting the value from React state re-measures', async ({ page }) => {
  await page.getByRole('button', { name: 'Fill' }).click();
  await expect(page.locator('#controlled input')).toHaveValue(/long\/path/);
  await expect(row(page, 'controlled', 'fade right')).toHaveText('on');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#controlled input')).toHaveValue('');
  await expect(row(page, 'controlled', 'fade left')).toHaveText('off');
  await expect(row(page, 'controlled', 'fade right')).toHaveText('off');
  await expect(row(page, 'controlled', 'onChange')).toHaveText('0');
});

test('typing past the edge reaches React on every keystroke', async ({ page }) => {
  // Crossing into overflow toggles the fades mid-keystroke, which is when a
  // re-render during the input event would revert an edit.
  const text = 'example.com/a/long/path/that/runs/past/the/edge';
  await page.locator('#controlled input').pressSequentially(text);
  await expect(row(page, 'controlled', 'value')).toHaveText(JSON.stringify(text));
  await expect(row(page, 'controlled', 'onChange')).toHaveText(String(text.length));
});

test('typing still works after React sets the value', async ({ page }) => {
  await page.getByRole('button', { name: 'Fill' }).click();
  await page.locator('#controlled input').focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  // Several edits: a revert race (React re-rendering mid-event) loses some of them, rarely all.
  for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
  await expect(row(page, 'controlled', 'value')).toHaveText('"example.com/a/long/path/that/runs/past/the/edge/of"');
  await expect(row(page, 'controlled', 'onChange')).toHaveText('10');
});

test('unmounting and remounting leaves a working field', async ({ page }) => {
  const toggle = page.locator('#remount button');
  for (let i = 0; i < 3; i++) {
    await toggle.click();
    await expect(page.locator('#remount sabi-input')).toHaveCount(0);
    await toggle.click();
    await expect(row(page, 'remount', 'fade right')).toHaveText('on');
  }
  await expect(row(page, 'remount', 'mounts')).toHaveText('4');
  const input = page.locator('#remount input');
  await input.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await expect(row(page, 'remount', 'fade left')).toHaveText('on');
  await expect(row(page, 'remount', 'fade right')).toHaveText('off');
});

test('a suffix rendered by React follows the text', async ({ page }) => {
  await expect(row(page, 'suffix', 'gap')).toHaveText(/^-?0\.[0-5]px$/);
  await page.locator('#suffix input').pressSequentially('-and-more');
  await page.getByRole('button', { name: 'Swap suffix' }).click();
  await expect(row(page, 'suffix', 'suffix')).toHaveText('.markdown');
  await expect(row(page, 'suffix', 'gap')).toHaveText(/^-?0\.[0-5]px$/);
});
