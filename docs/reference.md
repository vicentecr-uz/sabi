# Reference

Source material for the Getting started and Styling pages until the docs site has them.

## Markup

`<sabi-input>` wraps your own `<input>`, so form submission and React's controlled inputs keep working. It is the scrolling text strip, not the field box: put backgrounds, borders and focus styles on a parent, because the fade masks everything the element paints.

- An element before the input is a prefix. It is dimmed and clicks pass through it.
- An element after the input (a suffix, a button) follows the end of the text.

## React + TypeScript

Add once so `<sabi-input>` type-checks in JSX:

```ts
import type {} from 'sabi-input/react';
```

## Styling

| Variable | Default |
| --- | --- |
| `--sabi-fade-width` | `22px` |
| `--sabi-fade-solid` | `8px` |
| `--sabi-caret-penetration` | `4px` |
| `--sabi-edge-gutter` | `8px` |

Styles are injected once into a `@layer`, so your own rules win. To ship the CSS yourself, `import { define } from 'sabi-input/core'`, call `define()`, and load `sabi-input/styles.css` your own way.

`data-fade-left` and `data-fade-right` are set on the element while text is hidden on that side.
