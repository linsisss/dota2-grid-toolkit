import { useEffect, useState } from 'react';
import { gridBackground, onGridBackground, setGridBackground } from '../../scripts/grid-background.mjs';
import { hasMyBackground } from '../my-background.js';
import { t } from '../../scripts/i18n.mjs';

// «Как в Dota» / «Градиент» / «Мой фон» behind every grid preview; remembered in this browser.
// «Мой фон» is the menu background built last in «Студия»; without one the button says where it comes from.
export function GridBackgroundSwitch() {
  const [value, setValue] = useState(gridBackground), [mine, setMine] = useState(false);
  useEffect(() => onGridBackground(setValue), []);
  useEffect(() => { hasMyBackground().then(setMine); }, []);
  return <div className="catalog-background-switch" role="group" aria-label={t('Фон превью')}>
    <span>{t('Фон')}</span>
    <button type="button" aria-pressed={value === 'dota' || (value === 'mine' && !mine)} onClick={() => setGridBackground('dota')}>{t('Как в Dota')}</button>
    <button type="button" aria-pressed={value === 'gradient'} onClick={() => setGridBackground('gradient')}>{t('Градиент')}</button>
    <button type="button" aria-pressed={value === 'mine' && mine} disabled={!mine} title={mine ? t('Твой фон главного меню из студии') : t('Собери фон главного меню — он появится здесь')} onClick={() => setGridBackground('mine')}>{t('Мой фон')}</button>
  </div>;
}
