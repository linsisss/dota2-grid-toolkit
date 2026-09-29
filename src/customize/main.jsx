import { createRoot } from 'react-dom/client';
import CustomizeApp from './CustomizeApp.jsx';
import '../../styles/site.css';
import '../../styles/game-fonts.css';
import '../catalog/catalog.css';
import './customize.css';
createRoot(document.getElementById('catalog-root')).render(<CustomizeApp/>);
