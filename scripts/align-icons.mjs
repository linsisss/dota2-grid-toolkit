// Figma-style alignment icons (24 × 24 strokes), shared by the properties panel and the context menu.
export const ALIGN_ACTIONS = [
  ['align-left', 'По левому краю', 'M4 3v18M7 6h11v4H7zM7 14h7v4H7z'],
  ['align-hcenter', 'По центру по горизонтали', 'M12 3v18M5 6h14v4H5zM8 14h8v4H8z'],
  ['align-right', 'По правому краю', 'M20 3v18M6 6h11v4H6zM10 14h7v4h-7z'],
  ['align-top', 'По верхнему краю', 'M3 4h18M6 7h4v11H6zM14 7h4v7h-4z'],
  ['align-vmiddle', 'По центру по вертикали', 'M3 12h18M6 5h4v14H6zM14 8h4v8h-4z'],
  ['align-bottom', 'По нижнему краю', 'M3 20h18M6 6h4v11H6zM14 10h4v7h-4z']
];
export const DISTRIBUTE_ACTIONS = [
  ['distribute-x', 'Распределить по горизонтали', 'M4 4v16M20 4v16M10 7h4v10h-4z'],
  ['distribute-y', 'Распределить по вертикали', 'M4 4h16M4 20h16M7 10h10v4H7z']
];
export const alignIconSVG = (path) =>
  `<svg class="align-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
