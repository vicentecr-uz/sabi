const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const TEXT_PROPERTIES = ['font', 'letterSpacing', 'wordSpacing', 'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'textTransform', 'direction', 'unicodeBidi'] as const;

// A hidden copy of the input's text, laid out the way the input lays it out,
// including right-to-left and mixed-direction text (the mirror technique of
// textarea-caret-position, with the caret read from a Range instead of a marker).
let mirror: HTMLSpanElement | null = null;

const layout = (input: HTMLInputElement, text: string) => {
  if (!mirror?.isConnected) {
    mirror = document.createElement('span');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;white-space:pre;pointer-events:none;';
    document.body.append(mirror);
  }
  const style = getComputedStyle(input);
  for (const property of TEXT_PROPERTIES) mirror.style[property] = style[property];
  mirror.textContent = text || '\u200b';
  return mirror;
};

const measure = (input: HTMLInputElement, text: string) => layout(input, text).getBoundingClientRect().width;

// Where the caret at `offset` sits, in px from the left of the input's content box.
// Asking the browser, rather than adding up the width of the text before it, puts
// the caret in the right place when right-to-left and left-to-right runs are mixed.
//
// Where runs of each direction meet, one offset has two places on screen (the end of
// one run and the start of the other), and browsers differ on which they draw. `x` is
// the place next to the character before (the caret after typing or moving forward);
// `min` and `max` span both, so the scroll can keep either one clear of the fades.
const caretOffset = (input: HTMLInputElement, offset: number) => {
  const rtl = getComputedStyle(input).direction === 'rtl';
  const text = input.value;
  const span = layout(input, text);
  const box = span.getBoundingClientRect();
  // Right-to-left text starts at the input's right edge; its caret room is on the left.
  const fromLeft = (x: number) => (rtl ? input.clientWidth - (box.right - x) : x - box.left);
  const at = (x: number) => ({ x: fromLeft(x), min: fromLeft(x), max: fromLeft(x) });
  if (!text) return at(rtl ? box.right : box.left);

  const range = document.createRange();
  range.setStart(span.firstChild!, offset);
  range.collapse(true);
  const places = [...range.getClientRects()].filter((rect) => rect.height).map((rect) => rect.left);
  if (!places.length) {
    // No geometry for a collapsed range: fall back to the width of the text before it.
    const before = measure(input, text.slice(0, offset));
    return at(rtl ? box.right - before : box.left + before);
  }
  if (places.length === 1) return at(places[0]!);

  // The character before (or, at the very start, after), whole surrogate pairs included.
  const step = (i: number) => (/[\uDC00-\uDFFF]/.test(text[i] ?? '') && i > 0 ? i - 1 : i);
  const from = offset > 0 ? step(offset - 1) : offset;
  const to = offset > 0 ? offset : offset + (step(offset + 1) === offset ? 2 : 1);
  range.setStart(span.firstChild!, from);
  range.setEnd(span.firstChild!, Math.min(text.length, to));
  const char = range.getBoundingClientRect();
  const distance = (x: number) => Math.min(Math.abs(x - char.left), Math.abs(x - char.right));
  const x = places.reduce((best, place) => (distance(place) < distance(best) ? place : best));
  return { x: fromLeft(x), min: fromLeft(Math.min(...places)), max: fromLeft(Math.max(...places)) };
};

// The browser rounds the scroll range to whole pixels, and right-to-left it can sit
// a pixel off where the text says it should; anything hidden within that is at the edge.
const EDGE = 1;

const length = (style: CSSStyleDeclaration, name: string, fallback: number) =>
  Number.parseFloat(style.getPropertyValue(name)) || fallback;

// Server renderers import this module where HTMLElement doesn't exist.
const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

export class SabiInput extends Base {
  #input: HTMLInputElement | null = null;
  #controller: AbortController | null = null;
  #frame = 0;
  #reveal = false;
  #anchor: number | null = null;

  connectedCallback() {
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    const input = this.querySelector('input');
    if (input) return this.#attach(input, signal);
    // The element can be defined before its children are parsed.
    const observer = new MutationObserver(() => {
      const found = this.querySelector('input');
      if (!found) return;
      observer.disconnect();
      this.#attach(found, signal);
    });
    observer.observe(this, { childList: true, subtree: true });
    signal.addEventListener('abort', () => observer.disconnect());
  }

  disconnectedCallback() {
    this.#controller?.abort();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#input = null;
  }

  /** Re-measure after changes Sabi can't observe, such as a font swap on the input itself. */
  sync() {
    this.#schedule(document.activeElement === this.#input);
  }

  #attach(input: HTMLInputElement, signal: AbortSignal) {
    this.#input = input;
    this.#watchValue(input, signal);

    // Deferred, not synchronous: writing to the DOM mid-event can trigger observers
    // that re-render a controlled React input and revert the edit before React sees it.
    input.addEventListener('input', () => this.#schedule(true), { signal });
    input.addEventListener('focus', () => this.#schedule(true), { signal });
    input.addEventListener('blur', () => this.#schedule(false), { signal });
    // The browser moves the caret right after keydown; correcting in the next
    // animation frame lands before paint, so the caret never shows under a fade.
    // Safari centres a caret it scrolls into view; remember the settled scroll from
    // before the key so the correction moves only as far as the caret needs, as elsewhere.
    input.addEventListener('keydown', (event) => {
      if (this.#frame) this.#syncNow(false);
      if (this.#anchor === null) {
        const rtl = getComputedStyle(this).direction === 'rtl';
        this.#anchor = this.#scrollX(rtl, Math.max(0, this.scrollWidth - this.clientWidth));
      }
      if (CARET_KEYS.has(event.key)) this.#schedule(true);
    }, { signal });
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === input) this.#schedule(input.selectionStart === input.selectionEnd);
    }, { signal });
    input.form?.addEventListener('reset', () => this.#schedule(false), { signal });

    this.addEventListener('click', (event) => {
      if (event.target !== this || input.disabled) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      this.#syncNow(true);
    }, { signal });
    this.addEventListener('scroll', () => {
      this.#syncFades(length(getComputedStyle(this), '--sabi-fade-width', 22));
      this.#schedule(false);
    }, { passive: true, signal });

    const resizeObserver = new ResizeObserver(() => this.#schedule(document.activeElement === input));
    resizeObserver.observe(this);
    signal.addEventListener('abort', () => resizeObserver.disconnect());
    document.fonts?.addEventListener('loadingdone', () => this.#schedule(false), { signal });

    this.#schedule(false);
  }

  // Assigning `input.value` fires no event, which is how React, Vue and form
  // libraries update it. Wrap the setter on this one input so those updates re-measure.
  #watchValue(input: HTMLInputElement, signal: AbortSignal) {
    const own = Object.getOwnPropertyDescriptor(input, 'value');
    const base = own ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    Object.defineProperty(input, 'value', {
      configurable: true,
      enumerable: base.enumerable,
      get: () => base.get!.call(input),
      set: (value: string) => {
        base.set!.call(input, value);
        this.#schedule(document.activeElement === input);
      },
    });
    signal.addEventListener('abort', () => {
      if (own) Object.defineProperty(input, 'value', own);
      else delete (input as { value?: string }).value;
    });
  }

  #schedule(reveal: boolean) {
    this.#reveal ||= reveal;
    if (!this.#frame) this.#frame = requestAnimationFrame(() => this.#flush());
  }

  #syncNow(reveal: boolean) {
    cancelAnimationFrame(this.#frame);
    this.#reveal ||= reveal;
    this.#flush();
  }

  #flush() {
    this.#frame = 0;
    const reveal = this.#reveal;
    this.#reveal = false;
    const anchor = this.#anchor;
    this.#anchor = null;
    const input = this.#input;
    if (!input) return;

    // An input with its own `dir` (often `dir="auto"`, which follows what's typed)
    // sets the field's direction, so prefix, suffix and scrolling mirror with it.
    const direction = input.hasAttribute('dir') ? getComputedStyle(input).direction : '';
    if (this.style.direction !== direction) this.style.direction = direction;

    const style = getComputedStyle(this);
    const rtl = style.direction === 'rtl';
    const gutter = length(style, '--sabi-edge-gutter', 8);
    const fadeWidth = length(style, '--sabi-fade-width', 22);
    const safeInset = Math.max(gutter, fadeWidth - length(style, '--sabi-caret-penetration', 4));

    // 2px of room for the caret at the end; whatever follows the input overlaps it (styles.css).
    input.style.width = `${measure(input, input.value || input.placeholder) + 2}px`;
    const maxScroll = Math.max(0, this.scrollWidth - this.clientWidth);
    const focused = document.activeElement === input;
    const { selectionStart: start, selectionEnd: end } = input;
    const collapsed = start !== null && start === end;

    // All positions below are physical, in px from the left of the scrolled content,
    // so the same rules serve both directions; only "start" and "end" swap sides.
    let caretX: number | null = null;
    if (focused && start !== null && end !== null) {
      const offset = !collapsed && input.selectionDirection === 'backward' ? start : end;
      const inputX = this.#inputX(input, rtl, maxScroll);
      const caret = caretOffset(input, offset);
      caretX = inputX + caret.x;
      if (reveal) {
        const width = this.clientWidth;
        if (anchor !== null) this.#setScrollX(anchor, rtl, maxScroll);
        if (collapsed && offset === input.value.length) this.#setScrollX(rtl ? 0 : maxScroll, rtl, maxScroll);
        // At the start, show what's before the text (padding, prefix), but never
        // let a long prefix push the caret past a third of the way across the strip.
        else if (collapsed && offset === 0) {
          this.#setScrollX(rtl ? Math.min(maxScroll, caretX - (width * 2) / 3) : caretX - width / 3, rtl, maxScroll);
        }
        // Then, wherever it is, keep the caret clear of any fade it would sit under:
        // both of its places where directions meet, if they fit, otherwise the likelier one.
        const both = caret.max - caret.min <= width - 2 * safeInset;
        const left = inputX + (both ? caret.min : caret.x);
        const right = inputX + (both ? caret.max : caret.x);
        const scrollX = this.#scrollX(rtl, maxScroll);
        if (scrollX > EDGE && left - scrollX < safeInset) this.#setScrollX(left - safeInset, rtl, maxScroll);
        else if (maxScroll - scrollX > EDGE && right - scrollX > width - safeInset) {
          this.#setScrollX(right - width + safeInset, rtl, maxScroll);
        }
      }
    }

    const { leftProgress, rightProgress, scrollX } = this.#syncFades(fadeWidth);

    // A caret scrolled into a fade by trackpad or wheel stays drawn through the
    // gradient and is hidden only where the text is fully faded out.
    const solid = length(style, '--sabi-fade-solid', 8);
    const viewportX = caretX === null ? null : caretX - scrollX;
    this.toggleAttribute('data-caret-hidden', collapsed && viewportX !== null && (
      viewportX < solid * leftProgress || viewportX > this.clientWidth - solid * rightProgress
    ));
  }

  // Scroll as px of content hidden past the left edge, in either direction.
  // Right-to-left scrolling starts at 0 and goes negative (CSSOM View, in every
  // current engine), so offset it by the scroll range, as MUI's scrollLeft helper does.
  #scrollX(rtl: boolean, maxScroll: number) {
    return rtl ? this.scrollLeft + maxScroll : this.scrollLeft;
  }

  #setScrollX(x: number, rtl: boolean, maxScroll: number) {
    const clamped = Math.min(maxScroll, Math.max(0, x));
    this.scrollLeft = rtl ? clamped - maxScroll : clamped;
  }

  // The input's left edge in the same coordinates. offsetLeft is measured from where
  // an unscrolled strip starts, which is its right end in right-to-left.
  #inputX(input: HTMLInputElement, rtl: boolean, maxScroll: number) {
    return input.offsetLeft + input.clientLeft + (rtl ? maxScroll : 0);
  }

  // Each fade's strength follows how much text is hidden on its side, so it
  // lands in the same frame as any scroll, jump or not, with nothing to animate.
  #syncFades(fadeWidth: number) {
    const rtl = getComputedStyle(this).direction === 'rtl';
    const maxScroll = Math.max(0, this.scrollWidth - this.clientWidth);
    const scrollX = this.#scrollX(rtl, maxScroll);
    const hiddenLeft = Math.max(0, scrollX);
    const hiddenRight = Math.max(0, maxScroll - scrollX);
    const leftProgress = Math.min(1, hiddenLeft / fadeWidth);
    const rightProgress = Math.min(1, hiddenRight / fadeWidth);
    this.style.setProperty('--sabi-fade-left-progress', String(leftProgress));
    this.style.setProperty('--sabi-fade-right-progress', String(rightProgress));
    this.toggleAttribute('data-fade-left', hiddenLeft > EDGE);
    this.toggleAttribute('data-fade-right', hiddenRight > EDGE);
    // The same, named by reading direction.
    this.toggleAttribute('data-fade-start', (rtl ? hiddenRight : hiddenLeft) > EDGE);
    this.toggleAttribute('data-fade-end', (rtl ? hiddenLeft : hiddenRight) > EDGE);
    return { leftProgress, rightProgress, scrollX };
  }
}

export const define = (name = 'sabi-input') => {
  if (typeof customElements === 'undefined' || customElements.get(name)) return;
  customElements.define(name, class extends SabiInput {});
};

declare global {
  interface HTMLElementTagNameMap {
    'sabi-input': SabiInput;
  }
}
