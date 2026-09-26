import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// The shell may mount or replace a host in the same React commit (including
// Fast Refresh). Resolve it after that commit, never during the parent's render.
export function StudioPortal({ targetId, children }) {
  const [target, setTarget] = useState(null);
  useLayoutEffect(() => {
    const next = document.getElementById(targetId);
    if (next !== target) setTarget(next);
  });
  return target?.isConnected ? createPortal(children, target) : null;
}
