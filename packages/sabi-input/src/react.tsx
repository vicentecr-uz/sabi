import { forwardRef, useEffect, useLayoutEffect, type HTMLAttributes } from 'react';
import type { SabiInput } from './core.js';
import { register } from './register.js';

type SubmissionAttributes = { 'submit-prefix'?: '' | true; 'submit-suffix'?: '' | true };
export type SabiProps = HTMLAttributes<SabiInput> & { submitPrefix?: boolean; submitSuffix?: boolean };

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'sabi-input': import('react').DetailedHTMLProps<import('react').HTMLAttributes<SabiInput> & SubmissionAttributes, SabiInput>;
    }
  }
}

// Registers the element after hydration (before it, it can stop React tracking the
// input's value, so onChange may fire twice) but before paint, so the field never
// shows unstyled. useEffect on the server, where useLayoutEffect warns in React 18.
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export const Sabi = forwardRef<SabiInput, SabiProps>(({ submitPrefix, submitSuffix, ...props }, ref) => {
  useBeforePaint(register, []);
  return <sabi-input {...props} ref={ref} submit-prefix={submitPrefix ? '' : undefined} submit-suffix={submitSuffix ? '' : undefined} />;
});
