import { EXPORT_TILE, PREVIEW_SIDE } from '../config/limits';
import { exportHalo } from './exportHalo';
import { decode } from './decode';
import { composeFrame, type FrameContent } from './frame';
import { WorkerClient } from './workerClient';
import type { PhotoTab } from '../types/document';
import { snapshot } from '../types/document';
import { STYLES } from '../config/styles';
import { autoColorPlan, exportBase } from '../enhancement/images';
export async function exportPng(tab: PhotoTab, content: FrameContent, onProgress: (done: number, total: number) => void) { const s = snapshot(tab), colorPlan = await autoColorPlan(tab, s), base = await exportBase(tab, s), bitmap = await decode(base.blob), worker = new WorkerClient(), w = bitmap.width, h = bitmap.height, scale = Math.max(1, Math.max(w, h) / PREVIEW_SIDE), halo = exportHalo(s.styleId, s.params[s.styleId], scale, w, h), result = document.createElement('canvas'); result.width = w; result.height = h; const resultCtx = result.getContext('2d'); if (!resultCtx) {
    bitmap.close();
    worker.dispose();
    throw new Error('无法创建导出画布');
} const tile = document.createElement('canvas'), tileCtx = tile.getContext('2d', { willReadFrequently: true }); if (!tileCtx) {
    bitmap.close();
    worker.dispose();
    throw new Error('无法创建分块画布');
} const total = Math.ceil(w / EXPORT_TILE) * Math.ceil(h / EXPORT_TILE); let done = 0; try {
    for (let y = 0; y < h; y += EXPORT_TILE)
        for (let x = 0; x < w; x += EXPORT_TILE) {
            const cw = Math.min(EXPORT_TILE, w - x), ch = Math.min(EXPORT_TILE, h - y), sx = Math.max(0, x - halo), sy = Math.max(0, y - halo), ex = Math.min(w, x + cw + halo), ey = Math.min(h, y + ch + halo), tw = ex - sx, th = ey - sy;
            tile.width = tw;
            tile.height = th;
            tileCtx.fillStyle = '#fff';
            tileCtx.fillRect(0, 0, tw, th);
            tileCtx.drawImage(bitmap, sx, sy, tw, th, 0, 0, tw, th);
            const pixels = tileCtx.getImageData(0, 0, tw, th);
            const response = await worker.render({ tabId: tab.id, revision: 0, mode: 'export', width: tw, height: th, originX: sx, originY: sy, fullWidth: w, fullHeight: h, scale, styleId: s.styleId, params: s.params[s.styleId], global: s.global, autoColor: colorPlan, buffer: pixels.data.buffer });
            if (response.kind === 'error')
                throw new Error(response.message);
            tileCtx.putImageData(new ImageData(new Uint8ClampedArray(response.buffer), tw, th), 0, 0);
            resultCtx.drawImage(tile, x - sx, y - sy, cw, ch, x, y, cw, ch);
            done++;
            onProgress(done, total);
        }
    const output = composeFrame(result, w, h, s.frameEnabled, content);
    return await new Promise<Blob>((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败，可能是浏览器内存不足')), 'image/png'));
}
finally {
    bitmap.close();
    worker.dispose();
} }
export function exportFilename(name: string, styleId: keyof typeof STYLES, enhanced = false) { const base = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100) || 'image'; return `${base}${enhanced ? '-enhanced' : ''}-pixel-toon-${STYLES[styleId].short}.png`; }
export async function download(blob: Blob, name: string): Promise<boolean> {
    if (window.pixelToonDesktop) return window.pixelToonDesktop.savePng(new Uint8Array(await blob.arrayBuffer()), name);
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
}
