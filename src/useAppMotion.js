import { useEffect } from 'react';
import { mountDisclosureMotion } from '../scripts/disclosure-motion.mjs';
import '../styles/motion.css';
import '../styles/smooth.css';

export function useAppMotion() {
  useEffect(() => mountDisclosureMotion(document), []);
}
