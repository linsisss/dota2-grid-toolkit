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

// Dota's Korean fallback (1.2 MB) is no longer requested here: dota-rendering asks for it the
// first time a line with Hangul is measured and announces `gridstudio:fonts` when it has loaded.
const editorFontsReady = gameFontsReady;

export default function App() { useAppMotion(); return <AccountProvider><WorkspaceApp/></AccountProvider>; }
function WorkspaceApp() {
  const [registry, setRegistry] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState('');
  const [resumed, setResumed] = useState(false);
  const entry = useRef(null);
  const auth = useAccount();
  useEffect(() => { let active = true; openWorkspaceRegistry().then(value => { if (active) setRegistry(value); else value.database?.close(); }).catch(e => setError(e.message)); return () => { active = false; }; }, []);
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
      .catch(error => { if (active) setError(error.message || 'Не удалось открыть файл.'); })
      .finally(() => { if (active) setResumed(true); });
    return () => { active = false; };
  }, [registry, auth.loading, auth.user?.id, resumed]);
  function open(meta) { rememberWorkspace({ id: meta.id, configIndex: meta.openConfigIndex }); setSelected(meta); }
  function back() { rememberWorkspace(null); setSelected(null); }
  if (error) return <div className="workspace-loading" role="alert"><p>{error}</p><button className="catalog-button" onClick={() => location.reload()}>Повторить</button></div>;
  if (!registry || !resumed) return <div className="workspace-loading" role="status">Открываем файлы…</div>;
  return selected ? <StudioFile key={selected.id} meta={selected} registry={registry} user={auth.user} onBack={back}/> : <Workspaces registry={registry} onOpen={open}/>;
}
function StudioFile({ meta, registry, user, onBack }) {
  const [editor, setEditor] = useState(null);
  const [loadingError, setLoadingError] = useState('');
  const [syncStatus, setSyncStatus] = useState(meta.account ? 'Файл в аккаунте' : 'Файл на устройстве');
  useEffect(() => { editor?.setSyncStatus(syncStatus); }, [editor, syncStatus]);
  // Read both storage copies before mounting an editable document.
  useLayoutEffect(() => {
    let instance, unregister, unsubscribe, refreshFonts;
    let active = true;
    (async () => {
      const { storage, initial } = await openWorkspace(meta, registry, catalogAPI, user, text => { if (active) setSyncStatus(text); });
      if (!active) { storage.database?.close(); return; }
      if (initial.doc && Number.isInteger(meta.openConfigIndex) && meta.openConfigIndex >= 0 && meta.openConfigIndex < initial.doc.source.configs.length && meta.openConfigIndex !== initial.doc.configIndex)
        initial.doc = C.switchConfig(initial.doc, meta.openConfigIndex);
      instance = createStudio(storage, initial);
      let lastIndex;
      const rememberLocation = () => {
        const configIndex = instance.getSnapshot().configIndex;
        if (configIndex !== lastIndex) {
          rememberWorkspace({ id: meta.id, configIndex });
          lastIndex = configIndex;
        }
      };
      rememberLocation();
      unsubscribe = instance.subscribe(rememberLocation);
      unregister = registerActiveWorkspace(meta.id, { flush: () => instance.flush(), attach: user => storage.attachAccount(user) });
      setEditor(instance);
      const refresh = () => { if (active) instance.refresh(); };
      interfaceFontsReady.then(refresh);
      editorFontsReady.then(refresh);
      refreshFonts = refresh;
      addEventListener('gridstudio:fonts', refreshFonts);
    })().catch(() => { if (active) setLoadingError('Не удалось открыть редактор. Сохранённые данные не изменены. Обнови страницу.'); });
    return () => {
      active = false;
      if (refreshFonts) removeEventListener('gridstudio:fonts', refreshFonts);
      unsubscribe?.();
      unregister?.();
      instance?.dispose();
    };
  }, []);
  return (
    <>
      <StudioLayout onBack={async () => { try { if (editor) await editor.flush(); onBack(); } catch (error) { setSyncStatus(error.message); } }} />
      {!editor && <div className="studio-loading" role="status">{loadingError || 'Открываем проект…'}{loadingError && <button onClick={onBack}>Вернуться в студию</button>}</div>}
      {editor && <StudioControls editor={editor} />}
      {editor && <EditorTour/>}
    </>
  );
}
