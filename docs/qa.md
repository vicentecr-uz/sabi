# Hands-on QA

Run before every release, in Zen, Safari, Chrome, and Safari on an iPhone.

```bash
bun run fixtures
```

Opens two pages: `http://localhost:4173/` (plain HTML) and `http://localhost:4173/react`. On the iPhone, use the Mac's local IP instead of `localhost` (same Wi-Fi).

To watch the automated tests drive real browser windows: `bun run test:watch`. Add `--project firefox` (or `chromium`, `webkit`) to watch one engine, and `--grep "prefix"` to watch only matching tests.

Each step: **do** → **expect**. Anything else is a bug.

## Plain page

| Do | Expect |
| --- | --- |
| Click at the end of the first field and type | The text scrolls left; the caret never sits under the left fade; the right edge is crisp |
| Cmd+← | Jumps to the start, `https://` visible, right fade on, no flash of an unfaded right edge |
| Cmd+→ | Jumps to the end, left fade on, no flash |
| Hold ← from the end | The caret walks left; the text scrolls before the caret reaches the fade |
| Option+← repeatedly | Jumps word by word, same as above |
| Arrow over the 👍🏽 | One press moves past the whole emoji |
| Long-prefix field: Cmd+← from the end | The caret stops a third of the way across; the prefix is cut off on the left, not pushed further |
| Long-prefix field: scroll with the trackpad to the left | The rest of the prefix is reachable |
| Trackpad-scroll any long field slowly | The fades grow and shrink with the scroll, no jumps |
| Click into a long field, then trackpad-scroll the caret towards an edge | The caret stays visible through the fade and disappears only in the fully faded edge |
| Click the empty space to the right of `short.md` | Focus with the caret at the end |
| Type in the `.md` field | `.md` stays glued to the end of the text, dimmed like `https://` |

## React page

| Do | Expect |
| --- | --- |
| Type `abc` into Controlled | value `"abc"`, onChange `3` |
| Type until the text passes the right edge | Every keystroke appears; onChange keeps counting one per key; fade left turns on |
| Fill | The field shows the long URL; fade right `on` |
| Click the field, Cmd+→, Backspace × 5 | Five characters gone, onChange goes up by 5; nothing reappears |
| Clear | The field empties; both fades `off` |
| Remount: Unmount, Mount, three times | mounts counts up; after each Mount, fade right `on` and the field still scrolls |
| Suffix: type, then Swap suffix | gap stays at about `0.0px`; the suffix follows the text |
| Open the browser console | No errors |

## iPhone

No keyboard shortcuts; use touch instead.

| Do | Expect |
| --- | --- |
| Tap into any long field | No grey flash, and nothing drawn past the field's edge |
| Tap at the end and type | The text scrolls; the caret stays clear of the left fade |
| Swipe a long field sideways | The fades follow; the caret hides only in the fully faded edge |
| Press and hold, drag the caret to each edge | The text scrolls; the caret stays visible |
| Double-tap a word to select it | The handles are clipped at the grey box's edges, following its rounded corners |
| Tap `https://` | The input focuses |
| React page: type past the edge, then in Suffix | Every letter appears; the suffix follows the text, dimmed |
