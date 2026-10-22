import { createContext } from 'react';

// What «Портреты героев» (HeroPortraits.jsx) gives the scenes of the preview (DotaGridPage.jsx), so
// MenuScreen needs no new props: { cards: Map(hero id → canvas of the card, 142 × 188), hover: the hero
// whose hover card is shown ({ hero, name, kind, url, width, height, crop, start }) or null, key: a
// string that changes when a picture does }.
export const PortraitPreview = createContext(null);
