import css from './styles.css' with { type: 'text' };
import { define } from './core';

if (!document.querySelector('style[data-sabi-input]')) {
  const style = document.createElement('style');
  style.dataset.sabiInput = '';
  style.textContent = css;
  document.head.append(style);
}

define();

export { SabiInput, define } from './core';
