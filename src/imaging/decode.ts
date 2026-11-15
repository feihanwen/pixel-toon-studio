import { MAX_PIXELS, MAX_SIDE, PREVIEW_SIDE } from '../config/limits';
import { getLanguage } from '../config/preferences';
const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const HEIF_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
export const ACCEPTED = [...RASTER_TYPES, ...HEIF_TYPES];
export const FILE_ACCEPT = [...ACCEPTED, '.heic', '.heif', '.png', '.jpg', '.jpeg', '.webp'].join(',');
const formatError = () =>
    getLanguage() === 'en'
        ? 'Only HEIC, HEIF, PNG, JPEG, and WebP images are supported'
        : '仅支持 HEIC、HEIF、PNG、JPEG 和 WebP 图片';

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
        try {
            // Convert once, without JPEG loss, and persist this editable rendition.
            // The decoder and its Worker are shipped locally, including in the DMG.
            const { heicTo } = await import('heic-to/csp');
            return await heicTo({ blob: file, type: 'image/png' });
        } catch {
            throw new Error(
                getLanguage() === 'en'
                    ? `${file.name}: Could not decode HEIC image; the file may be corrupted or use an unsupported encoding`
                    : `${file.name}：无法读取 HEIC 图片，文件可能损坏或使用了不支持的编码`,
            );
        }
    }
    if (RASTER_TYPES.includes(file.type)) return file;
    const extension = file.name.split('.').pop()?.toLowerCase();
    const type = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[extension ?? ''];
    if (type && (!file.type || file.type === 'application/octet-stream')) return new Blob([file], { type });
    throw new Error(`${file.name}：${formatError()}`);
}

export async function decode(blob: Blob) {
    if (!RASTER_TYPES.includes(blob.type)) throw new Error(formatError());
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch {
        throw new Error(
            getLanguage() === 'en'
                ? 'Could not decode this image; please check the file format and content'
                : '无法解码这张图片，请确认文件格式和内容',
        );
    }
    if (bitmap.width * bitmap.height > MAX_PIXELS || bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) {
        bitmap.close();
        throw new Error(
            getLanguage() === 'en'
                ? 'Image exceeds 24 MP or 12,000 px per side; please resize before importing'
                : '图片超过 24 MP 或单边 12,000 px，请缩小后导入',
        );
    }
    return bitmap;
}
export function toImageData(bitmap: ImageBitmap, maxSide = PREVIEW_SIDE) { const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)), width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale)); const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx)
    throw new Error('浏览器无法创建图片画布'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(bitmap, 0, 0, width, height); return ctx.getImageData(0, 0, width, height); }
export function imageDataCanvas(data: ImageData) { const canvas = document.createElement('canvas'); canvas.width = data.width; canvas.height = data.height; canvas.getContext('2d')?.putImageData(data, 0, 0); return canvas; }
