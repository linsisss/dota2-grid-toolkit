import { rich } from '../catalog/Common.jsx';
import { t } from '../../scripts/i18n.mjs';

// The menu background by hand: where its file goes. Dota reads mods only from the folder of its audio
// language, so the file goes to game/dota_russian and the audio language must be Russian; an English
// Dota keeps its English interface. `target`: background-pack.js folderOf(recipe.folder). Shared by the
// builder's «Как установить» and «Студия» (a background downloaded as a file).
export function BackgroundSteps({ target, children = null }) {
  const english = target.client === 'english';
  const voice = english ? t('Интерфейс останется английским, а герои без русского пакета озвучки — с английскими голосами.') : '';
  const code = { game: <code>game</code>, folder: <code>{target.folder}</code>, file: <code>{target.file}</code> };
  return <><ol>
    <li>{rich(t('В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Обзор». Откроется папка {folder}.'), { folder: <code>dota 2 beta</code> })}</li>
    <li>{english ? rich(t('Зайди в {game} и создай там папку {folder}, если её нет. Папки для английского Dota не читает — моды берёт только из папки языка озвучки.'), code) : rich(t('Зайди в {game} → {folder}. Если такой папки нет, создай её.'), code)}</li>
    <li>{rich(t('Положи туда скачанный {file}.'), code)}{!english && <> {rich(t('{file} рядом — это сама озвучка, его не трогай.'), { file: <code>pak01_dir.vpk</code> })}</>}</li>
    <li>{english ? t('В настройках Dota поставь русский язык озвучки.') : t('Если озвучка в игре не русская, поставь в настройках Dota русский язык озвучки.')} {voice} {t('Если в параметрах запуска Dota есть -language (кроме -language russian), убери его.')}</li>
    <li>{t('Перезапусти Dota 2.')}</li>
  </ol><p className="catalog-muted">{rich(t('Убрать фон: удали {file}.'), code)} {children}</p></>;
}
