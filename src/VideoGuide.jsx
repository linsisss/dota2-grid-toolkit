import { useEffect, useRef } from 'react';
import { INSTALL_GUIDE, mountVideoGuide } from './video-guide.js';
import { useLanguage } from './useLanguage.js';

// The video guide's player in a React page (src/video-guide.js builds it). RU / EN mounts it again
// in the other language; it goes on from where it was.
export default function VideoGuide({ guide = INSTALL_GUIDE }) {
  const host = useRef(null), lang = useLanguage();
  useEffect(() => mountVideoGuide(host.current, guide), [guide, lang]);
  return <div className="video-guide" ref={host}/>;
}
