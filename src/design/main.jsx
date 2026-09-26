import { createRoot } from 'react-dom/client';
import DesignGallery from './DesignGallery.jsx';
import '../../styles/game-fonts.css';
import './design.css';

createRoot(document.getElementById('design-root')).render(<DesignGallery />);
