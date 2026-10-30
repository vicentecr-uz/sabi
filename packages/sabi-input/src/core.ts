const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const FONT_PROPERTIES = ['font', 'letterSpacing', 'wordSpacing', 'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'textTransform'] as const;

let measureSpan: HTMLSpanElement | null = null;

const measure = (input: HTMLInputElement, text: string) => {
  if (!measureSpan?.isConnected) {
    measureSpan = document.createElement('span');
    measureSpan.setAttribute('aria-hidden', 'true');
    measureSpan.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;white-space:pre;pointer-events:none;';
    document.body.append(measureSpan);
  }
  const style = getComputedStyle(input);
  for (const property of FONT_PROPERTIES) measureSpan.style[property] = style[property];
  measureSpan.textContent = text || '​';
  return measureSpan.getBoundingClientRect().width;
};

const length = (style: CSSStyleDeclaration, name: string, fallback: number) =>
  Number.parseFloat(style.getPropertyValue(name)) || fallback;

// Server renderers import this module where HTMLElement doesn't exist.
const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

// LTR only for now: RTL needs negative scrollLeft handling and mirrored insets.
export class SabiInput extends Base {
  #input: HTMLInputElement | null = null;
  #controller: AbortController | null = null;
  #frame = 0;
  #reveal = false;

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
    input.addEventListener('keydown', (event) => {
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
    const input = this.#input;
    if (!input) return;

    const style = getComputedStyle(this);
    const gutter = length(style, '--sabi-edge-gutter', 8);
    const fadeWidth = length(style, '--sabi-fade-width', 22);
    const safeInset = Math.max(gutter, fadeWidth - length(style, '--sabi-caret-penetration', 4));

    // 2px of room for the caret at the end; whatever follows the input overlaps it (styles.css).
    input.style.width = `${measure(input, input.value || input.placeholder) + 2}px`;
    const maxScroll = Math.max(0, this.scrollWidth - this.clientWidth);
    const focused = document.activeElement === input;
    const { selectionStart: start, selectionEnd: end } = input;
    const collapsed = start !== null && start === end;

    let caretX: number | null = null;
    if (focused && start !== null && end !== null) {
      const offset = !collapsed && input.selectionDirection === 'backward' ? start : end;
      caretX = input.offsetLeft + measure(input, input.value.slice(0, offset));
      if (reveal) {
        if (collapsed && offset === input.value.length) this.scrollLeft = maxScroll;
        // At the start, show what's before the text (padding, prefix), but never
        // let a long prefix push the caret past the middle of the strip.
        else if (collapsed && offset === 0) this.scrollLeft = Math.max(0, caretX - this.clientWidth / 2);
        else if (caretX - this.scrollLeft < safeInset) this.scrollLeft = Math.max(0, caretX - safeInset);
        else if (caretX - this.scrollLeft > this.clientWidth - safeInset) {
          this.scrollLeft = Math.min(maxScroll, caretX - this.clientWidth + safeInset);
        }
      }
    }

    const { fadeLeft, fadeRight } = this.#syncFades(fadeWidth);

    // A caret scrolled under a fade by trackpad or wheel is hidden rather than half-drawn.
    const viewportX = caretX === null ? null : caretX - this.scrollLeft;
    this.toggleAttribute('data-caret-hidden', collapsed && viewportX !== null && (
      viewportX < (fadeLeft ? safeInset : gutter) - 0.5
      || viewportX > this.clientWidth - (fadeRight ? safeInset : gutter) + 0.5
    ));
  }

  // Each fade's strength follows how much text is hidden on its side, so it
  // lands in the same frame as any scroll, jump or not, with nothing to animate.
  #syncFades(fadeWidth: number) {
    const hiddenRight = Math.max(0, this.scrollWidth - this.clientWidth - this.scrollLeft);
    this.style.setProperty('--sabi-fade-left-progress', String(Math.min(1, this.scrollLeft / fadeWidth)));
    this.style.setProperty('--sabi-fade-right-progress', String(Math.min(1, hiddenRight / fadeWidth)));
    const fadeLeft = this.scrollLeft > 0.5;
    const fadeRight = hiddenRight > 0.5;
    this.toggleAttribute('data-fade-left', fadeLeft);
    this.toggleAttribute('data-fade-right', fadeRight);
    return { fadeLeft, fadeRight };
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
