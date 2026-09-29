import { ICONS } from '../scripts/icons.mjs';

// Every icon on the site: Lucide shapes from scripts/icons.mjs (see scripts/make-icons.mjs). The
// markup is our own generated constant, so setting it as HTML is safe.
export function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props} dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.rect }}/>;
}
