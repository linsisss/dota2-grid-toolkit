import EditorTour from './EditorTour.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StudioLayout } from './StudioLayout.jsx';
import { StudioControls } from './StudioControls.jsx';
import { createStudio } from '../scripts/app.mjs';
import { interfaceFontsReady, gameFontsReady } from './typography.js';
import { openWorkspaceRegistry, openWorkspace, registerActiveWorkspace, rememberWorkspace, enterWorkspace } from '../scripts/workspaces.mjs';
import Workspaces from './Workspaces.jsx';
import { AccountProvider, useAccount } from './catalog/Account.jsx';
import { catalogAPI } from './catalog/api.js';
import './catalog/catalog.css';
import './workspaces.css';
import C from '../scripts/core.mjs';
import { useAppMotion } from './useAppMotion.js';
import { beforeLanguage, lang as currentLanguage, t, translateMessage } from '../scripts/i18n.mjs';
import { useLanguage } from './useLanguage.js';

// Dota's Korean fallback (1.2 MB) is no longer requested here: dota-rendering asks for it the
// first time a line with Hangul is measured and announces `gridstudio:fonts` when it has loaded.
const editorFontsReady = gameFontsReady;

// useLanguage: RU / EN redraws the Studio in place; the editor is made again in the other language.
export default function App() { useAppMotion(); useLanguage(); return <AccountProvider><WorkspaceApp/></AccountProvider>; }
function WorkspaceApp() {
  useLanguage();
  const [registry, setRegistry] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState('');
  const [resumed, setResumed] = useState(false);
  const entry = useRef(null);
  const auth = useAccount();
  useEffect(() => { let active = true; openWorkspaceRegistry().then(value => { if (active) setRegistry(value); else value.database?.close(); }).catch(e => setError(translateMessage(e.message))); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!registry || auth.loading || resumed) return;
    let active = true;
    if (!entry.current) {
      const isNew = new URLSearchParams(location.search).get('new') === '1';
      entry.current = enterWorkspace(registry, auth.user).then(meta => {
        if (isNew && auth.user) auth.syncFiles();
        return meta;
      });
    }
    entry.current.then(meta => { if (active) setSelected(meta); })
      .catch(error => { if (active) setError(translateMessage(error.message) || t('Не удалось открыть файл.')); })
      .finally(() => { if (active) setResumed(true); });
    return () => { active = false; };
  }, [registry, auth.loading, auth.user?.id, resumed]);
  function open(meta) { rememberWorkspace({ id: meta.id, configIndex: meta.openConfigIndex }); setSelected(meta); }
  function back() { rememberWorkspace(null); setSelected(null); }
  if (error) return <div className="workspace-loading" role="alert"><p>{error}</p><button className="catalog-button" onClick={() => location.reload()}>{t('Попробовать снова')}</button></div>;
  if (!registry || !resumed) return <div className="workspace-loading" role="status">{t('Открываем файлы…')}</div>;
  return selected ? <StudioFile key={selected.id} meta={selected} registry={registry} user={auth.user} onBack={back}/> : <Workspaces registry={registry} onOpen={open}/>;
}
function StudioFile({ meta, registry, user, onBack }) {
  const lang = useLanguage();
  // { instance, lang, view }: the editor and the language it was made in. Much of its interface is
  // built once, so RU / EN makes it again over the same open file (no reading, no network): the
  // beforeLanguage hook saves and keeps the document and the view, then `reopen` (a layout effect on
  // `lang`) makes the new one in the fresh StudioLayout before the browser paints.
  const [editor, setEditor] = useState(null);
  const studio = editor?.lang === lang ? editor.instance : null;
  const reopen = useRef(null);
  const [loadingError, setLoadingError] = useState('');
  const [syncStatus, setSyncStatus] = useState(meta.account ? 'Файл в аккаунте' : 'Файл на устройстве');
  useEffect(() => { studio?.setSyncStatus(syncStatus); }, [studio, syncStatus]);
  // Read both storage copies before mounting an editable document.
  useLayoutEffect(() => {
    let instance, unregister, unsubscribe, refreshFonts, stopLanguage, kept = null;
    let active = true;
    (async () => {
      const { storage, initial } = await openWorkspace(meta, registry, catalogAPI, user, text => { if (active) setSyncStatus(text); });
      if (!active) { storage.database?.close(); return; }
      if (initial.doc && Number.isInteger(meta.openConfigIndex) && meta.openConfigIndex >= 0 && meta.openConfigIndex < initial.doc.source.configs.length && meta.openConfigIndex !== initial.doc.configIndex)
        initial.doc = C.switchConfig(initial.doc, meta.openConfigIndex);
      let lastIndex;
      const rememberLocation = () => {
        const configIndex = instance.getSnapshot().configIndex;
        if (configIndex !== lastIndex) {
          rememberWorkspace({ id: meta.id, configIndex });
          lastIndex = configIndex;
        }
      };
      const open = (start, view = null) => {
        unsubscribe?.();
        instance?.dispose();
        instance = createStudio(storage, start);
        if (view) instance.setView(view);
        rememberLocation();
        unsubscribe = instance.subscribe(rememberLocation);
        setEditor({ instance, lang: currentLanguage, view });
      };
      open(initial);
      stopLanguage = beforeLanguage(async () => {
        try { await instance.flush(); } finally {
          kept = { doc: instance.getDocument(), view: { ...instance.getView(), panel: document.body.classList.contains('show-library') ? 'library' : null } };
        }
      });
      reopen.current = () => { if (kept && active) { const { doc, view } = kept; kept = null; open({ doc, hasData: true, issue: '' }, view); } };
      unregister = registerActiveWorkspace(meta.id, { flush: () => instance.flush(), attach: user => storage.attachAccount(user) });
      const refresh = () => { if (active) instance.refresh(); };
      interfaceFontsReady.then(refresh);
      editorFontsReady.then(refresh);
      refreshFonts = refresh;
      addEventListener('gridstudio:fonts', refreshFonts);
    })().catch(() => { if (active) setLoadingError(t('Не удалось открыть редактор. Сохранённые данные не изменены. Обнови страницу.')); });
    return () => {
      active = false;
      reopen.current = null;
      if (refreshFonts) removeEventListener('gridstudio:fonts', refreshFonts);
      unsubscribe?.();
      stopLanguage?.();
      unregister?.();
      instance?.dispose();
    };
  }, []);
  useLayoutEffect(() => { reopen.current?.(); }, [lang]);
  // The kept view again once the controls are up: their first layout fits the canvas.
  useLayoutEffect(() => { if (editor?.view) editor.instance.setView(editor.view); }, [editor]);
  return (
    <>
      <StudioLayout key={lang} onBack={async () => { try { if (studio) await studio.flush(); onBack(); } catch (error) { setSyncStatus(error.message); } }} />
      {!editor && <div className="studio-loading" role="status">{loadingError || t('Открываем проект…')}{loadingError && <button onClick={onBack}>{t('Вернуться в студию')}</button>}</div>}
      {studio && <StudioControls editor={studio} panel={editor.view?.panel} />}
      {studio && <EditorTour/>}
    </>
  );
}
