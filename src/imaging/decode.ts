import { MAX_PIXELS, MAX_SIDE, MOBILE_EXPORT_MAX_PIXELS, PREVIEW_SIDE } from '../config/limits';
import { getLanguage } from '../config/preferences';
const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const HEIF_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
export const ACCEPTED = [...RASTER_TYPES, ...HEIF_TYPES];
export const FILE_ACCEPT = [...ACCEPTED, '.heic', '.heif', '.png', '.jpg', '.jpeg', '.webp'].join(',');
const formatError = () =>
    getLanguage() === 'en'
        ? 'Only HEIC, HEIF, PNG, JPEG, and WebP images are supported'
        : '仅支持 HEIC、HEIF、PNG、JPEG 和 WebP 图片';

const sizeError = () =>
    getLanguage() === 'en'
        ? 'Image exceeds 24 MP or 12,000 px per side; please resize before importing'
        : '图片超过 24 MP 或单边 12,000 px，请缩小后导入';

function isWithinLimits(width: number, height: number): boolean {
    return width * height <= MAX_PIXELS && width <= MAX_SIDE && height <= MAX_SIDE;
}

function fitScale(width: number, height: number, maxPixels = MAX_PIXELS): number {
    const pixels = width * height;
    const pixelScale = pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
    const sideScale = Math.max(width, height) > MAX_SIDE ? MAX_SIDE / Math.max(width, height) : 1;
    return Math.min(1, pixelScale, sideScale);
}

function assertWithinLimits(bitmap: ImageBitmap) {
    if (!isWithinLimits(bitmap.width, bitmap.height)) {
        bitmap.close();
        throw new Error(sizeError());
    }
}

async function tryNativeBitmap(blob: Blob): Promise<ImageBitmap | null> {
    if (typeof createImageBitmap !== 'function') return null;
    try {
        return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
        return null;
    }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), mime, quality));
}

async function bitmapToBlob(bitmap: ImageBitmap, preferredMime: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
    const baseScale = fitScale(bitmap.width, bitmap.height, MAX_PIXELS);
    const attempts: Array<{ scale: number; mime: string; quality?: number }> =
        preferredMime === 'image/jpeg'
            ? [{ scale: baseScale, mime: 'image/jpeg', quality: 0.94 }]
            : [
                  { scale: baseScale, mime: 'image/png', quality: undefined },
                  { scale: baseScale, mime: 'image/jpeg', quality: 0.94 },
              ];
    const scaledPixels = bitmap.width * baseScale * (bitmap.height * baseScale);
    if (scaledPixels > MOBILE_EXPORT_MAX_PIXELS) {
        const mobileScale = fitScale(bitmap.width, bitmap.height, MOBILE_EXPORT_MAX_PIXELS);
        if (preferredMime !== 'image/jpeg') {
            attempts.push({ scale: mobileScale, mime: 'image/png', quality: undefined });
        }
        attempts.push({ scale: mobileScale, mime: 'image/jpeg', quality: 0.94 });
    }
    const canvas = document.createElement('canvas');
    try {
        for (const attempt of attempts) {
            canvas.width = Math.max(1, Math.floor(bitmap.width * attempt.scale));
            canvas.height = Math.max(1, Math.floor(bitmap.height * attempt.scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await canvasToBlob(canvas, attempt.mime, attempt.quality);
            if (blob) return blob;
        }
    } finally {
        canvas.width = 1;
        canvas.height = 1;
    }
    throw new Error('Could not encode decoded image');
}

// Finder and some browsers provide no MIME type for HEIC files. Inspect the
// container as well as its name; MIME alone must not reject iPhone photos.
export async function isHeif(blob: Blob): Promise<boolean> {
    if (HEIF_TYPES.includes(blob.type) || ('name' in blob && /\.hei[cf]$/i.test(String(blob.name)))) return true;
    const bytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    const text = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
    if (text(4) !== 'ftyp') return false;
    const boxSize = bytes[0] * 2 ** 24 + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    for (let offset = 8; offset + 4 <= Math.min(bytes.length, boxSize); offset += 4) {
        if (offset !== 12 && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(text(offset))) return true;
    }
    return false;
}

export async function prepareImageImport(file: File): Promise<Blob> {
    if (await isHeif(file)) {
        // Safari/iOS decodes HEIC natively without a 24 MP WASM + canvas round-trip
        // that can exceed mobile WebKit canvas memory limits.
        const native = await tryNativeBitmap(file);
        if (native) {
            try {
                if (isWithinLimits(native.width, native.height)) {
                    return HEIF_TYPES.includes(file.type) ? file : new Blob([file], { type: 'image/heic' });
                }
                return await bitmapToBlob(native, 'image/jpeg');
            } finally {
                native.close();
            }
        }
        try {
            // Convert once, without JPEG loss when possible, and persist this editable rendition.
            // The decoder and its Worker are shipped locally, including in the DMG.
            const { heicTo } = await import('heic-to/csp');
            try {
                const bitmap = await heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
                try {
                    return await bitmapToBlob(bitmap, 'image/png');
                } finally {
                    bitmap.close();
                }
            } catch {
                return await heicTo({ blob: file, type: 'image/png' });
            }
        } catch {
            throw new Error(
                getLanguage() === 'en'
                    ? `${file.name}: Could not decode HEIC image; the file may be corrupted or use an unsupported encoding`
                    : `${file.name}：无法读取 HEIC 图片，文件可能损坏或使用了不支持的编码`,
            );
        }
    }
    let normalized: Blob | null = null;
    if (file.type === 'image/jpg') {
        normalized = new Blob([file], { type: 'image/jpeg' });
    } else if (RASTER_TYPES.includes(file.type)) {
        normalized = file;
    } else {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const type = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[extension ?? ''];
        if (type && (!file.type || file.type === 'application/octet-stream')) normalized = new Blob([file], { type });
    }
    if (!normalized) throw new Error(`${file.name}：${formatError()}`);

    const native = await tryNativeBitmap(normalized);
    if (native) {
        try {
            if (isWithinLimits(native.width, native.height)) return normalized;
            return await bitmapToBlob(native, normalized.type === 'image/png' ? 'image/png' : 'image/jpeg');
        } finally {
            native.close();
        }
    }
    return normalized;
}

export async function decode(blob: Blob) {
    const heif = HEIF_TYPES.includes(blob.type) || (!blob.type && (await isHeif(blob)));
    if (!RASTER_TYPES.includes(blob.type) && !heif) throw new Error(formatError());
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
        if (heif) {
            try {
                const { heicTo } = await import('heic-to/csp');
                bitmap = await heicTo({ blob, type: 'bitmap', options: { imageOrientation: 'from-image' } });
            } catch {
                throw new Error(
                    getLanguage() === 'en'
                        ? 'Could not decode this image; please check the file format and content'
                        : '无法解码这张图片，请确认文件格式和内容',
                );
            }
        } else {
            throw new Error(
                getLanguage() === 'en'
                    ? 'Could not decode this image; please check the file format and content'
                    : '无法解码这张图片，请确认文件格式和内容',
            );
        }
    }
    assertWithinLimits(bitmap);
    return bitmap;
}
export function toImageData(bitmap: ImageBitmap, maxSide = PREVIEW_SIDE) { const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)), width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale)); const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx)
    throw new Error(
        getLanguage() === 'en'
            ? 'Browser could not create an image canvas'
            : '浏览器无法创建图片画布',
    ); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(bitmap, 0, 0, width, height); return ctx.getImageData(0, 0, width, height); }
export function imageDataCanvas(data: ImageData) { const canvas = document.createElement('canvas'); canvas.width = data.width; canvas.height = data.height; canvas.getContext('2d')?.putImageData(data, 0, 0); return canvas; }
