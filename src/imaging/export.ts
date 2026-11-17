import { EXPORT_TILE, PREVIEW_SIDE } from '../config/limits';
import { exportHalo } from './exportHalo';
import { decode } from './decode';
import { composeFrame, type FrameContent } from './frame';
import { WorkerClient } from './workerClient';
import { FaceSegClient } from '../mosaic/FaceSegClient';
import { PencilSketchClient } from '../pencil/PencilSketchClient';
import type { RenderPencilSketch } from '../types/worker';
import type { PhotoTab } from '../types/document';
import { snapshot } from '../types/document';
import { STYLES } from '../config/styles';
import { autoColorPlan, exportBase } from '../enhancement/images';

export interface ExportTile {
    x: number;
    y: number;
    cw: number;
    ch: number;
    sx: number;
    sy: number;
    tw: number;
    th: number;
}

export function buildExportTiles(width: number, height: number, halo: number, tileSize = EXPORT_TILE): ExportTile[] {
    const tiles: ExportTile[] = [];
    for (let y = 0; y < height; y += tileSize) {
        for (let x = 0; x < width; x += tileSize) {
            const cw = Math.min(tileSize, width - x);
            const ch = Math.min(tileSize, height - y);
            const sx = Math.max(0, x - halo);
            const sy = Math.max(0, y - halo);
            const ex = Math.min(width, x + cw + halo);
            const ey = Math.min(height, y + ch + halo);
            tiles.push({
                x,
                y,
                cw,
                ch,
                sx,
                sy,
                tw: ex - sx,
                th: ey - sy,
            });
        }
    }
    return tiles;
}

export function resolveExportConcurrency(tileCount: number, hardwareConcurrency?: number): number {
    if (tileCount <= 1) return 1;
    const cores = Number.isFinite(hardwareConcurrency) && (hardwareConcurrency as number) > 0 ? (hardwareConcurrency as number) : 4;
    const target = Math.max(2, Math.floor(cores / 2));
    return Math.max(1, Math.min(tileCount, 4, target));
}

export async function runParallelPool<T>(
    items: readonly T[],
    concurrency: number,
    workerFn: (item: T, slotIndex: number) => Promise<void>,
): Promise<void> {
    if (!items.length) return;
    const poolSize = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));
    let nextIndex = 0;
    let aborted = false;

    const runners = Array.from({ length: poolSize }, async (_, slotIndex) => {
        while (!aborted) {
            const currentIndex = nextIndex++;
            if (currentIndex >= items.length) break;
            try {
                await workerFn(items[currentIndex], slotIndex);
            } catch (error) {
                aborted = true;
                throw error;
            }
        }
    });

    await Promise.all(runners);
}

export async function exportPng(
    tab: PhotoTab,
    content: FrameContent,
    onProgress: (done: number, total: number) => void,
    precomputedMosaicMask?: { width: number; height: number; maskBuffer: ArrayBuffer } | null,
    precomputedPencilSketch?: RenderPencilSketch | null,
) {
    const s = snapshot(tab);
    const colorPlan = await autoColorPlan(tab, s);
    const base = await exportBase(tab, s);
    const bitmap = await decode(base.blob);
    const w = bitmap.width;
    const h = bitmap.height;
    const scale = Math.max(1, Math.max(w, h) / PREVIEW_SIDE);
    const activeMosaic = s.mosaic && s.mosaic.strength > 0 && s.mosaic.strokes.length > 0 ? s.mosaic : null;
    const halo = exportHalo(s.styleId, s.params[s.styleId], scale, w, h, activeMosaic ? activeMosaic.strength : 0);

    let exportMosaicMask = precomputedMosaicMask ?? null;
    if (activeMosaic && !exportMosaicMask) {
        const longSide = Math.max(w, h);
        const fitScale = longSide > PREVIEW_SIDE ? PREVIEW_SIDE / longSide : 1;
        const mw = Math.max(1, Math.round(w * fitScale));
        const mh = Math.max(1, Math.round(h * fitScale));
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = mw;
        maskCanvas.height = mh;
        const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
        if (maskCtx) {
            maskCtx.drawImage(bitmap, 0, 0, mw, mh);
            const imgData = maskCtx.getImageData(0, 0, mw, mh);
            const faceClient = new FaceSegClient();
            try {
                const res = await faceClient.computeMask(mw, mh, imgData.data, activeMosaic.strokes, activeMosaic.aiFaceFit);
                exportMosaicMask = { width: res.width, height: res.height, maskBuffer: res.maskBuffer };
            } catch {
                // Fall back to stroke-based mask in render worker
            } finally {
                faceClient.dispose();
            }
        }
    }

    let exportPencilSketch = s.styleId === 'pencil' ? (precomputedPencilSketch ?? null) : null;
    if (s.styleId === 'pencil' && !exportPencilSketch) {
        const longSide = Math.max(w, h);
        const fitScale = longSide > 640 ? 640 / longSide : 1;
        const sw = Math.max(8, Math.round((w * fitScale) / 8) * 8);
        const sh = Math.max(8, Math.round((h * fitScale) / 8) * 8);
        const sketchCanvas = document.createElement('canvas');
        sketchCanvas.width = sw;
        sketchCanvas.height = sh;
        const sketchCtx = sketchCanvas.getContext('2d', { willReadFrequently: true });
        if (sketchCtx) {
            sketchCtx.drawImage(bitmap, 0, 0, sw, sh);
            const imgData = sketchCtx.getImageData(0, 0, sw, sh);
            const sketchClient = new PencilSketchClient();
            try {
                const res = await sketchClient.computeSketch(sw, sh, imgData.data);
                exportPencilSketch = { width: res.width, height: res.height, sketchBuffer: res.sketchBuffer };
            } catch {
                // Fall back to classical contour extraction in render worker
            } finally {
                sketchClient.dispose();
            }
        }
    }

    const result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    const resultCtx = result.getContext('2d');
    if (!resultCtx) {
        bitmap.close();
        throw new Error('无法创建导出画布');
    }

    const tiles = buildExportTiles(w, h, halo, EXPORT_TILE);
    const total = tiles.length;
    const poolSize = resolveExportConcurrency(
        total,
        typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
    );

    const slots: Array<{
        client: WorkerClient;
        canvas: HTMLCanvasElement;
        ctx: CanvasRenderingContext2D;
    }> = [];

    let done = 0;
    try {
        for (let i = 0; i < poolSize; i++) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                throw new Error('无法创建分块画布');
            }
            slots.push({ client: new WorkerClient(), canvas, ctx });
        }

        await runParallelPool(tiles, poolSize, async (t, slotIndex) => {
            const slot = slots[slotIndex];
            slot.canvas.width = t.tw;
            slot.canvas.height = t.th;
            slot.ctx.fillStyle = '#fff';
            slot.ctx.fillRect(0, 0, t.tw, t.th);
            slot.ctx.drawImage(bitmap, t.sx, t.sy, t.tw, t.th, 0, 0, t.tw, t.th);
            const pixels = slot.ctx.getImageData(0, 0, t.tw, t.th);

            const response = await slot.client.render({
                tabId: tab.id,
                revision: 0,
                mode: 'export',
                width: t.tw,
                height: t.th,
                originX: t.sx,
                originY: t.sy,
                fullWidth: w,
                fullHeight: h,
                scale,
                styleId: s.styleId,
                params: s.params[s.styleId],
                global: s.global,
                autoColor: colorPlan,
                mosaic: activeMosaic
                    ? {
                          strength: activeMosaic.strength,
                          maskWidth: exportMosaicMask?.width ?? 0,
                          maskHeight: exportMosaicMask?.height ?? 0,
                          maskBuffer: exportMosaicMask ? exportMosaicMask.maskBuffer.slice(0) : undefined,
                          strokes: exportMosaicMask ? undefined : activeMosaic.strokes,
                      }
                    : undefined,
                pencilSketch: exportPencilSketch
                    ? {
                          width: exportPencilSketch.width,
                          height: exportPencilSketch.height,
                          sketchBuffer: exportPencilSketch.sketchBuffer.slice(0),
                      }
                    : undefined,
                buffer: pixels.data.buffer,
            });
            if (response.kind === 'error') {
                throw new Error(response.message);
            }

            slot.ctx.putImageData(new ImageData(new Uint8ClampedArray(response.buffer), t.tw, t.th), 0, 0);
            resultCtx.drawImage(slot.canvas, t.x - t.sx, t.y - t.sy, t.cw, t.ch, t.x, t.y, t.cw, t.ch);
            done++;
            onProgress(done, total);
        });

        const output = composeFrame(result, w, h, s.frameEnabled, content);
        return await new Promise<Blob>((resolve, reject) =>
            output.toBlob(
                blob => (blob ? resolve(blob) : reject(new Error('PNG 编码失败，可能是浏览器内存不足'))),
                'image/png',
            ),
        );
    } finally {
        bitmap.close();
        for (const slot of slots) {
            slot.client.dispose();
        }
    }
}

export function exportFilename(name: string, styleId: keyof typeof STYLES, enhanced = false) {
    const base =
        name
            .replace(/\.[^.]+$/, '')
            .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
            .slice(0, 100) || 'image';
    return `${base}${enhanced ? '-enhanced' : ''}-pixel-toon-${STYLES[styleId].short}.png`;
}

export async function download(blob: Blob, name: string): Promise<boolean> {
    if (window.pixelToonDesktop) {
        return window.pixelToonDesktop.savePng(new Uint8Array(await blob.arrayBuffer()), name);
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
}
