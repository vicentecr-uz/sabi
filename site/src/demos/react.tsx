import { useState } from 'react';
import { Sabi } from 'sabi-input/react';

export function UrlField() {
  const [url, setUrl] = useState('');
  return (
    <label className="field">
      <Sabi>
        <span>https://</span>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </Sabi>
    </label>
  );
}
