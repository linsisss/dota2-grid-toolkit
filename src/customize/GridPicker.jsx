import { useEffect, useMemo, useState } from 'react';
import { Icon, Modal } from '../catalog/Common.jsx';
import GridPreview from '../catalog/GridPreview.jsx';
import { catalogAPI } from '../catalog/api.js';
import { openWorkspaceRegistry, cloudWorkspaceId } from '../../scripts/workspaces.mjs';
import { freshThumbnails, makeThumbnails, readThumbnails } from '../../scripts/workspace-thumbnails.mjs';
import { readWorkspacePreview, workspaceGridPreview } from '../../scripts/workspace-preview.mjs';
import { t } from '../../scripts/i18n.mjs';

// The hero grid shown over the background on the builder's «Сетка героев» tab, so one can see
// whether the background swallows it: any grid of the user's «Студия» files (each file can hold
// several), or one of the workshop's popular grids, or none. Picked in a window of pictures (the
// Studio's own thumbnails, the workshop's previews); the choice is remembered in this browser.
const CHOICE = 'gridstudio.background.previewGrid';
const readChoice = () => { try { return JSON.parse(localStorage.getItem(CHOICE)) || null; } catch { return null; } };
const writeChoice = (value) => { try { localStorage.setItem(CHOICE, JSON.stringify(value)); } catch { /* Forgotten after a reload; harmless. */ } };

// The Studio's grid files in this browser, newest first, without the archived ones.
async function studioFiles() {
  try { return (await (await openWorkspaceRegistry()).list()).filter((item) => !item.archived); } catch { return []; }
}
const gridNames = (item) => item.gridNames?.length ? item.gridNames : Array.from({ length: item.grids || 1 }, (_, i) => i === 0 && item.preview?.configs?.[0]?.config_name || t('Сетка {number}', { number: i + 1 }));
const popular = () => catalogAPI('/works?sort=popular&page=0').then((value) => value.items).catch(() => []);

// The grid of a choice, as a hero_grid_config with one config.
async function loadGrid(choice) {
  if (choice?.kind === 'studio') {
    const item = (await studioFiles()).find((file) => file.id === choice.id);
    if (!item) return null;
    const { document } = await readWorkspacePreview(item, catalogAPI);
    return workspaceGridPreview(document, Math.min(choice.index, document.source.configs.length - 1));
  }
  if (choice?.kind === 'workshop') return catalogAPI(`/works/${choice.id}/grid?revision=${choice.revision}`);
  return null;
}

// The choice (remembered, else the newest Studio grid, else the most popular workshop grid), its
// grid and name, and a way to change it. Nothing is read until the tab is first opened (`active`).
export function usePreviewGrid(active = true) {
  const [choice, setChoice] = useState(readChoice), [grid, setGrid] = useState(null), [opened, setOpened] = useState(active);
  useEffect(() => { if (active) setOpened(true); }, [active]);
  useEffect(() => {
    if (choice || !opened) return;
    let active = true;
    (async () => {
      const [item] = await studioFiles();
      if (item) return { kind: 'studio', id: item.id, index: item.configIndex ?? 0, name: gridNames(item)[item.configIndex ?? 0] || item.name };
      const [work] = await popular();
      return work ? { kind: 'workshop', id: work.id, revision: work.revision, name: work.title } : { kind: 'none' };
    })().then((value) => { if (active) setChoice(value); });
    return () => { active = false; };
  }, [choice, opened]);
  useEffect(() => {
    if (!opened) return;
    let active = true; setGrid(null);
    loadGrid(choice).then((value) => { if (active) setGrid(value); }).catch(() => {});
    return () => { active = false; };
  }, [opened, choice?.kind, choice?.id, choice?.index, choice?.revision]);
  const choose = (value) => { writeChoice(value); setChoice(value); };
  return { choice, grid, name: choice?.kind === 'none' ? '' : choice?.name || '', choose };
}

// One Studio file's grids: the Studio's pictures, made here when they are missing or old (or the
// account's, drawn by the server, for a file whose newest copy is on another device).
function StudioGrids({ item, chosen, onChoose }) {
  const [record, setRecord] = useState(null);
  const remote = !!item.account && !item.dirty && !!item.remoteRevision && item.remoteRevision !== item.cloudRevision;
  useEffect(() => {
    if (remote) return;
    let active = true;
    readThumbnails(item.id).then((value) => {
      if (active && value) setRecord(value);
      if (!freshThumbnails(value, item)) makeThumbnails(item).then((made) => { if (active && made) setRecord(made); });
    });
    return () => { active = false; };
  }, [item.id, item.updated, remote]);
  const urls = useMemo(() => record?.grids.map((grid) => (grid.image ? URL.createObjectURL(grid.image) : '')) || [], [record]);
  useEffect(() => () => urls.forEach((url) => url && URL.revokeObjectURL(url)), [urls]);
  return gridNames(item).map((name, index) => {
    const url = remote ? `/api/catalog/spaces/${cloudWorkspaceId(item)}/thumbnail.webp?grid=${index}&revision=${item.remoteRevision}` : urls[index];
    const on = chosen?.kind === 'studio' && chosen.id === item.id && chosen.index === index;
    return <button key={index} type="button" className={`grid-pick${on ? ' is-chosen' : ''}`} aria-pressed={on} onClick={() => onChoose({ kind: 'studio', id: item.id, index, name })}>
      <span className="grid-pick-picture">{url ? <img src={url} alt=""/> : <i/>}</span>
      <span className="grid-pick-name"><b>{name}</b><small>{item.name}</small></span>
    </button>;
  });
}

export function GridPicker({ chosen, onChoose, onClose }) {
  const [files, setFiles] = useState(null), [works, setWorks] = useState(null);
  useEffect(() => { studioFiles().then(setFiles); popular().then(setWorks); }, []);
  const pick = (value) => { onChoose(value); onClose(); };
  return <Modal title={t('Какую сетку показать')} onClose={onClose} size="lg"><div className="grid-picker">
    <p className="catalog-muted">{t('Сетка ляжет поверх фона, как в Dota на странице «Герои», — так видно, не сливается ли она с фоном. В файл фона она не попадает.')}</p>
    <h3>{t('Мои сетки')}</h3>
    {files === null ? <p className="catalog-muted">{t('Загружаем…')}</p> : files.length ? <div className="grid-pick-list">{files.map((item) => <StudioGrids key={item.id} item={item} chosen={chosen} onChoose={pick}/>)}</div>
      : <p className="catalog-muted">{t('В «Студии» этого браузера пока нет сеток.')}</p>}
    <h3>{t('Популярные в мастерской')}</h3>
    {works === null ? <p className="catalog-muted">{t('Загружаем…')}</p> : <div className="grid-pick-list">{works.map((work) => {
      const on = chosen?.kind === 'workshop' && chosen.id === work.id;
      return <button key={work.id} type="button" className={`grid-pick${on ? ' is-chosen' : ''}`} aria-pressed={on} onClick={() => pick({ kind: 'workshop', id: work.id, revision: work.revision, name: work.title })}>
        <span className="grid-pick-picture"><GridPreview id={work.id} revision={work.revision} title={work.title}/></span>
        <span className="grid-pick-name"><b>{work.title}</b><small>{work.author || t('мастерская')}</small></span>
      </button>;
    })}</div>}
    <button type="button" className="catalog-link grid-pick-none" onClick={() => pick({ kind: 'none' })}><Icon name="close"/>{t('Без сетки')}</button>
  </div></Modal>;
}

// The setting in the panel: the chosen grid's picture and name; a click opens the picker.
export function GridChoice({ preview, onOpen }) {
  const { choice, name } = preview;
  return <button type="button" className="grid-choice" onClick={onOpen}>
    <span className="grid-choice-name"><b>{choice?.kind === 'none' ? t('Без сетки') : name || t('Загружаем…')}</b><small>{choice?.kind === 'workshop' ? t('из мастерской') : choice?.kind === 'studio' ? t('из «Студии»') : ''}</small></span>
    <span className="grid-choice-change">{t('Выбрать')}<Icon name="arrow"/></span>
  </button>;
}
