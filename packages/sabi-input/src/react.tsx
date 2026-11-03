import { forwardRef, useEffect, useLayoutEffect, type HTMLAttributes } from 'react';
import type { SabiInput } from './core.js';
import { register } from './register.js';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'sabi-input': import('react').DetailedHTMLProps<import('react').HTMLAttributes<SabiInput>, SabiInput>;
    }
  }
}

// Registers the element after hydration (before it, it can stop React tracking the
// input's value, so onChange may fire twice) but before paint, so the field never
// shows unstyled. useEffect on the server, where useLayoutEffect warns in React 18.
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export const Sabi = forwardRef<SabiInput, HTMLAttributes<SabiInput>>((props, ref) => {
  useBeforePaint(register, []);
  return <sabi-input {...props} ref={ref} />;
});
