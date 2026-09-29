import { createRoot } from 'react-dom/client';
import CatalogApp from './CatalogApp.jsx';
import { applyGridBackground } from '../../scripts/grid-background.mjs';
import '../../styles/site.css';
import '../../styles/game-fonts.css';
import './catalog.css';
applyGridBackground();
createRoot(document.getElementById('catalog-root')).render(<CatalogApp/>);
