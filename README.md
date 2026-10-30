# Sabi

A text input whose overflowing edges fade, with the caret always kept clear of the fade. *Sabi* is Tagalog for "to say" or "to tell".

```bash
npm i sabi-input
```

```html
<script type="module">import 'sabi-input';</script>

<label class="field">
  <sabi-input prefix="https://">
    <input name="url" />
  </sabi-input>
</label>
```

`<sabi-input>` wraps your own `<input>`, so forms, labels, autofill and framework bindings keep working. It is the scrolling text strip, not the field box: put backgrounds, borders and focus styles on a parent, because the fade masks everything the element paints. Any element after the input (a suffix, a button) follows the end of the text.

## Styling

| Variable | Default |
| --- | --- |
| `--sabi-fade-width` | `22px` |
| `--sabi-fade-solid` | `8px` |
| `--sabi-caret-penetration` | `4px` |
| `--sabi-edge-gutter` | `8px` |

Styles are injected once into a `@layer`, so your own rules win. To ship the CSS yourself, import `sabi-input/core` and `sabi-input/styles.css` instead.

## Development

```bash
bun install
bun run test   # Playwright: Chromium, Firefox, WebKit
bun run dev    # docs site
```

## License

MIT
