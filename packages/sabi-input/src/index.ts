import css from './styles.css' with { type: 'text' };
import { define } from './core.js';

if (typeof document !== 'undefined' && !document.querySelector('style[data-sabi-input]')) {
  const style = document.createElement('style');
  style.dataset.sabiInput = '';
  style.textContent = css;
  document.head.append(style);
}

define();

export { SabiInput, define } from './core.js';
