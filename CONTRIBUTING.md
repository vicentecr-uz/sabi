# Contributing

```bash
bun install
bun run test         # type-check, then Playwright in Chromium, Firefox and WebKit
bun run test:watch   # the same tests in visible, slowed-down browsers
bun run fixtures     # the test pages at localhost:4173 and localhost:4173/react
bun run dev          # docs site
```

Before a release, run the hands-on checklist in [docs/qa.md](docs/qa.md).

## Browser support

Reach as far back as is cheap, and degrade gracefully past that. The floor is Chrome 90, Safari 15 and Firefox 90 (mid-2021), set by private methods and `addEventListener`'s `signal`. Anything newer needs a fallback that costs a line or two, or must fail into a plain working input, never a broken one: `Intl.Segmenter` (Firefox 125) falls back to code points; `:has()` only dims a prefix and lets clicks through it, so without it (Chrome 105, Safari 15.4, Firefox 121) the prefix is undimmed and a click on it doesn't focus the input. Note the version that needs it next to any newer feature.
