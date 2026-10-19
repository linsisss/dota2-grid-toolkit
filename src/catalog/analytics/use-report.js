import { useEffect, useState } from 'react';
import { catalogAPI } from '../api.js';

// A report of «Аналитика»: while a new one loads, the last one stays (dimmed by the tab).
export function useReport(path, denied) {
  const [state, setState] = useState({ data: null, error: '', busy: true });
  useEffect(() => {
    let alive = true;
    setState((now) => ({ ...now, busy: true }));
    catalogAPI(path).then((data) => { if (alive) setState({ data, error: '', busy: false }); },
      (problem) => { if (alive) { denied?.(problem); setState((now) => ({ ...now, error: problem.message, busy: false })); } });
    return () => { alive = false; };
  }, [path]);
  return state;
}
