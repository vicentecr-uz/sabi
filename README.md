<!-- TODO: demo video -->

[Sabi](https://sabi.vicentecr.uz/) is a text input whose overflowing edges fade, with the caret always kept in view. You can read more about why and how it was built [here](https://sabi.vicentecr.uz/how-it-works).

## Usage

Install it in your project:

```bash
npm install sabi-input
```

Import it once to register `<sabi-input>`, then wrap any `<input>` with it. An element before the input becomes a prefix; one after it follows the end of the text.

```html
<script type="module">import 'sabi-input';</script>

<label class="field">
  <sabi-input>
    <span>https://</span>
    <input name="url" />
  </sabi-input>
</label>
```

## Documentation

Find the full API reference in the [documentation](https://sabi.vicentecr.uz/getting-started).
