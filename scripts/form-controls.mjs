import { iconSVG } from './icons.mjs';
// Preserve native numeric semantics and events without browser spinner chrome.
export function stepNumber(input, direction, multiplier = 1) {
  if (input.disabled || input.readOnly) return;
  const before = input.value;
  direction > 0 ? input.stepUp(multiplier) : input.stepDown(multiplier);
  const value = input.value;
  // Bypass React's value tracker so controlled and imperative fields both update.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, before);
  input.value = before;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return value;
}

export const numberButtons = (label) =>
  `<span class="number-step-buttons"><button type="button" data-number-step="1" aria-label="Увеличить ${label}">${iconSVG('chevronUp')}</button><button type="button" data-number-step="-1" aria-label="Уменьшить ${label}">${iconSVG('chevron')}</button></span>`;
