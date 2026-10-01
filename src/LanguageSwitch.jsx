import { setLanguage } from '../scripts/i18n.mjs';
import { useLanguage } from './useLanguage.js';
import './language-switch.css';

// The page changes language under a short crossfade: View Transitions blend the old page into the new
// one, and what did not change stays still; without them, a quick dip of the page's opacity. None
// with reduced motion.
function crossfade(apply) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  const root = document.documentElement;
  if (document.startViewTransition) {
    root.classList.add('language-switching');
    const transition = document.startViewTransition(apply);
    transition.finished.finally(() => root.classList.remove('language-switching'));
    return transition.updateCallbackDone;
  }
  const page = document.body;
  return page.animate([{ opacity: 1 }, { opacity: 0.35 }], { duration: 120, easing: 'ease-in' }).finished.then(() => {
    apply();
    page.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  });
}

// RU / EN in the footers and the editor: the choice is remembered and the page redraws in place,
// without reloading (scripts/i18n.mjs setLanguage); the marker slides to the chosen one.
export default function LanguageSwitch({ className = '' }) {
  const lang = useLanguage();
  return <span className={`language-switch ${className}`} data-lang={lang} role="group" aria-label="Language · Язык">
    {[['ru', 'RU', 'Русский'], ['en', 'EN', 'English']].map(([value, short, name]) =>
      <button key={value} type="button" lang={value} aria-pressed={lang === value} title={name} onClick={() => setLanguage(value, crossfade)}>{short}</button>)}
  </span>;
}
