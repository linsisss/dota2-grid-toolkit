import { useEffect, useState } from 'react';
import { gridBackground, onGridBackground, setGridBackground } from '../../scripts/grid-background.mjs';

// «Как в Dota» / «Градиент» behind every grid preview; remembered in this browser.
export function GridBackgroundSwitch() {
  const [value, setValue] = useState(gridBackground);
  useEffect(() => onGridBackground(setValue), []);
  return <div className="catalog-background-switch" role="group" aria-label="Фон превью">
    <span>Фон</span>
    <button type="button" aria-pressed={value === 'dota'} onClick={() => setGridBackground('dota')}>Как в Dota</button>
    <button type="button" aria-pressed={value === 'gradient'} onClick={() => setGridBackground('gradient')}>Градиент</button>
  </div>;
}
