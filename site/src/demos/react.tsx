import { useState } from 'react';
import 'sabi-input';
import type {} from 'sabi-input/react';

export function UrlField() {
  const [url, setUrl] = useState('');
  return (
    <label className="field">
      <sabi-input>
        <span>https://</span>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </sabi-input>
    </label>
  );
}
