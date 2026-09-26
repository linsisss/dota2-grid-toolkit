import { useLayoutEffect, useState } from 'react';
import { StudioLayout } from './StudioLayout.jsx';
import { StudioControls } from './StudioControls.jsx';
import { createStudio } from '../scripts/app.mjs';
import { interfaceFontsReady, gameFontsReady } from './typography.js';

export default function App() {
  const [editor, setEditor] = useState(null);
  // Imperative canvas setup runs only after StudioLayout commits its DOM hosts.
  useLayoutEffect(() => {
    const instance = createStudio();
    let active = true;
    setEditor(instance);
    const refresh = () => {
      if (active) instance.refresh();
    };
    interfaceFontsReady.then(refresh);
    gameFontsReady.then(refresh);
    return () => {
      active = false;
      instance.dispose();
    };
  }, []);
  return (
    <>
      <StudioLayout />
      {editor && <StudioControls editor={editor} />}
    </>
  );
}
