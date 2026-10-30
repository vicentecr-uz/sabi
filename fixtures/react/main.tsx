import { StrictMode, useEffect, useRef, useState, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import 'sabi-input';
import type { SabiInput } from 'sabi-input';
import type {} from 'sabi-input/react';

const LONG = 'example.com/a/long/path/that/runs/past/the/edge/of/the/field';

const useFades = (host: RefObject<SabiInput | null>) => {
  const [fades, setFades] = useState({ left: false, right: false });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const read = () => setFades({ left: element.hasAttribute('data-fade-left'), right: element.hasAttribute('data-fade-right') });
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { attributes: true, attributeFilter: ['data-fade-left', 'data-fade-right'] });
    return () => observer.disconnect();
  }, [host]);
  return fades;
};

const Readout = ({ rows }: { rows: Record<string, string | number> }) => (
  <dl>
    {Object.entries(rows).map(([label, value]) => [
      <dt key={`${label}-label`}>{label}</dt>,
      <dd key={label} data-row={label}>{value}</dd>,
    ])}
  </dl>
);

const onOff = (on: boolean) => (on ? 'on' : 'off');

function Controlled() {
  const host = useRef<SabiInput>(null);
  const [text, setText] = useState('');
  const [changes, setChanges] = useState(0);
  const fades = useFades(host);
  return (
    <section id="controlled">
      <h2>Controlled</h2>
      <div className="box">
        <sabi-input ref={host}>
          <span>https://</span>
          <input
            aria-label="URL"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setChanges((count) => count + 1);
            }}
          />
        </sabi-input>
      </div>
      <div className="actions">
        <button onClick={() => setText(LONG)}>Fill</button>
        <button onClick={() => setText('')}>Clear</button>
      </div>
      <Readout rows={{ value: JSON.stringify(text), onChange: changes, 'fade left': onOff(fades.left), 'fade right': onOff(fades.right) }} />
    </section>
  );
}

function RemountField() {
  const host = useRef<SabiInput>(null);
  const fades = useFades(host);
  return (
    <>
      <div className="box">
        <sabi-input ref={host}>
          <input aria-label="Remounted" defaultValue={LONG} />
        </sabi-input>
      </div>
      <Readout rows={{ 'fade left': onOff(fades.left), 'fade right': onOff(fades.right) }} />
    </>
  );
}

function Remount() {
  const [mounted, setMounted] = useState(true);
  const [mounts, setMounts] = useState(1);
  return (
    <section id="remount">
      <h2>Remount</h2>
      {mounted && <RemountField />}
      <div className="actions">
        <button
          onClick={() => {
            if (!mounted) setMounts((count) => count + 1);
            setMounted(!mounted);
          }}
        >
          {mounted ? 'Unmount' : 'Mount'}
        </button>
      </div>
      <Readout rows={{ mounts }} />
    </section>
  );
}

function Suffix() {
  const input = useRef<HTMLInputElement>(null);
  const trail = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState('my-post');
  const [suffix, setSuffix] = useState('.md');
  const [gap, setGap] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!input.current || !trail.current) return;
      // From where the text ends, not from the input's box (which has caret room).
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(input.current).font}`;
      span.textContent = input.current.value;
      document.body.append(span);
      const textEnd = input.current.getBoundingClientRect().left + span.getBoundingClientRect().width;
      span.remove();
      setGap(`${(trail.current.getBoundingClientRect().left - textEnd).toFixed(1)}px`);
    });
    return () => cancelAnimationFrame(frame);
  }, [text, suffix]);
  return (
    <section id="suffix">
      <h2>Suffix</h2>
      <div className="box">
        <sabi-input>
          <input ref={input} aria-label="Slug" value={text} onChange={(event) => setText(event.target.value)} />
          <span ref={trail}>{suffix}</span>
        </sabi-input>
      </div>
      <div className="actions">
        <button onClick={() => setSuffix(suffix === '.md' ? '.markdown' : '.md')}>Swap suffix</button>
      </div>
      <Readout rows={{ suffix, gap }} />
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Controlled />
    <Remount />
    <Suffix />
  </StrictMode>,
);
