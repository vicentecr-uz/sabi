import { expect, test, type Page } from '@playwright/test';

type Snapshot = { caretX: number; caretXMax: number; clientWidth: number; scrollLeft: number; fadeLeft: boolean; fadeRight: boolean; leftProgress: number; rightProgress: number; hiddenLeft: number; hiddenRight: number; caret: number | null; caretHidden: boolean };

// Caret geometry measured independently of the element, at the end of each
// rendering step (ResizeObserver runs after rAF and layout, right before paint).
// Single-direction text: the width of the text before the caret, from the side the
// text starts on. Mixed-direction text (`data-probe="range"` on the field's box):
// the browser's own layout of a copy of the text, via a collapsed Range. Where runs
// meet, that has two places, and a caret is clear only if both are (caretX..caretXMax).
const installProbe = (page: Page) => page.addInitScript(() => {
  const span = document.createElement('span');
  span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;top:0;left:0;';
  const caretInInput = (input: HTMLInputElement, useRange: boolean) => {
    const style = getComputedStyle(input);
    if (!span.isConnected) document.body.append(span);
    span.style.font = style.font;
    span.style.letterSpacing = style.letterSpacing;
    span.style.direction = style.direction;
    const rtl = style.direction === 'rtl';
    const offset = input.selectionEnd ?? 0;
    if (useRange && input.value) {
      span.textContent = input.value;
      const box = span.getBoundingClientRect();
      const range = document.createRange();
      range.setStart(span.firstChild!, offset);
      range.collapse(true);
      const places = [...range.getClientRects()].map((rect) => (rtl ? input.clientWidth - (box.right - rect.left) : rect.left - box.left));
      return [Math.min(...places), Math.max(...places)];
    }
    span.textContent = input.value.slice(0, offset) || '​';
    const width = offset ? span.getBoundingClientRect().width : 0;
    const x = rtl ? input.clientWidth - width : width;
    return [x, x];
  };
  const snapshot = (host: HTMLElement) => {
    const input = host.querySelector('input')!;
    const rtl = getComputedStyle(host).direction === 'rtl';
    const max = host.scrollWidth - host.clientWidth;
    const scrollX = rtl ? host.scrollLeft + max : host.scrollLeft;
    const inputX = input.getBoundingClientRect().left - host.getBoundingClientRect().left - host.clientLeft;
    const [first, last] = caretInInput(input, Boolean(host.closest('[data-probe="range"]')));
    return {
      caretX: inputX + first,
      caretXMax: inputX + last,
      clientWidth: host.clientWidth,
      scrollLeft: host.scrollLeft,
      fadeLeft: host.hasAttribute('data-fade-left'),
      fadeRight: host.hasAttribute('data-fade-right'),
      leftProgress: Number(getComputedStyle(host).getPropertyValue('--sabi-fade-left-progress')),
      rightProgress: Number(getComputedStyle(host).getPropertyValue('--sabi-fade-right-progress')),
      hiddenLeft: scrollX,
      hiddenRight: max - scrollX,
      caret: input.selectionStart,
      caretHidden: host.hasAttribute('data-caret-hidden'),
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
  expect(s.caretHidden).toBe(false);
  expect(s.caretX).toBeGreaterThanOrEqual((s.fadeLeft ? SAFE_INSET : GUTTER) - 1);
  expect(s.caretXMax).toBeLessThanOrEqual(s.clientWidth - (s.fadeRight ? SAFE_INSET : GUTTER) + 1);
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
// Cmd+arrow jumps visually, so in right-to-left text the start is Cmd+→.
const RTL_LINE_START = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'Home';
const RTL_LINE_END = process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'End';

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

test('takes the field box\'s corners, so its clip matches the box', async ({ page }) => {
  const radii = await page.locator('#plain').evaluate((host) => [getComputedStyle(host).borderTopLeftRadius, getComputedStyle(host.parentElement!).borderTopLeftRadius]);
  expect(radii[0]).toBe(radii[1]);
  expect(radii[0]).toBe('8px');
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

test('a caret scrolled into a fade stays drawn until the fully faded edge', async ({ page }) => {
  const host = page.locator('#plain');
  await focusAt(page, 'plain', 'start');
  // x: px from the left edge, or from the right edge when negative. The fully faded edge is 8px.
  for (const [caret, x, hidden] of [[20, 12, false], [20, 4, true], [60, -12, false], [60, -4, true]] as const) {
    await host.locator('input').evaluate((input: HTMLInputElement, caret) => input.setSelectionRange(caret, caret), caret);
    // Let the selection correction land first, so it doesn't undo the scroll below.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const scrolled = await host.evaluate((host, [caret, x]) => {
      const input = host.querySelector('input')!;
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(input).font}`;
      span.textContent = input.value.slice(0, caret);
      document.body.append(span);
      const target = input.offsetLeft + span.getBoundingClientRect().width - (x < 0 ? host.clientWidth + x : x);
      span.remove();
      host.scrollLeft = target;
      return target;
    }, [caret, x] as const);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Nothing scrolled it back: the caret is still where this case put it.
    expect(Math.abs(await host.evaluate((host) => host.scrollLeft) - scrolled)).toBeLessThan(1);
    expect(await host.evaluate((host) => host.hasAttribute('data-caret-hidden'))).toBe(hidden);
  }
});

// WebKit centres a caret it scrolls into view; every other jump should stop at the edge.
for (const [key, from, edge] of [['Alt+ArrowRight', 'start', 'right'], ['Alt+ArrowLeft', 'end', 'left']] as const) {
  test(`${key} scrolls only as far as the caret needs`, async ({ page }) => {
    await focusAt(page, 'plain', from);
    let previous = await page.locator('#plain').evaluate((host) => host.scrollLeft);
    let scrolls = 0;
    for (let presses = 0; presses < 20; presses++) {
      const snapshots = await pressAndProbe(page, 'plain', key);
      snapshots.forEach(expectCaretClear);
      const s = snapshots.at(-1)!;
      const atLimit = s.hiddenLeft < 0.5 || s.hiddenRight < 0.5;
      if (Math.abs(s.scrollLeft - previous) > 0.5 && !atLimit) {
        scrolls++;
        expect(Math.abs(s.caretX - (edge === 'right' ? s.clientWidth - SAFE_INSET : SAFE_INSET))).toBeLessThanOrEqual(1.5);
      }
      previous = s.scrollLeft;
    }
    expect(scrolls).toBeGreaterThan(2);
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
      expect(s.leftProgress).toBeCloseTo(Math.min(1, s.hiddenLeft / 22), 2);
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

test.describe('right-to-left', () => {
  test('fades the edges that have hidden text, named by side and by reading direction', async ({ page }) => {
    const rtl = page.locator('#rtl');
    // The text starts on the right, so what's hidden is past the left edge, at its end.
    await expect(rtl).toHaveAttribute('data-fade-left', '');
    await expect(rtl).toHaveAttribute('data-fade-end', '');
    await expect(rtl).not.toHaveAttribute('data-fade-right');
    await expect(rtl).not.toHaveAttribute('data-fade-start');
    await expect(page.locator('#rtl-trailed')).not.toHaveAttribute('data-fade-left');
    // Left-to-right fields name the same side the other way round.
    await expect(page.locator('#plain')).toHaveAttribute('data-fade-end', '');
    await expect(page.locator('#plain')).not.toHaveAttribute('data-fade-start');
  });

  test('typing at the end keeps the caret clear of the fade', async ({ page }) => {
    await focusAt(page, 'rtl', 'end');
    // A space, not a Hebrew letter: Playwright presses only keys on a US layout.
    const snapshots = await pressAndProbe(page, 'rtl', 'Space');
    for (const s of snapshots) {
      expect(s.fadeRight).toBe(true);
      expect(s.fadeLeft).toBe(false);
      expectCaretClear(s);
    }
  });

  test('ArrowRight back to the start never paints the caret under a fade', async ({ page }) => {
    await focusAt(page, 'rtl', 'end');
    let presses = 0;
    while (await page.locator('#rtl input').evaluate((input: HTMLInputElement) => input.selectionStart) !== 0) {
      expect(++presses).toBeLessThan(120);
      for (const s of await pressAndProbe(page, 'rtl', 'ArrowRight')) expectCaretClear(s);
    }
    expect(presses).toBeGreaterThan(50);
  });

  for (const [name, key, from, expected] of [
    ['line start', RTL_LINE_START, 'end', 'start'],
    ['line end', RTL_LINE_END, 'start', 'end'],
  ] as const) {
    test(`jumping to the ${name} keeps the caret clear of the fade`, async ({ page }) => {
      await focusAt(page, 'rtl-prefixed', from);
      const snapshots = await pressAndProbe(page, 'rtl-prefixed', key, 5);
      for (const s of snapshots) {
        expectCaretClear(s);
        expect(s.leftProgress).toBeCloseTo(Math.min(1, s.hiddenLeft / 22), 2);
        expect(s.rightProgress).toBeCloseTo(Math.min(1, Math.max(0, s.hiddenRight) / 22), 2);
      }
      const state = await page.locator('#rtl-prefixed input').evaluate((input: HTMLInputElement) => ({ caret: input.selectionStart, length: input.value.length }));
      expect(state.caret).toBe(expected === 'start' ? 0 : state.length);
      await expect(page.locator('#rtl-prefixed')).toHaveAttribute(expected === 'start' ? 'data-fade-left' : 'data-fade-right', '');
    });
  }

  test('jumping to the start reveals the prefix on the right', async ({ page }) => {
    await focusAt(page, 'rtl-prefixed', 'end');
    await page.keyboard.press(RTL_LINE_START);
    // Right-to-left scrolling starts at 0, at the right end, and goes negative.
    await expect.poll(() => page.locator('#rtl-prefixed').evaluate((host) => host.scrollLeft)).toBe(0);
  });

  test('a prefix wider than the field stops the caret a third of the way across from the right', async ({ page }) => {
    await focusAt(page, 'rtl-long-prefix', 'end');
    await page.keyboard.press(RTL_LINE_START);
    const distanceFromThird = () => page.evaluate(() => {
      const host = document.getElementById('rtl-long-prefix')!;
      const input = host.querySelector('input')!;
      const right = host.getBoundingClientRect().left + host.clientLeft + host.clientWidth;
      return Math.abs(right - input.getBoundingClientRect().right - host.clientWidth / 3);
    });
    await expect.poll(distanceFromThird).toBeLessThanOrEqual(2);
    expect(await page.locator('#rtl-long-prefix').evaluate((host) => host.scrollLeft)).toBeLessThan(0);
  });

  test('fade strength follows how much text is hidden', async ({ page }) => {
    // WebKit lays out the overflow a moment after load; until then there's nothing to scroll.
    await expect(page.locator('#rtl')).toHaveAttribute('data-fade-left', '');
    const progress = await page.locator('#rtl').evaluate(async (host) => {
      host.scrollLeft = -11;
      await new Promise((resolve) => host.addEventListener('scroll', resolve, { once: true }));
      return Number(getComputedStyle(host).getPropertyValue('--sabi-fade-right-progress'));
    });
    expect(progress).toBeCloseTo(0.5, 1);
  });

  test('the trail follows the end of the text, on its left', async ({ page }) => {
    await page.locator('#rtl-trailed input').fill('קצת יותר ארוך');
    const gap = () => page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#rtl-trailed input')!;
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(input).font}`;
      span.textContent = input.value;
      document.body.append(span);
      const textEnd = input.getBoundingClientRect().right - span.getBoundingClientRect().width;
      span.remove();
      return textEnd - document.getElementById('rtl-trail')!.getBoundingClientRect().right;
    });
    await expect.poll(async () => Math.abs(await gap())).toBeLessThanOrEqual(0.5);
  });

  // Where runs of each direction meet, the caret's place on screen stops following its
  // place in the text; measuring the text before it would put the caret somewhere else.
  for (const [key, from] of [['ArrowLeft', 'start'], ['ArrowRight', 'end']] as const) {
    test(`${key} across mixed-direction text never paints the caret under a fade`, async ({ page }) => {
      await focusAt(page, 'mixed', from);
      const caret = () => page.locator('#mixed input').evaluate((input: HTMLInputElement) => input.selectionStart);
      let previous = await caret();
      let unchanged = 0;
      let presses = 0;
      while (unchanged < 2) {
        expect(++presses).toBeLessThan(200);
        for (const s of await pressAndProbe(page, 'mixed', key)) expectCaretClear(s);
        const now = await caret();
        unchanged = now === previous ? unchanged + 1 : 0;
        previous = now;
      }
      expect(presses).toBeGreaterThan(60);
    });
  }

  test('dir="auto" on the input sets the field\'s direction from what\'s typed', async ({ page }) => {
    const auto = page.locator('#auto');
    await expect.poll(() => auto.evaluate((host) => getComputedStyle(host).direction)).toBe('rtl');
    await expect(auto).toHaveAttribute('data-fade-left', '');
    await auto.locator('input').evaluate((input: HTMLInputElement) => {
      input.value = 'Plain English text, long enough to overflow the edge of the field';
    });
    await expect.poll(() => auto.evaluate((host) => getComputedStyle(host).direction)).toBe('ltr');
    await expect(auto).toHaveAttribute('data-fade-right', '');
    await expect(auto).not.toHaveAttribute('data-fade-left');
  });
});
