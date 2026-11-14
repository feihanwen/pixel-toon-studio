import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
createRoot(document.getElementById('root')!).render(<App />);
if (import.meta.env.PROD && !window.pixelToonDesktop && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* Normal online editing remains available. */ }); });
}
