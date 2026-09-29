import { useEffect, useState } from 'react';
import { gridBackground, onGridBackground, setGridBackground } from '../../scripts/grid-background.mjs';
import { hasMyBackground } from '../my-background.js';

// «Как в Dota» / «Градиент» / «Мой фон» behind every grid preview; remembered in this browser.
// «Мой фон» is the menu background built last in «Студия»; without one the button says where it comes from.
export function GridBackgroundSwitch() {
  const [value, setValue] = useState(gridBackground), [mine, setMine] = useState(false);
  useEffect(() => onGridBackground(setValue), []);
  useEffect(() => { hasMyBackground().then(setMine); }, []);
  return <div className="catalog-background-switch" role="group" aria-label="Фон превью">
    <span>Фон</span>
    <button type="button" aria-pressed={value === 'dota' || (value === 'mine' && !mine)} onClick={() => setGridBackground('dota')}>Как в Dota</button>
    <button type="button" aria-pressed={value === 'gradient'} onClick={() => setGridBackground('gradient')}>Градиент</button>
    <button type="button" aria-pressed={value === 'mine' && mine} disabled={!mine} title={mine ? 'Твой фон главного меню из студии' : 'Собери фон главного меню — он появится здесь'} onClick={() => setGridBackground('mine')}>Мой фон</button>
  </div>;
}
