import { expect, test, type Page } from '@playwright/test';

type Snapshot = { caretX: number; clientWidth: number; scrollLeft: number; fadeLeft: boolean; fadeRight: boolean; leftProgress: number; rightProgress: number; hiddenLeft: number; hiddenRight: number; caret: number | null; caretHidden: boolean };

// Caret geometry measured independently of the element, at the end of each
// rendering step (ResizeObserver runs after rAF and layout, right before paint).
// Single-direction text: the width of the text before the caret, from the side the
// text starts on. Mixed-direction text (`data-probe="range"` on the field's box): the
// browser's own layout of a copy of the text, read per character. This mirrors the
// element's own rule, so the screenshot tests (drawnCaretX) back it up.
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
    const offset = (input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd) ?? 0;
    // Where directions meet, an offset has two places on screen; the caret is drawn
    // beside the character running in the field's direction (checked against
    // screenshots of a coloured caret in Chromium and WebKit, single and word steps).
    if (useRange && input.value) {
      span.textContent = input.value;
      const box = span.getBoundingClientRect();
      const fromLeft = (x: number) => (rtl ? input.clientWidth - (box.right - x) : x - box.left);
      const range = document.createRange();
      const rect = (from: number, to: number) => {
        if (from < 0 || to > input.value.length) return null;
        range.setStart(span.firstChild!, from);
        range.setEnd(span.firstChild!, to);
        return range.getBoundingClientRect();
      };
      const touch = (a: DOMRect | null, b: DOMRect | null) =>
        !a || !b ? null : Math.abs(a.right - b.left) < 2 ? a.right : Math.abs(a.left - b.right) < 2 ? a.left : null;
      const before = rect(offset - 1, offset);
      const after = rect(offset, offset + 1);
      const together = touch(before, after);
      if (together !== null) return fromLeft(together);
      // Previous character on its right, or next on its left: that character runs right-to-left.
      const beforeRtl = before && (touch(before, rect(offset - 2, offset - 1)) ?? (rtl ? before.right : before.left)) === before.right;
      const afterRtl = after && (touch(after, rect(offset + 1, offset + 2)) ?? (rtl ? after.left : after.right)) === after.left;
      const drawn = before && beforeRtl === rtl ? (beforeRtl ? before.left : before.right)
        : after && afterRtl === rtl ? (afterRtl ? after.right : after.left)
        : before ? (beforeRtl ? before.left : before.right) : (afterRtl ? after!.right : after!.left);
      return fromLeft(drawn);
    }
    span.textContent = input.value.slice(0, offset) || '​';
    const width = offset ? span.getBoundingClientRect().width : 0;
    const x = rtl ? input.clientWidth - width : width;
    return x;
  };
  const snapshot = (host: HTMLElement) => {
    const input = host.querySelector('input')!;
    const rtl = getComputedStyle(host).direction === 'rtl';
    const max = host.scrollWidth - host.clientWidth;
    const scrollX = rtl ? host.scrollLeft + max : host.scrollLeft;
    const inputX = input.getBoundingClientRect().left - host.getBoundingClientRect().left - host.clientLeft;
    const caret = caretInInput(input, Boolean(host.closest('[data-probe="range"]')));
    return {
      caretX: inputX + caret,
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
// Cmd+arrow jumps visually, so in right-to-left text the start is Cmd+→.
const RTL_LINE_START = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'Home';
const RTL_LINE_END = process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'End';

// Where the browser actually draws the caret: its first column in a screenshot, with the
// caret painted red, or null if it isn't clearly drawn (missing, or faded out). Checks
// the caret against what's on screen rather than against a model of it. Headless
// Firefox doesn't paint the caret into screenshots.
const drawnCaretX = async (page: Page, id: string) => {
  // Not where Sabi hides the caret, so a hidden caret still reads as hidden.
  await page.addStyleTag({ content: `#${id}:not([data-caret-hidden]) input { caret-color: rgb(255 0 0) }` });
  // The caret blinks; keep looking for a second.
  for (let tries = 0; tries < 12; tries++) {
    const png = (await page.locator(`#${id}`).screenshot({ caret: 'initial', scale: 'css' })).toString('base64');
    const x = await page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      for (let x = 0; x < image.width; x++) {
        for (let y = 0; y < image.height; y++) {
          const i = (y * image.width + x) * 4;
          if (data[i]! > 200 && data[i + 1]! < 90 && data[i + 2]! < 90) return x;
        }
      }
      return null;
    }, png);
    if (x !== null) return x;
    await page.waitForTimeout(100);
  }
  return null;
};

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

test('a short prefix keeps the stable mask aligned to the native field', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'headless Firefox paints no caret into screenshots');
  await page.goto('/fixtures/autofill.html');
  const host = page.locator('#prefix-user').locator('xpath=..');
  const input = page.locator('#prefix-user');
  await host.evaluate((element) => { element.id = 'stable-prefix'; });
  await expect(host).toHaveAttribute('data-stable-input', '');
  await expect.poll(() => host.evaluate((element) => getComputedStyle(element).maskImage)).toBe('none');
  await expect.poll(() => input.evaluate((element) => getComputedStyle(element).maskImage)).not.toBe('none');
  await input.fill('');
  await input.focus();
  await input.pressSequentially('prefix-value-long-enough-to-overflow-the-native-field');
  const { left, inputRight } = await host.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    inputRight: element.querySelector('input')!.getBoundingClientRect().right,
  }));
  const x = await drawnCaretX(page, 'stable-prefix');
  expect(x).not.toBeNull();
  expect(x!).toBeGreaterThanOrEqual(inputRight - left - 5);
  expect(x!).toBeLessThanOrEqual(inputRight - left);
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

for (const id of ['plain', 'rtl']) {
  test(`clicking the start gutter focuses the input at the start (${id})`, async ({ page }) => {
    const field = page.locator(`#${id}`);
    const box = (await field.boundingBox())!;
    await page.mouse.click(id === 'rtl' ? box.x + box.width - 3 : box.x + 3, box.y + box.height / 2);
    const state = await field.locator('input').evaluate((input: HTMLInputElement) => ({
      focused: document.activeElement === input,
      caret: input.selectionStart,
    }));
    expect(state).toEqual({ focused: true, caret: 0 });
  });
}

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
  // A page of the same origin without the fixture's script.
  await page.goto('/CONTRIBUTING.md');
  const state = await page.evaluate(async () => {
    const { define } = await import('/packages/sabi-input/dist/core.js');
    const before = Boolean(customElements.get('sabi-input'));
    define();
    return { before, after: Boolean(customElements.get('sabi-input')) };
  });
  expect(state).toEqual({ before: false, after: true });
});

test.describe('robustness', () => {
  const addField = (page: Page, html: string) => page.evaluate((html) => {
    const box = document.createElement('div');
    box.className = 'box';
    box.innerHTML = html;
    document.body.prepend(box);
  }, html);

  test('a password, or a field masked with -webkit-text-security, never reaches the page', async ({ page }) => {
    await page.evaluate(() => {
      // Every write to the mirror, even one emptied before the next frame.
      const writes: string[] = [];
      (window as any).__writes = writes;
      const own = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
      Object.defineProperty(Node.prototype, 'textContent', {
        ...own,
        set(value: string) {
          if (this instanceof HTMLSpanElement && this.getAttribute('aria-hidden') === 'true') writes.push(value);
          own.set!.call(this, value);
        },
      });
    });
    await addField(page, '<sabi-input grow-input id="password"><input type="password" placeholder="Password"></sabi-input>');
    await addField(page, '<sabi-input grow-input id="masked"><input style="-webkit-text-security: disc"></sabi-input>');
    for (const id of ['password', 'masked']) {
      await page.locator(`#${id} input`).evaluate((input: HTMLInputElement) => {
        input.value = 'hunter2-😀-👨‍👩‍👧-'.repeat(4);
        input.focus();
      });
      await expect(page.locator(`#${id}`)).toHaveAttribute('data-fade-left', '');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(50);
    }
    const writes = await page.evaluate(() => (window as any).__writes as string[]);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.some((text) => text.includes('hunter2'))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.outerHTML.includes('hunter2'))).toBe(false);
    // A show-password toggle shows the text, and hiding it again goes back to dots.
    const width = () => page.locator('#password input').evaluate((input) => input.style.width);
    const hidden = await width();
    await page.locator('#password input').evaluate((input: HTMLInputElement) => { input.type = 'text'; });
    await expect.poll(width).not.toBe(hidden);
    await page.locator('#password input').evaluate((input: HTMLInputElement) => { input.type = 'password'; });
    await expect.poll(width).toBe(hidden);
  });

  test('a password field keeps the drawn caret clear of the fades', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'headless Firefox paints no caret into screenshots');
    // Chromium draws a dot per grapheme and the others one per UTF-16 unit; WebKit's
    // system-ui dots are wider than U+2022 and run left-to-right in a right-to-left field.
    for (const [font, dir, value] of [
      ['Arial', 'ltr', 'long-secret-'.repeat(6)],
      ['Arial', 'ltr', 'ab😀e\u0301👨‍👩‍👧'.repeat(7)],
      ['system-ui', 'ltr', 'long-secret-'.repeat(6)],
      ['Arial', 'rtl', 'אב😀abc'.repeat(10)],
      ['system-ui', 'rtl', 'אב😀abc'.repeat(10)],
    ] as const) {
      await page.evaluate(([font, dir, value]) => {
        document.getElementById('pw')?.parentElement!.remove();
        const box = document.createElement('div');
        box.className = 'box';
        box.innerHTML = `<sabi-input grow-input id="pw" style="font-family: ${font}"><input type="password" dir="${dir}" aria-label="Password"></sabi-input>`;
        document.body.prepend(box);
        box.querySelector('input')!.value = value;
      }, [font, dir, value] as const);
      await focusAt(page, 'pw', 'end');
      const [start, end, back, forward] = dir === 'rtl'
        ? [RTL_LINE_START, RTL_LINE_END, 'ArrowRight', 'ArrowLeft']
        : [LINE_START, LINE_END, 'ArrowLeft', 'ArrowRight'];
      for (const key of ['', start, end, ...Array(10).fill(back), 'Z', forward]) {
        if (key) await page.keyboard.press(key);
        const label = `${font} ${dir} after ${key || 'focus'}`;
        const x = await drawnCaretX(page, 'pw');
        const { width, left, right } = await page.locator('#pw').evaluate((host) => ({
          width: host.clientWidth, left: host.hasAttribute('data-fade-left'), right: host.hasAttribute('data-fade-right'),
        }));
        expect(x, label).not.toBeNull();
        expect(x!, label).toBeGreaterThanOrEqual((left ? SAFE_INSET : GUTTER) - 1);
        expect(x!, label).toBeLessThanOrEqual(width - (right ? SAFE_INSET : GUTTER) + 1);
      }
    }
  });

  test('an email field stays plain and a click on its strip focuses it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await addField(page, '<sabi-input id="email" style="padding-block: 8px"><input type="email" value="someone@example.com"></sabi-input>');
    await page.locator('#email').click({ position: { x: 236, y: 4 } });
    await expect(page.locator('#email input')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('a long value doesn\'t widen the page, and leaves nothing behind', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 600 });
    await page.locator('#plain input').evaluate((input: HTMLInputElement) => {
      input.value = 'x'.repeat(3000);
      input.focus();
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(400);
    expect(await page.evaluate(() => document.querySelector('body > span[aria-hidden]')!.textContent)).toBe('');
  });

  test('a very long value doesn\'t throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.locator('#plain input').evaluate((input: HTMLInputElement) => {
      input.value = 'a'.repeat(200_000);
      input.focus();
      input.setSelectionRange(200_000, 200_000);
    });
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('follows an input that replaces the first one', async ({ page }) => {
    await page.locator('#plain').evaluate((host) => {
      const input = document.createElement('input');
      input.value = 'A replacement input, long enough to overflow the edge of the field';
      host.querySelector('input')!.replaceWith(input);
    });
    await page.locator('#plain input').evaluate((input: HTMLInputElement) => { input.value = 'short'; });
    await expect(page.locator('#plain')).not.toHaveAttribute('data-fade-right');
  });

  test('custom properties can be zero and can be set on an ancestor', async ({ page }) => {
    // No caret penetration: the caret stops a whole fade width (22px) from the edge, not 18px.
    await page.locator('#plain').evaluate((host) => host.parentElement!.style.setProperty('--sabi-caret-penetration', '0px'));
    await focusAt(page, 'plain', 'end');
    let last: Snapshot | null = null;
    for (let presses = 0; presses < 60; presses++) last = (await pressAndProbe(page, 'plain', 'ArrowLeft')).at(-1)!;
    expect(last!.fadeLeft).toBe(true);
    expect(last!.caretX).toBeGreaterThanOrEqual(21);
  });

  test('a page\'s unlayered reset and input styles leave its geometry alone', async ({ page }) => {
    await page.addStyleTag({ content: '*, *::before, *::after { margin: 0; padding: 0 } input { margin: 4px; padding: 6px 10px; border: 2px solid }' });
    const geometry = await page.locator('#plain').evaluate((host) => {
      const input = getComputedStyle(host.querySelector('input')!);
      return [getComputedStyle(host).paddingLeft, getComputedStyle(host).paddingRight, input.marginLeft, input.paddingLeft, input.borderLeftWidth];
    });
    expect(geometry).toEqual(['8px', '8px', '0px', '0px', '0px']);
    await focusAt(page, 'plain', 'end');
    for (const s of await pressAndProbe(page, 'plain', LINE_START)) expectCaretClear(s);
  });

  test('without cascade layers it leaves a plain input', async ({ page }) => {
    await page.addInitScript(() => delete (globalThis as { CSSLayerBlockRule?: unknown }).CSSLayerBlockRule);
    await page.reload();
    await page.waitForLoadState('load');
    expect(await page.evaluate(() => Boolean(customElements.get('sabi-input')))).toBe(false);
    await page.locator('#plain input').fill('still an ordinary input');
    await expect(page.locator('#plain input')).toHaveValue('still an ordinary input');
  });
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
  for (const [key, from] of [['ArrowLeft', 'start'], ['ArrowRight', 'end'], ['Alt+ArrowLeft', 'start'], ['Alt+ArrowRight', 'end']] as const) {
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
      expect(presses).toBeGreaterThan(key.startsWith('Alt') ? 8 : 60);
    });
  }

  // As in left-to-right text, the text scrolls only as far as the caret moves, so a
  // caret stepping into a word doesn't pull the whole word into view.
  for (const key of ['ArrowLeft', 'ArrowRight'] as const) {
    test(`${key} across mixed-direction text scrolls no further than the caret moves`, async ({ page }) => {
      await focusAt(page, 'mixed', key === 'ArrowLeft' ? 'start' : 'end');
      let previous: Snapshot | null = null;
      for (let presses = 0; presses < 80; presses++) {
        const s = (await pressAndProbe(page, 'mixed', key)).at(-1)!;
        if (previous) {
          const moved = Math.abs(s.caretX + s.hiddenLeft - (previous.caretX + previous.hiddenLeft));
          expect(Math.abs(s.hiddenLeft - previous.hiddenLeft)).toBeLessThanOrEqual(moved + 1);
        }
        previous = s;
      }
    });
  }

  test('word jumps across mixed-direction text keep the drawn caret in view', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'headless Firefox paints no caret into screenshots');
    for (const [key, from] of [['Alt+ArrowLeft', 'start'], ['Alt+ArrowRight', 'end']] as const) {
      await focusAt(page, 'mixed', from);
      let previous = -1;
      for (let presses = 0; presses < 30; presses++) {
        await page.keyboard.press(key);
        const caret = await page.locator('#mixed input').evaluate((input: HTMLInputElement) => input.selectionStart);
        const x = await drawnCaretX(page, 'mixed');
        expect(x, `${key} at offset ${caret}`).not.toBeNull();
        expect(x!).toBeGreaterThanOrEqual(GUTTER);
        expect(x!).toBeLessThanOrEqual(240 - GUTTER);
        if (caret === previous) break;
        previous = caret!;
      }
    }
  });

  test('a letter with an accent counts as one character where directions meet', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'headless Firefox paints no caret into screenshots');
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'box';
      box.dir = 'rtl';
      box.style.width = '120px';
      box.innerHTML = '<sabi-input grow-input id="accent"><input aria-label="Accent"></sabi-input>';
      document.body.prepend(box);
      box.querySelector('input')!.value = 'אב abcdefghijklmnopqrstuvwxyz\u0301 גד';
    });
    await page.locator('#accent input').evaluate((input: HTMLInputElement) => {
      input.focus();
      input.setSelectionRange(30, 30);
    });
    const x = await drawnCaretX(page, 'accent');
    expect(x).not.toBeNull();
    expect(x!).toBeGreaterThanOrEqual(GUTTER);
  });

  test('typing mid-field keeps the text where it was', async ({ page }) => {
    await page.locator('#rtl input').evaluate((input: HTMLInputElement) => {
      input.focus();
      input.setSelectionRange(3, 3);
    });
    await expect.poll(() => page.locator('#rtl').evaluate((host) => host.scrollLeft)).toBe(0);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    expect(await page.locator('#rtl').evaluate((host) => host.scrollLeft)).toBe(0);
  });

  test('without Intl.Segmenter (Firefox before 125), mixed text still keeps the caret clear', async ({ page }) => {
    await page.addInitScript(() => delete (Intl as { Segmenter?: unknown }).Segmenter);
    await page.reload();
    await page.waitForFunction(() => customElements.get('sabi-input') && !('Segmenter' in Intl));
    await focusAt(page, 'mixed', 'start');
    for (let presses = 0; presses < 80; presses++) {
      for (const s of await pressAndProbe(page, 'mixed', 'ArrowLeft')) expectCaretClear(s);
    }
  });

  test('a lone surrogate half doesn\'t throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.locator('#rtl input').evaluate((input: HTMLInputElement) => {
      input.value = '\uD800';
      input.focus();
      input.setSelectionRange(0, 0);
    });
    await page.waitForTimeout(100);
    expect(errors).toEqual([]);
  });

  test('a direction set on the element itself is left alone', async ({ page }) => {
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'box';
      box.innerHTML = '<sabi-input id="styled" style="direction: rtl"><input aria-label="Styled" value="שלום"></sabi-input>';
      document.body.prepend(box);
    });
    await page.waitForTimeout(100);
    expect(await page.locator('#styled').evaluate((host) => host.style.direction)).toBe('rtl');
  });

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
