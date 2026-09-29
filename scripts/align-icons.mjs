import { iconSVG } from './icons.mjs';

// Alignment icons (Lucide, scripts/icons.mjs), shared by the properties panel and the context menu.
export const ALIGN_ACTIONS = [
  ['align-left', 'По левому краю', 'alignLeft'],
  ['align-hcenter', 'По центру по горизонтали', 'alignHCenter'],
  ['align-right', 'По правому краю', 'alignRight'],
  ['align-top', 'По верхнему краю', 'alignTop'],
  ['align-vmiddle', 'По центру по вертикали', 'alignVMiddle'],
  ['align-bottom', 'По нижнему краю', 'alignBottom']
];
export const DISTRIBUTE_ACTIONS = [
  ['distribute-x', 'Распределить по горизонтали', 'distributeX'],
  ['distribute-y', 'Распределить по вертикали', 'distributeY']
];
export const alignIconSVG = (name) => iconSVG(name, 'align-icon');
