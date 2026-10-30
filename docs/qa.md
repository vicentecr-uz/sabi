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
| Long-prefix field: Cmd+← from the end | The caret stops at the middle; the prefix is cut off on the left, not pushed past the middle |
| Long-prefix field: scroll with the trackpad to the left | The rest of the prefix is reachable |
| Trackpad-scroll any long field slowly | The fades grow and shrink with the scroll, no jumps |
| Click the empty space to the right of `short.md` | Focus with the caret at the end |
| Type in the `.md` field | `.md` stays glued to the end of the text |

## React page

| Do | Expect |
| --- | --- |
| Type `abc` into Controlled | value `"abc"`, onChange `3` |
| Type until the text passes the right edge | Every keystroke appears; onChange keeps counting one per key; fade left turns on |
| Fill | The field shows the long URL; fade right `on` |
| Click the field, Cmd+→, Backspace × 5 | Five characters gone, onChange `5`; nothing reappears |
| Clear | The field empties; both fades `off` |
| Remount: Unmount, Mount, three times | mounts counts up; after each Mount, fade right `on` and the field still scrolls |
| Suffix: type, then Swap suffix | gap stays at about `0.0px`; the suffix follows the text |
| Open the browser console | No errors |
