import { EXPORT_TILE, MOBILE_EXPORT_MAX_PIXELS, PREVIEW_SIDE } from '../config/limits';
import { currentMsg } from '../config/errors';
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

export type ExportFormat = 'png' | 'jpeg';
export type SaveMode = 'desktop' | 'picker' | 'download' | 'cancelled';
export type MobileShareOutcome = 'shared' | 'cancelled' | 'fallback';

export function isMobileBrowser(
    win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
    nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
    if (!win || !nav) return false;
    if ((win as Window & { pixelToonDesktop?: unknown }).pixelToonDesktop) return false;
    if (nav.webdriver) return false;
    const ua = nav.userAgent || '';
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
    const iPadDesktopUa = nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
    const coarse = typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
    return mobileUa || iPadDesktopUa || (coarse && (nav.maxTouchPoints ?? 0) > 0);
}

export function blobToShareFile(blob: Blob, filename: string, format: ExportFormat = 'png'): File {
    const mime = blob.type || (format === 'jpeg' ? 'image/jpeg' : 'image/png');
    return new File([blob], filename, { type: mime });
}

export function canNativeShareFiles(
    files: File[],
    nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
    if (!nav || files.length === 0) return false;
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
        return nav.canShare({ files });
    } catch {
        return false;
    }
}

/**
 * Try opening the OS share sheet with image files so mobile users can tap
 * "Save Image" straight into their Photos/Gallery app. Falls back cleanly when
 * Web Share is unavailable (e.g. non-HTTPS LAN) or user activation expired.
 */
export async function tryShareFilesToPhotos(
    files: File[],
    title?: string,
    nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): Promise<MobileShareOutcome> {
    if (!canNativeShareFiles(files, nav) || !nav) return 'fallback';
    try {
        await nav.share({ files, title });
        return 'shared';
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return 'cancelled';
        }
        if (error instanceof Error && error.name === 'AbortError') {
            return 'cancelled';
        }
        return 'fallback';
    }
}

interface WritableStreamLike {
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
}

interface FileHandleLike {
    createWritable(): Promise<WritableStreamLike>;
}

interface DirectoryHandleLike {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
}

interface SavePickerWindow extends Window {
    showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<FileHandleLike>;
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
}

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

export function capMobileExportSize(
    width: number,
    height: number,
    mobile: boolean,
    maxPixels = MOBILE_EXPORT_MAX_PIXELS,
): { width: number; height: number } {
    if (!mobile || width * height <= maxPixels) return { width, height };
    const fit = Math.sqrt(maxPixels / (width * height));
    return {
        width: Math.max(1, Math.floor(width * fit)),
        height: Math.max(1, Math.floor(height * fit)),
    };
}

export async function exportImage(
    tab: PhotoTab,
    content: FrameContent,
    onProgress: (done: number, total: number) => void,
    precomputedMosaicMask?: { width: number; height: number; maskBuffer: ArrayBuffer } | null,
    precomputedPencilSketch?: RenderPencilSketch | null,
    format: ExportFormat = 'png',
) {
    const s = snapshot(tab);
    const colorPlan = await autoColorPlan(tab, s);
    const base = await exportBase(tab, s);
    let bitmap = await decode(base.blob);
    const capped = capMobileExportSize(bitmap.width, bitmap.height, isMobileBrowser());
    if (capped.width !== bitmap.width || capped.height !== bitmap.height) {
        try {
            const resized = await createImageBitmap(bitmap, {
                resizeWidth: capped.width,
                resizeHeight: capped.height,
                resizeQuality: 'high',
            });
            bitmap.close();
            bitmap = resized;
        } catch {
            const fitCanvas = document.createElement('canvas');
            fitCanvas.width = capped.width;
            fitCanvas.height = capped.height;
            const fitCtx = fitCanvas.getContext('2d');
            if (fitCtx) {
                fitCtx.drawImage(bitmap, 0, 0, capped.width, capped.height);
                const resized = await createImageBitmap(fitCanvas);
                bitmap.close();
                bitmap = resized;
            }
            fitCanvas.width = 1;
            fitCanvas.height = 1;
        }
    }
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
        throw new Error(currentMsg('无法创建导出画布', 'Could not create export canvas'));
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
                throw new Error(currentMsg('无法创建分块画布', 'Could not create tile canvas'));
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

        let output = composeFrame(result, w, h, s.frameEnabled, content);
        if (format === 'jpeg' && !s.frameEnabled) {
            const opaque = document.createElement('canvas');
            opaque.width = output.width;
            opaque.height = output.height;
            const octx = opaque.getContext('2d');
            if (octx) {
                octx.fillStyle = '#ffffff';
                octx.fillRect(0, 0, opaque.width, opaque.height);
                octx.drawImage(output, 0, 0);
                output = opaque;
            }
        }
        const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const quality = format === 'jpeg' ? 0.92 : undefined;
        return await new Promise<Blob>((resolve, reject) =>
            output.toBlob(
                blob =>
                    blob
                        ? resolve(blob)
                        : reject(
                              new Error(
                                  currentMsg(
                                      `${format === 'jpeg' ? 'JPEG' : 'PNG'} 编码失败，可能是浏览器内存不足`,
                                      `${format === 'jpeg' ? 'JPEG' : 'PNG'} encoding failed, possibly due to low memory`,
                                  ),
                              ),
                          ),
                mime,
                quality,
            ),
        );
    } finally {
        bitmap.close();
        for (const slot of slots) {
            slot.client.dispose();
        }
    }
}

export function exportPng(
    tab: PhotoTab,
    content: FrameContent,
    onProgress: (done: number, total: number) => void,
    precomputedMosaicMask?: { width: number; height: number; maskBuffer: ArrayBuffer } | null,
    precomputedPencilSketch?: RenderPencilSketch | null,
) {
    return exportImage(tab, content, onProgress, precomputedMosaicMask, precomputedPencilSketch, 'png');
}

export function exportFilename(
    name: string,
    styleId: keyof typeof STYLES,
    enhanced = false,
    format: ExportFormat = 'png',
) {
    const base =
        name
            .replace(/\.[^.]+$/, '')
            .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
            .slice(0, 100) || 'image';
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    return `${base}${enhanced ? '-enhanced' : ''}-pixel-toon-${STYLES[styleId].short}.${ext}`;
}

export function triggerBrowserDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function prepareSingleSaveTarget(
    suggestedName: string,
    format: ExportFormat = 'png',
): Promise<{
    cancelled: boolean;
    save: (blob: Blob, finalName?: string) => Promise<SaveMode>;
}> {
    if (window.pixelToonDesktop) {
        return {
            cancelled: false,
            save: async (blob: Blob, finalName = suggestedName) => {
                const bytes = new Uint8Array(await blob.arrayBuffer());
                const ok = window.pixelToonDesktop!.saveImage
                    ? await window.pixelToonDesktop!.saveImage(bytes, finalName, format)
                    : await window.pixelToonDesktop!.savePng(bytes, finalName);
                return ok ? 'desktop' : 'cancelled';
            },
        };
    }

    const pickerWin = window as SavePickerWindow;
    if (!isMobileBrowser() && !navigator.webdriver && typeof pickerWin.showSaveFilePicker === 'function') {
        try {
            const handle = await pickerWin.showSaveFilePicker({
                suggestedName,
                types: [
                    format === 'jpeg'
                        ? { description: 'JPEG Image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }
                        : { description: 'PNG Image', accept: { 'image/png': ['.png'] } },
                ],
            });
            return {
                cancelled: false,
                save: async (blob: Blob) => {
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return 'picker';
                },
            };
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return { cancelled: true, save: async () => 'cancelled' };
            }
            // Fall through to standard browser download if picker is blocked by environment
        }
    }

    return {
        cancelled: false,
        save: async (blob: Blob, finalName = suggestedName) => {
            triggerBrowserDownload(blob, finalName);
            return 'download';
        },
    };
}

export async function prepareBatchSaveTarget(): Promise<{
    mode: 'desktop' | 'picker' | 'download';
    save: (blob: Blob, filename: string, format: ExportFormat) => Promise<void>;
    finish: () => Promise<void>;
} | null> {
    const usedNames = new Set<string>();
    const uniqueName = (filename: string) => {
        if (!usedNames.has(filename)) {
            usedNames.add(filename);
            return filename;
        }
        const dot = filename.lastIndexOf('.');
        const stem = dot > 0 ? filename.slice(0, dot) : filename;
        const ext = dot > 0 ? filename.slice(dot) : '';
        let n = 2;
        while (usedNames.has(`${stem}-${n}${ext}`)) n++;
        const candidate = `${stem}-${n}${ext}`;
        usedNames.add(candidate);
        return candidate;
    };

    if (window.pixelToonDesktop?.pickExportDir && window.pixelToonDesktop.saveBatchImage) {
        const picked = await window.pixelToonDesktop.pickExportDir();
        if (!picked) return null;
        return {
            mode: 'desktop',
            save: async (blob, filename, format) => {
                const bytes = new Uint8Array(await blob.arrayBuffer());
                await window.pixelToonDesktop!.saveBatchImage!(bytes, uniqueName(filename), format);
            },
            finish: async () => {
                await window.pixelToonDesktop?.endBatchExport?.();
            },
        };
    }

    const pickerWin = window as SavePickerWindow;
    if (!isMobileBrowser() && !navigator.webdriver && typeof pickerWin.showDirectoryPicker === 'function') {
        try {
            const dir = await pickerWin.showDirectoryPicker({ mode: 'readwrite' });
            return {
                mode: 'picker',
                save: async (blob, filename) => {
                    const fileHandle = await dir.getFileHandle(uniqueName(filename), { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                },
                finish: async () => {},
            };
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return null;
            }
            // Fall through to sequential browser downloads if picker is blocked
        }
    }

    return {
        mode: 'download',
        save: async (blob, filename) => {
            triggerBrowserDownload(blob, uniqueName(filename));
            await new Promise(resolve => setTimeout(resolve, 220));
        },
        finish: async () => {},
    };
}

export async function download(blob: Blob, name: string, format: ExportFormat = 'png'): Promise<boolean> {
    if (window.pixelToonDesktop) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return window.pixelToonDesktop.saveImage
            ? window.pixelToonDesktop.saveImage(bytes, name, format)
            : window.pixelToonDesktop.savePng(bytes, name);
    }
    triggerBrowserDownload(blob, name);
    return true;
}
