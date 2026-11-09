# Reference

See the [Sabi documentation](https://sabi.vicentecr.uz/getting-started) for the Introduction and Styling pages.

## Markup

`<sabi-input>` wraps your own `<input>`, so form submission and React's controlled inputs keep working. It is the scrolling text strip, not the field box: put backgrounds, borders and focus styles on a parent, because the fade masks everything the element paints. Put vertical padding on the element itself, so it fills the box: iOS clips selection handles to it. It inherits its parent's `border-radius`, so that clip matches the box's corners. iOS rounds the clip to whole pixels, so a box with a fractional height leaves a sliver between handle and focus ring; a whole-pixel line height avoids it.

- An element before the input is a prefix. It is dimmed and clicks pass through it.
- An element after the input (a suffix, a button) follows the end of the text. It is dimmed too.

Text-like inputs (text, search, url, tel, password) are enhanced. A password, or any field masked with `-webkit-text-security`, is measured from the browser's own dots, so its value is never copied into the page; a show-password toggle that switches the type is followed. Fields whose caret can't be read (`type="email"`, `number`) stay a plain input: see [Email and number fields](#email-and-number-fields). Sabi also follows an input that a framework replaces.

Call `sync()` on the element after changes Sabi can't observe, such as a font swap on the input itself.

Without cascade layers (before Chrome 99, Firefox 97 and Safari 15.4) the element isn't registered and the input stays plain.

## Email and number fields

Browsers don't expose the caret in `type="email"` and `type="number"` fields (`selectionStart` is `null`, by the HTML spec), and Sabi can't keep a caret clear of the fades without knowing where it is. These fields stay a plain input that scrolls itself, with no fades.

For an email field that should fade, use a text input with the email keyboard and autofill, and validate it yourself:

```html
<input type="text" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" />
```

Unlike `type="email"`, a text input submits surrounding spaces (trim the value before sending it), doesn't check the address's format (add a `pattern` or validate on submit), doesn't match `input[type=email]` selectors, and doesn't accept a comma-separated list for `multiple`.

For a number, keep `type="number"`: it rarely outgrows the field, and a text input loses stepping, `valueAsNumber` and min, max and step validation. For long numeric codes and IDs, which aren't quantities, `type="text" inputmode="numeric"` is the better input anyway.

### What was tried

Making `type="email"` work without changes to your markup was tested in Chromium, Firefox and WebKit before release:

- **Converting the field to `type="text"`** when Sabi binds it, with `inputmode` and `autocomplete` added and validity kept through `setCustomValidity` and the spec's email pattern. The fades worked, but the field stopped behaving like an email field: surrounding spaces were submitted (native email fields strip them), errors reported `customError` instead of `typeMismatch`, Firefox accepts addresses with international domains that the pattern rejects, `multiple` diverged, and `input[type=email]` selectors stopped matching.
- **Reporting `type` as `'email'` after converting it.** Overriding only the getter crashed React's controlled inputs in every engine. Overriding the setter too stopped the crash and a caret reset, but left the differences above, and made `getAttribute('type')` and `type` disagree.
- **Reading the caret another way.** No API found reports the current caret position in a native email field without changing the field.

If you find a way that keeps an email field's behaviour intact, [open an issue or a pull request](https://github.com/vicentecr-uz/sabi/issues).

## Submitting affixes

`submit-prefix` and `submit-suffix` are independent boolean attributes, off by default. Set the reflected `submitPrefix` and `submitSuffix` properties from JavaScript, or pass those boolean props to React's `Sabi` component.

```html
<form>
  <label for="website">Website</label>
  <sabi-input submit-prefix submit-suffix>
    <span>https://</span>
    <input id="website" name="website" value="example" />
    <span>.com</span>
  </sabi-input>
</form>
```

Native submission and `new FormData(form)` contain `website=https://example.com`. The input's own value stays `example`, with its name and validation unchanged. An empty value stays empty.

```tsx
import { Sabi } from 'sabi-input/react';

<Sabi submitPrefix={includeProtocol} submitSuffix={includeDomain}>
  <span>https://</span>
  <input name="website" aria-label="Website" value={website} onChange={(event) => setWebsite(event.target.value)} />
  <span>.com</span>
</Sabi>
```

Each option uses the `textContent` of direct child elements on its side of the direct child input, in DOM order. Text nodes between elements, including source indentation, are ignored. Spaces inside an affix element are preserved, and no separator is added automatically. Changes to the flags, affix text, input name or input value are read when the form data is created.

Use a distinct name for each composed field. If another control uses the same name, all entries with that name keep their native values, including entries with identical text. An extra form-data entry or an earlier application transformation of the value also leaves that field unchanged. Disabled and nameless inputs do not gain an entry. The input's native form owner determines which form receives its value, including an explicit `form` attribute.

Submission options work with text, search, url, tel, password, email and number inputs. The existing plain-input behaviour of email and number fields is unchanged. Password values are never written into page elements for this feature.

## Right-to-left

The field follows its direction: `dir="rtl"` on `<sabi-input>` or any ancestor starts the text on the right, puts the prefix on the right and the suffix after the end of the text, on the left. An input with its own `dir` attribute, usually `dir="auto"`, sets the field's direction from its text.

Mixed-direction text (Hebrew or Arabic with numbers, English names, URLs) is supported: Sabi reads where the caret is from the laid-out text instead of measuring the text before it. Where runs of each direction meet, one caret position has two places on screen; browsers draw the caret beside the character running in the field's direction, and Sabi keeps that one clear.

Sabi never moves the caret. Arrow keys belong to the browser, so in mixed Hebrew and English text the caret moves the way it does in any other field in that browser: by screen side in Safari and Firefox, and in reading order in Chrome and Edge, where it jumps to the far end of an English word and walks back through it. Sabi keeps it in view either way.

## React

Use the `Sabi` component in place of `<sabi-input>`. It registers the element once the page has hydrated (registered earlier, it can stop React tracking the input's value, so `onChange` may fire twice), and it brings the JSX types for `<sabi-input>` too. Its ref is the `<sabi-input>` element.

```tsx
import { Sabi } from 'sabi-input/react';

<Sabi>
  <span>https://</span>
  <input value={url} onChange={(event) => setUrl(event.target.value)} />
</Sabi>
```

## Styling

| Variable | Default |
| --- | --- |
| `--sabi-fade-width` | `22px` |
| `--sabi-fade-solid` | `8px` |
| `--sabi-caret-penetration` | `4px` |
| `--sabi-edge-gutter` | `8px` |

Styles are injected once into a `@layer`, so your own rules win, except for the spacing Sabi measures from: the element's horizontal padding and the input's margin, padding and border. Those are `!important`, so a page's CSS reset can't break them; set the gutter with `--sabi-edge-gutter`. To ship the CSS yourself, `import { define } from 'sabi-input/core'`, call `define()`, and load `sabi-input/styles.css` your own way.

`data-fade-left` and `data-fade-right` are set on the element while text is hidden on that side. `data-fade-start` and `data-fade-end` name the same state by reading direction, so they swap sides in right-to-left text.
