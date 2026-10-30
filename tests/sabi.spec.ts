import { expect, test, type Page } from '@playwright/test';

type Snapshot = { caretX: number; clientWidth: number; scrollLeft: number; fadeLeft: boolean; fadeRight: boolean; leftProgress: number; rightProgress: number; hiddenRight: number; caret: number | null };

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
      hiddenRight: host.scrollWidth - host.clientWidth - host.scrollLeft,
      caret: input.selectionStart,
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
    const snapshots = await pressAndProbe(page, 'prefixed', key, 5);
    for (const s of snapshots) {
      expectCaretClear(s);
      // In every painted frame the fades match the scroll position: no frame where they lag behind it.
      expect(s.leftProgress).toBeCloseTo(Math.min(1, s.scrollLeft / 22), 2);
      expect(s.rightProgress).toBeCloseTo(Math.min(1, Math.max(0, s.hiddenRight) / 22), 2);
    }
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

test('a prefix wider than the field stops the caret a third of the way across', async ({ page }) => {
  await focusAt(page, 'long-prefix', 'end');
  await page.keyboard.press(LINE_START);
  const distanceFromThird = () => page.evaluate(() => {
    const host = document.getElementById('long-prefix')!;
    const input = host.querySelector('input')!;
    return Math.abs(input.getBoundingClientRect().left - host.getBoundingClientRect().left - host.clientWidth / 3);
  });
  await expect.poll(distanceFromThird).toBeLessThanOrEqual(2); // WebKit snaps scrollLeft to whole pixels
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
  // Measured from where the text ends, not from the input's box (which has caret room).
  const gap = () => page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#trailed input')!;
    const span = document.createElement('span');
    span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(input).font}`;
    span.textContent = input.value;
    document.body.append(span);
    const textEnd = input.getBoundingClientRect().left + span.getBoundingClientRect().width;
    span.remove();
    return document.getElementById('trail')!.getBoundingClientRect().left - textEnd;
  });
  await expect.poll(async () => Math.abs(await gap())).toBeLessThanOrEqual(0.5);
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

test('clicking the prefix focuses the input', async ({ page }) => {
  // A real mouse click at the prefix: Playwright's locator.click() refuses pointer-events: none.
  const box = (await page.locator('#prefixed > span').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#prefixed input')).toBeFocused();
});

test('the input submits with its form', async ({ page }) => {
  const value = await page.locator('#form').evaluate((form: HTMLFormElement) => {
    form.querySelector('input')!.name = 'title';
    return new FormData(form).get('title');
  });
  expect(value).toBe('short');
});

test('core registers nothing until define() is called', async ({ page }) => {
  const state = await page.evaluate(async () => {
    const { define } = await import('/packages/sabi-input/dist/core.js');
    const before = Boolean(customElements.get('sabi-core-check'));
    define('sabi-core-check');
    return { before, after: Boolean(customElements.get('sabi-core-check')) };
  });
  expect(state).toEqual({ before: false, after: true });
});
