import type { ExifFields } from '../types/document';
function ascii(bytes: Uint8Array, start: number, length: number) { return String.fromCharCode(...bytes.slice(start, start + length)); }
function exifTiff(bytes: Uint8Array): Uint8Array | null { if (ascii(bytes, 0, 2) === '\xff\xd8') {
    let p = 2;
    while (p + 4 < bytes.length) {
        if (bytes[p] !== 255)
            break;
        const marker = bytes[p + 1], length = (bytes[p + 2] << 8) | bytes[p + 3];
        if (marker === 0xe1 && ascii(bytes, p + 4, 6) === 'Exif\0\0')
            return bytes.slice(p + 10, p + 2 + length);
        p += 2 + length;
    }
    return null;
} if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
    let p = 8;
    while (p + 12 < bytes.length) {
        const length = (bytes[p] * 2 ** 24) + (bytes[p + 1] << 16) + (bytes[p + 2] << 8) + bytes[p + 3], type = ascii(bytes, p + 4, 4);
        if (type === 'eXIf')
            return bytes.slice(p + 8, p + 8 + length);
        p += 12 + length;
    }
    return null;
} if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    let p = 12;
    while (p + 8 < bytes.length) {
        const type = ascii(bytes, p, 4), length = bytes[p + 4] + (bytes[p + 5] << 8) + (bytes[p + 6] << 16) + (bytes[p + 7] * 2 ** 24);
        if (type === 'EXIF') {
            const chunk = bytes.slice(p + 8, p + 8 + length);
            return ascii(chunk, 0, 6) === 'Exif\0\0' ? chunk.slice(6) : chunk;
        }
        p += 8 + length + (length % 2);
    }
    return null;
} return null; }
export async function detectExif(blob: Blob) { const bytes = new Uint8Array(await blob.arrayBuffer()); return exifTiff(bytes) !== null; }
export async function parseExif(blob: Blob): Promise<ExifFields> { const bytes = new Uint8Array(await blob.arrayBuffer()), tiff = exifTiff(bytes); if (!tiff)
    return {}; const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength); if (tiff.length < 8)
    return {}; const little = ascii(tiff, 0, 2) === 'II'; if (!little && ascii(tiff, 0, 2) !== 'MM')
    return {}; const u16 = (p: number) => p + 2 <= tiff.length ? view.getUint16(p, little) : 0; const u32 = (p: number) => p + 4 <= tiff.length ? view.getUint32(p, little) : 0; if (u16(2) !== 42)
    return {}; const read = (entry: number) => { const type = u16(entry + 2), count = u32(entry + 4), unit = type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 1; const size = count * unit, off = size <= 4 ? entry + 8 : u32(entry + 8); if (!count || size > 4096 || off + size > tiff.length)
    return null; return { type, count, off }; }; const string = (entry: number) => { const v = read(entry); return v ? ascii(tiff, v.off, v.count).replace(/\0/g, '').trim().slice(0, 80) : ''; }; const number = (entry: number) => { const v = read(entry); if (!v)
    return 0; if (v.type === 3)
    return u16(v.off); if (v.type === 4)
    return u32(v.off); return 0; }; const rational = (entry: number) => { const v = read(entry); if (!v || v.type !== 5)
    return 0; const den = u32(v.off + 4); return den ? u32(v.off) / den : 0; }; const fields: ExifFields = {}; const walk = (offset: number, depth: number) => { if (depth > 1 || offset + 2 > tiff.length)
    return; const count = Math.min(u16(offset), 128); for (let i = 0; i < count; i++) {
    const e = offset + 2 + i * 12;
    if (e + 12 > tiff.length)
        break;
    const tag = u16(e);
    if (tag === 0x0110)
        fields.model = string(e);
    if (tag === 0x8769)
        walk(number(e), depth + 1);
    if (tag === 0x829a) {
        const n = rational(e);
        if (n)
            fields.exposure = n < 1 ? `1/${Math.round(1 / n)}s` : `${n.toFixed(1)}s`;
    }
    if (tag === 0x829d) {
        const n = rational(e);
        if (n)
            fields.aperture = `f/${n.toFixed(1)}`;
    }
    if (tag === 0x8827) {
        const n = number(e);
        if (n)
            fields.iso = `ISO ${n}`;
    }
    if (tag === 0x9003)
        fields.date = string(e).replace(/^(\d{4}):(\d\d):(\d\d)/, '$1-$2-$3');
} ; }; walk(u32(4), 0); return fields; }
