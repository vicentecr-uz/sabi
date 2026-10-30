import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { SabiInput } from './core';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'sabi-input': DetailedHTMLProps<HTMLAttributes<SabiInput>, SabiInput>;
    }
  }
}
