import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { lang, onLanguage } from '../scripts/i18n.mjs';

// The site's language for a component that should redraw when RU / EN is switched (the pages' top
// components use it, so the whole page redraws in place; scripts/i18n.mjs setLanguage). The redraw
// is synchronous, so the crossfade of LanguageSwitch.jsx captures the page already in the new language.
export function useLanguage() {
  const [current, setCurrent] = useState(lang);
  useEffect(() => onLanguage((next) => flushSync(() => setCurrent(next))), []);
  return current;
}
