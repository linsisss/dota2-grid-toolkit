import { useId } from 'react';
import { badgeMarkInner } from '../../scripts/badge-marks.mjs';
import './badges.css';

// One profile badge's medal (scripts/badge-marks.mjs). Its gradients get ids of their own, so many on a page
// never clash. Decorative: the name goes next to it or in the parent's label.
export function BadgeMark({ badge, size = 24 }) {
  const uid = `bm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return <svg className="badge-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{ __html: badgeMarkInner(badge, uid) }}/>;
}
