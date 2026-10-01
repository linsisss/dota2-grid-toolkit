import C from './core.mjs';
import { t } from './i18n.mjs';

export async function readGridFiles(files) {
  const list = Array.from(files);
  if (list.length > C.MAX_CONFIGS) throw new Error(t('Выбери не больше 100 файлов.'));
  if (list.reduce((size, file) => size + file.size, 0) > 50 * 1024 * 1024)
    throw new Error(t('Общий размер файлов больше 50 МБ. Загрузи их несколькими партиями.'));
  const imported = [];
  for (const file of list) {
    if (file.size > 20 * 1024 * 1024)
      throw new Error(t('{name}: файл больше 20 МБ.', { name: file.name }));
    try {
      // Content defines the format, not the filename, extension or MIME type.
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      const doc = data?.app === 'dota-grid-studio' ? C.importProject(data) : C.importDota(data);
      if (data?.app !== 'dota-grid-studio') doc.fileName = file.name.slice(0, 255);
      imported.push({ name: file.name, doc });
    } catch (error) {
      throw new Error(`${file.name}: ${error instanceof SyntaxError ? t('не удалось прочитать JSON. Проверь содержимое файла.') : error.message}`);
    }
  }
  if (imported.reduce((n, file) => n + file.doc.source.configs.length, 0) > C.MAX_CONFIGS)
    throw new Error(t('В выбранных файлах больше 100 сеток. Загрузи меньше файлов.'));
  return imported;
}
