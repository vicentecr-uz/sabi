# Contributing

```bash
bun install
bun run test         # type-check, then Playwright in Chromium, Firefox and WebKit
bun run test:watch   # the same tests in visible, slowed-down browsers
bun run fixtures     # the test pages at localhost:4173 and localhost:4173/react
```

Before a release, run the hands-on checklist in [docs/qa.md](docs/qa.md).

## Browser support

Reach as far back as is cheap, and degrade gracefully past that. The floor is cascade layers: Chrome 99, Firefox 97 and Safari 15.4 (early 2022). Below it `define()` registers nothing and the input stays plain (older still, the script's syntax doesn't parse, with the same result). Anything newer needs a fallback that costs a line or two, or must fail into a plain working input, never a broken one: `Intl.Segmenter` (Firefox 125) falls back to code points; `mask-image` is also set prefixed (unprefixed from Chrome 120); `:has()` only dims a prefix and lets clicks through it, so without it (Chrome 105, Safari 15.4, Firefox 121) the prefix is undimmed and a click on it doesn't focus the input. Note the version that needs it next to any newer feature.
