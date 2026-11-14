import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const assets = readdirSync('dist/assets');
// Precache the editor and HEIC decoder for first-time offline imports.
// AI Worker/runtime/weights stay on-demand.
const initial = assets.filter(file => file.startsWith('index-') || file.startsWith('image.worker-') || file.startsWith('heic-to-'));
const hash = (await import('node:crypto')).createHash('sha256').update(readFileSync('dist/index.html')).digest('hex').slice(0, 12);
const sw = readFileSync('dist/sw.js', 'utf8').replace("'pixel-toon-app-v5'", `'pixel-toon-app-v5-${hash}'`);
writeFileSync('dist/sw.js', sw);
writeFileSync('dist/offline-manifest.json', JSON.stringify(['./', 'index.html', ...initial.map(file => `assets/${file}`)]));
console.log(`Offline app shell: ${initial.length} assets; AI assets remain on-demand`);
