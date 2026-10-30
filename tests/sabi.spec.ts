import { expect, test, type Page } from '@playwright/test';

type Snapshot = { caretX: number; clientWidth: number; scrollLeft: number; fadeLeft: boolean; fadeRight: boolean; leftProgress: number; rightProgress: number };

// Caret geometry measured independently of the element, at the end of each
// rendering step (ResizeObserver runs after rAF and layout, right before paint).
const installProbe = (page: Page) => page.addInitScript(() => {
  const span = document.createElement('span');
  span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;top:0;left:0;';
  const snapshot = (host: HTMLElement) => {
    const input = host.querySelector('input')!;
    if (!span.isConnected) document.body.append(span);
    span.style.font = getComputedStyle(input).font;
    span.style.letterSpacing = getComputedStyle(input).letterSpacing;
    span.textContent = input.value.slice(0, input.selectionEnd ?? 0) || '​';
    const width = input.selectionEnd ? span.getBoundingClientRect().width : 0;
    return {
      caretX: input.getBoundingClientRect().left - host.getBoundingClientRect().left - host.clientLeft + width,
      clientWidth: host.clientWidth,
      scrollLeft: host.scrollLeft,
      fadeLeft: host.hasAttribute('data-fade-left'),
      fadeRight: host.hasAttribute('data-fade-right'),
      leftProgress: Number(getComputedStyle(host).getPropertyValue('--sabi-fade-left-progress')),
      rightProgress: Number(getComputedStyle(host).getPropertyValue('--sabi-fade-right-progress')),
    };
  };
  (window as any).__probe = (host: HTMLElement, frames: number) => {
    const snapshots: unknown[] = [];
    (window as any).__snapshots = snapshots;
    window.addEventListener('keydown', () => {
      const ticker = document.createElement('div');
      ticker.style.cssText = 'position:fixed;top:0;left:0;height:1px;opacity:0;pointer-events:none;';
      document.body.append(ticker);
      let width = 1;
      const observer = new ResizeObserver(() => {
        snapshots.push(snapshot(host));
        if (snapshots.length >= frames) { observer.disconnect(); ticker.remove(); }
      });
      observer.observe(ticker);
      const bump = () => {
        if (!ticker.isConnected) return;
        ticker.style.width = `${(width = width === 1 ? 2 : 1)}px`;
        requestAnimationFrame(bump);
      };
      requestAnimationFrame(bump);
    }, { once: true });
  };
});

const SAFE_INSET = 18; // fade width 22 − caret penetration 4
const GUTTER = 8;

const expectCaretClear = (s: Snapshot) => {
  expect(s.caretX).toBeGreaterThanOrEqual((s.fadeLeft ? SAFE_INSET : GUTTER) - 1);
  expect(s.caretX).toBeLessThanOrEqual(s.clientWidth - (s.fadeRight ? SAFE_INSET : GUTTER) + 1);
};

const pressAndProbe = async (page: Page, id: string, key: string, frames = 3) => {
  await page.evaluate(([id, frames]) => (window as any).__probe(document.getElementById(id as string), frames), [id, frames] as const);
  await page.keyboard.press(key);
  await page.waitForFunction((frames) => (window as any).__snapshots.length >= frames, frames);
  return page.evaluate(() => (window as any).__snapshots as Snapshot[]);
};

// macOS text fields ignore Home/End outside Chromium; Cmd+arrow is the native line jump there.
const LINE_START = process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home';
const LINE_END = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End';

const focusAt = (page: Page, id: string, at: 'start' | 'end') =>
  page.locator(`#${id} input`).evaluate((input: HTMLInputElement, at) => {
    input.focus();
    const offset = at === 'start' ? 0 : input.value.length;
    input.setSelectionRange(offset, offset);
  }, at);

test.beforeEach(async ({ page }) => {
  await installProbe(page);
  await page.goto('/');
  await page.waitForFunction(() => customElements.get('sabi-input'));
});

test('fades the edges that have hidden text', async ({ page }) => {
  const plain = page.locator('#plain');
  await expect(plain).toHaveAttribute('data-fade-right', '');
  await expect(plain).not.toHaveAttribute('data-fade-left');
  await expect(page.locator('#trailed')).not.toHaveAttribute('data-fade-right');
});

test('typing at the end keeps the caret clear of the fade', async ({ page }) => {
  await focusAt(page, 'plain', 'end');
  const snapshots = await pressAndProbe(page, 'plain', 'x');
  for (const s of snapshots) {
    expect(s.fadeLeft).toBe(true);
    expect(s.fadeRight).toBe(false);
    expectCaretClear(s);
  }
});

for (const key of ['ArrowLeft', 'Alt+ArrowLeft']) {
  test(`${key} never paints the caret under a fade`, async ({ page }) => {
    await focusAt(page, 'plain', 'end');
    let presses = 0;
    while (await page.locator('#plain input').evaluate((input: HTMLInputElement) => input.selectionStart) !== 0) {
      expect(++presses).toBeLessThan(120);
      for (const s of await pressAndProbe(page, 'plain', key)) expectCaretClear(s);
    }
    expect(presses).toBeGreaterThan(key === 'ArrowLeft' ? 60 : 5);
  });
}

for (const [name, key, from, expected] of [
  ['line start', LINE_START, 'end', 'start'],
  ['line end', LINE_END, 'start', 'end'],
] as const) {
  test(`jumping to the ${name} keeps the caret clear of the fade`, async ({ page }) => {
    await focusAt(page, 'prefixed', from);
    const snapshots = await pressAndProbe(page, 'prefixed', key);
    for (const s of snapshots) expectCaretClear(s);
    // The fade on the far side must be at full strength in the first painted frame.
    expect(snapshots[0][expected === 'start' ? 'rightProgress' : 'leftProgress']).toBe(1);
    const state = await page.locator('#prefixed input').evaluate((input: HTMLInputElement) => ({ caret: input.selectionStart, length: input.value.length }));
    expect(state.caret).toBe(expected === 'start' ? 0 : state.length);
    await expect(page.locator('#prefixed')).toHaveAttribute(expected === 'start' ? 'data-fade-right' : 'data-fade-left', '');
  });
}

test('jumping to the start reveals the prefix', async ({ page }) => {
  await focusAt(page, 'prefixed', 'end');
  await page.keyboard.press(LINE_START);
  await expect.poll(() => page.locator('#prefixed').evaluate((host) => host.scrollLeft)).toBe(0);
});

test('a prefix wider than the field stops the caret at the middle', async ({ page }) => {
  await focusAt(page, 'long-prefix', 'end');
  await page.keyboard.press(LINE_START);
  const distanceFromMiddle = () => page.evaluate(() => {
    const host = document.getElementById('long-prefix')!;
    const input = host.querySelector('input')!;
    return Math.abs(input.getBoundingClientRect().left - host.getBoundingClientRect().left - host.clientWidth / 2);
  });
  await expect.poll(distanceFromMiddle).toBeLessThanOrEqual(2); // WebKit snaps scrollLeft to whole pixels
  expect(await page.locator('#long-prefix').evaluate((host) => host.scrollLeft)).toBeGreaterThan(0);
});

test('fade strength follows how much text is hidden', async ({ page }) => {
  const progress = await page.locator('#plain').evaluate(async (host) => {
    host.scrollLeft = 11;
    await new Promise((resolve) => host.addEventListener('scroll', resolve, { once: true }));
    return Number(getComputedStyle(host).getPropertyValue('--sabi-fade-left-progress'));
  });
  expect(progress).toBeCloseTo(0.5, 1);
});

test('programmatic value changes re-measure', async ({ page }) => {
  const trailed = page.locator('#trailed');
  await trailed.locator('input').evaluate((input: HTMLInputElement) => {
    input.value = 'a value long enough to overflow the field and need a fade';
  });
  await expect(trailed).toHaveAttribute('data-fade-right', '');
});

test('the trail follows the end of the text', async ({ page }) => {
  await page.locator('#trailed input').fill('a slightly longer slug');
  const gap = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#trailed input')!;
    const trail = document.getElementById('trail')!;
    return trail.getBoundingClientRect().left - input.getBoundingClientRect().right;
  });
  expect(Math.abs(gap)).toBeLessThanOrEqual(1);
});

test('form reset re-measures', async ({ page }) => {
  const resettable = page.locator('#resettable');
  await resettable.locator('input').fill('a value long enough to overflow the field and need a fade');
  await expect(resettable).toHaveAttribute('data-fade-left', '');
  await page.locator('#form').evaluate((form: HTMLFormElement) => form.reset());
  await expect(resettable).not.toHaveAttribute('data-fade-left');
  await expect(resettable).not.toHaveAttribute('data-fade-right');
});

test('clicking the empty strip focuses the input at the end', async ({ page }) => {
  const trailed = page.locator('#trailed');
  const box = (await trailed.boundingBox())!;
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  const state = await trailed.locator('input').evaluate((input: HTMLInputElement) => ({
    focused: document.activeElement === input,
    caret: input.selectionStart,
    length: input.value.length,
  }));
  expect(state.focused).toBe(true);
  expect(state.caret).toBe(state.length);
});
