import { expect, test } from '@playwright/test';
import type { SabiInput } from '../packages/sabi-input/src/core';

test.beforeEach(async ({ page }) => {
  await page.goto('/fixtures/submission.html');
  await page.evaluate(() => customElements.whenDefined('sabi-input'));
});

for (const [prefix, suffix, expected] of [
  [false, false, 'example'], [true, false, 'https://example'],
  [false, true, 'example.com'], [true, true, 'https://example.com'],
] as const) {
  test(`submitted prefix=${prefix}, suffix=${suffix}`, async ({ page }) => {
    const result = await page.evaluate(({ prefix, suffix }) => {
      const host = document.getElementById('affixes') as SabiInput;
      host.submitPrefix = prefix;
      host.submitSuffix = suffix;
      const input = host.querySelector('input')!;
      input.required = true;
      input.pattern = '[a-z]+';
      return {
        submitted: new FormData(input.form!).get('website'), value: input.value, name: input.name,
        valid: input.checkValidity(), prefix: host.hasAttribute('submit-prefix'), suffix: host.hasAttribute('submit-suffix'),
      };
    }, { prefix, suffix });
    expect(result).toEqual({ submitted: expected, value: 'example', name: 'website', valid: true, prefix, suffix });
  });
}

test('default flags are off and empty values stay empty without changing required validation', async ({ page }) => {
  const result = await page.evaluate(() => {
    const host = document.createElement('sabi-input');
    host.innerHTML = '<span>before</span><input name="empty" required><span>after</span>';
    const form = document.getElementById('submission') as HTMLFormElement;
    form.append(host);
    const defaults = { prefix: host.submitPrefix, suffix: host.submitSuffix, value: new FormData(form).get('empty') };
    host.submitPrefix = host.submitSuffix = true;
    return { defaults, optedIn: new FormData(form).get('empty'), valid: host.querySelector('input')!.checkValidity() };
  });
  expect(result).toEqual({ defaults: { prefix: false, suffix: false, value: '' }, optedIn: '', valid: false });
});

test('repeated names retain every entry, including identical raw values and other entry order', async ({ page }) => {
  const result = await page.evaluate(() => {
    const form = document.getElementById('submission') as HTMLFormElement;
    form.insertAdjacentHTML('afterbegin', '<input name="before" value="first">');
    form.insertAdjacentHTML('beforeend', '<input name="website" value="example"><sabi-input submit-prefix><span>other:</span><input name="website" value="example"></sabi-input><input name="after" value="last">');
    return [...new FormData(form)];
  });
  expect(result).toEqual([['before', 'first'], ['website', 'example'], ['website', 'example'], ['website', 'example'], ['after', 'last']]);
});

test('nameless, disabled and disabled-fieldset fields do not acquire submitted entries', async ({ page }) => {
  const result = await page.evaluate(() => {
    const form = document.getElementById('submission') as HTMLFormElement;
    const host = document.getElementById('affixes')!;
    const input = host.querySelector('input')!;
    input.removeAttribute('name');
    const nameless = [...new FormData(form)];
    input.name = 'website'; input.disabled = true;
    const disabled = [...new FormData(form)];
    input.disabled = false;
    const fieldset = document.createElement('fieldset'); fieldset.disabled = true;
    form.append(fieldset); fieldset.append(host);
    return { nameless, disabled, fieldset: [...new FormData(form)] };
  });
  expect(result).toEqual({ nameless: [], disabled: [], fieldset: [] });
});

test('external form association and changing names use the native form owner', async ({ page }) => {
  const result = await page.evaluate(() => {
    const host = document.getElementById('affixes')!;
    const input = host.querySelector('input')!;
    const original = document.getElementById('submission') as HTMLFormElement;
    const external = document.createElement('form'); external.id = 'external'; document.body.append(external);
    input.setAttribute('form', 'external'); input.name = 'renamed';
    const changed = [...new FormData(external)];
    input.name = 'elements';
    return { original: [...new FormData(original)], changed, shadowedElements: [...new FormData(external)] };
  });
  expect(result).toEqual({ original: [], changed: [['renamed', 'https://example.com']], shadowedElements: [['elements', 'https://example.com']] });
});

test('affixes read fresh element text, flags and replacement inputs synchronously', async ({ page }) => {
  const result = await page.evaluate(() => {
    const host = document.getElementById('affixes') as SabiInput;
    host.innerHTML = '\n ignored text \n<span> pre <b>fix:</b> </span>\n<input name="fresh" value="typed">\n<span> :suffix </span>\n';
    host.submitPrefix = true; host.submitSuffix = false;
    const input = host.querySelector('input')!;
    const prefix = new FormData(input.form!).get('fresh');
    host.children[0].textContent = 'new:';
    host.setAttribute('submit-suffix', '');
    input.value = 'updated';
    return { prefix, both: new FormData(input.form!).get('fresh'), value: input.value };
  });
  expect(result).toEqual({ prefix: ' pre fix: typed', both: 'new:updated :suffix ', value: 'updated' });
});

test('supported native input types compose payloads while unsupported controls stay native', async ({ page }) => {
  const result = await page.evaluate(() => {
    const host = document.getElementById('affixes')!;
    const input = host.querySelector('input')!;
    const results: Record<string, FormDataEntryValue | null> = {};
    for (const type of ['text', 'search', 'url', 'tel', 'password', 'email', 'number', 'color']) {
      input.type = type;
      input.value = type === 'number' ? '42' : type === 'color' ? '#112233' : 'example';
      results[type] = new FormData(input.form!).get('website');
    }
    return results;
  });
  expect(result).toEqual({ text: 'https://example.com', search: 'https://example.com', url: 'https://example.com', tel: 'https://example.com', password: 'https://example.com', email: 'https://example.com', number: 'https://42.com', color: '#112233' });
});

test('prior application transformations and additional entries are not overwritten', async ({ page }) => {
  const result = await page.evaluate(() => {
    const form = document.getElementById('submission') as HTMLFormElement;
    const transform = (event: Event) => (event as FormDataEvent).formData.set('website', 'application-value');
    window.addEventListener('formdata', transform, { capture: true });
    const transformed = [...new FormData(form)];
    window.removeEventListener('formdata', transform, true);
    const add = (event: Event) => (event as FormDataEvent).formData.append('website', 'additional');
    window.addEventListener('formdata', add, { capture: true });
    const additional = [...new FormData(form)];
    window.removeEventListener('formdata', add, true);
    return { transformed, additional };
  });
  expect(result).toEqual({ transformed: [['website', 'application-value']], additional: [['website', 'example'], ['website', 'additional']] });
});

test('reconnection removes old root listeners and shadow-root form submission works', async ({ page }) => {
  const result = await page.evaluate(() => {
    document.getElementById('affixes')!.remove();
    const form = document.getElementById('submission') as HTMLFormElement;
    let calls = 0;
    const originalAdd = document.addEventListener.bind(document);
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === 'formdata') return originalAdd(type, (event) => {
        calls++;
        if (typeof listener === 'function') listener.call(document, event);
        else listener.handleEvent(event);
      }, options);
      return originalAdd(type, listener, options);
    }) as typeof document.addEventListener;
    const host = document.createElement('sabi-input');
    host.setAttribute('submit-prefix', ''); host.innerHTML = '<span>prefix:</span><input name="value" value="raw">';
    for (let i = 0; i < 3; i++) { form.append(host); host.remove(); }
    form.append(host);
    document.addEventListener = originalAdd;
    const value = new FormData(form).get('value');
    host.remove(); new FormData(form);
    const detachedCalls = calls;
    const container = document.createElement('div'); document.body.append(container);
    const shadow = container.attachShadow({ mode: 'open' });
    const shadowForm = document.createElement('form'); shadow.append(shadowForm); shadowForm.append(host);
    const shadowValue = new FormData(shadowForm).get('value');
    return { calls, detachedCalls, value, shadowValue };
  });
  expect(result).toEqual({ calls: 1, detachedCalls: 1, value: 'prefix:raw', shadowValue: 'prefix:raw' });
});

test('native requestSubmit sends composed form data', async ({ page }) => {
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/submitted' && response.request().method() === 'POST'),
    page.evaluate(() => (document.getElementById('submission') as HTMLFormElement).requestSubmit()),
  ]);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual([['website', 'https://example.com']]);
});

test('React controlled fields emit one change per keystroke and false props remove attributes', async ({ page }) => {
  await page.goto('/react');
  const root = page.locator('#submitted-affixes');
  const input = root.locator('input');
  await input.focus();
  await input.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
  await input.pressSequentially('abc');
  await expect(root.locator('[data-row="onChange"]')).toHaveText('3');
  await expect(root.locator('[data-row="value"]')).toHaveText('exampleabc');
  await root.getByRole('button', { name: 'Read submitted website' }).click();
  await expect(root.locator('[data-row="submitted"]')).toHaveText('https://exampleabc.com');
  await root.getByRole('button', { name: 'Toggle submitted affixes' }).click();
  await expect(root.locator('sabi-input')).not.toHaveAttribute('submit-prefix');
  await expect(root.locator('sabi-input')).not.toHaveAttribute('submit-suffix');
  await root.getByRole('button', { name: 'Read submitted website' }).click();
  await expect(root.locator('[data-row="submitted"]')).toHaveText('exampleabc');
});


test('boolean properties assigned before upgrade reflect through the class setters', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/packages/sabi-input/dist/index.js', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/fixtures/submission.html', { waitUntil: 'commit' });
  await page.locator('#affixes').waitFor({ state: 'attached' });
  const before = await page.evaluate(() => {
    const host = document.getElementById('affixes') as SabiInput;
    host.removeAttribute('submit-prefix'); host.removeAttribute('submit-suffix');
    host.submitPrefix = true; host.submitSuffix = false;
    return { defined: Boolean(customElements.get('sabi-input')), own: Object.hasOwn(host, 'submitPrefix') };
  });
  expect(before).toEqual({ defined: false, own: true });
  release();
  await page.evaluate(() => customElements.whenDefined('sabi-input'));
  const after = await page.evaluate(() => {
    const host = document.getElementById('affixes') as SabiInput;
    return {
      prefix: host.hasAttribute('submit-prefix'), suffix: host.hasAttribute('submit-suffix'),
      own: Object.hasOwn(host, 'submitPrefix'), submitted: new FormData(host.querySelector('input')!.form!).get('website'),
    };
  });
  expect(after).toEqual({ prefix: true, suffix: false, own: false, submitted: 'https://example' });
});

test('password affixes affect only the payload and never copy the password into page markup', async ({ page }) => {
  const result = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#affixes input')!;
    input.type = 'password'; input.value = 'submitted-password-fixture';
    const submitted = new FormData(input.form!).get('website');
    return { submitted, value: input.value, copied: document.body.innerHTML.includes('submitted-password-fixture') };
  });
  expect(result).toEqual({ submitted: 'https://submitted-password-fixture.com', value: 'submitted-password-fixture', copied: false });
});
