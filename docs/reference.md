# Reference

Source material for the Getting started and Styling pages until the docs site has them.

## Markup

`<sabi-input>` wraps your own `<input>`, so form submission and React's controlled inputs keep working. It is the scrolling text strip, not the field box: put backgrounds, borders and focus styles on a parent, because the fade masks everything the element paints. Put vertical padding on the element itself, so it fills the box: iOS clips selection handles to it. It inherits its parent's `border-radius`, so that clip matches the box's corners. iOS rounds the clip to whole pixels, so a box with a fractional height leaves a sliver between handle and focus ring; a whole-pixel line height avoids it.

- An element before the input is a prefix. It is dimmed and clicks pass through it.
- An element after the input (a suffix, a button) follows the end of the text. It is dimmed too.

## Right-to-left

The field follows its direction: `dir="rtl"` on `<sabi-input>` or any ancestor starts the text on the right, puts the prefix on the right and the suffix after the end of the text, on the left. An input with its own `dir` attribute, usually `dir="auto"`, sets the field's direction from its text.

Mixed-direction text (Hebrew or Arabic with numbers, English names, URLs) is supported: Sabi reads where the caret is from the laid-out text instead of measuring the text before it. Where runs of each direction meet, one caret position has two places on screen; browsers draw the caret beside the character running in the field's direction, and Sabi keeps that one clear.

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

`data-fade-left` and `data-fade-right` are set on the element while text is hidden on that side. `data-fade-start` and `data-fade-end` name the same state by reading direction, so they swap sides in right-to-left text.
