import { afterEach, describe, expect, it, vi } from 'vitest';
import { decode, prepareImageImport } from '../src/imaging/decode';

describe('iPhone 24 MP HEIC import and decode', () => {
    const originalCreateImageBitmap = globalThis.createImageBitmap;

    afterEach(() => {
        globalThis.createImageBitmap = originalCreateImageBitmap;
        vi.restoreAllMocks();
    });

    it('accepts native 24 MP (4284 x 5712) HEIC photos without WASM round-trip when browser supports HEIC natively', async () => {
        const close = vi.fn();
        globalThis.createImageBitmap = vi.fn().mockResolvedValue({
            width: 4284,
            height: 5712,
            close,
        } as unknown as ImageBitmap);

        const file = new File([new Uint8Array([0, 0, 0, 24, ...'ftypheic'.split('').map(c => c.charCodeAt(0))])], 'IMG_2257.HEIC', {
            type: 'image/heic',
        });

        const prepared = await prepareImageImport(file);
        expect(prepared).toBe(file);
        expect(close).toHaveBeenCalledTimes(1);

        const decoded = await decode(prepared);
        expect(decoded.width).toBe(4284);
        expect(decoded.height).toBe(5712);
    });

    it('still rejects images exceeding 25 MP limit in raw decode()', async () => {
        const close = vi.fn();
        globalThis.createImageBitmap = vi.fn().mockResolvedValue({
            width: 6000,
            height: 5000,
            close,
        } as unknown as ImageBitmap);

        const blob = new Blob([new Uint8Array(16)], { type: 'image/jpeg' });
        await expect(decode(blob)).rejects.toThrow('24 MP');
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('auto-resizes oversized high-MP camera photos during prepareImageImport instead of rejecting', async () => {
        const close = vi.fn();
        globalThis.createImageBitmap = vi.fn().mockResolvedValue({
            width: 8000,
            height: 6000,
            close,
        } as unknown as ImageBitmap);

        let drawnWidth = 0;
        let drawnHeight = 0;
        const fakeCtx = { drawImage: vi.fn() };
        const fakeCanvas = {
            _w: 0,
            _h: 0,
            set width(v: number) {
                this._w = v;
                if (v > 1) drawnWidth = v;
            },
            get width() {
                return this._w;
            },
            set height(v: number) {
                this._h = v;
                if (v > 1) drawnHeight = v;
            },
            get height() {
                return this._h;
            },
            getContext: () => fakeCtx,
            toBlob: (cb: (b: Blob | null) => void, mime: string) => cb(new Blob(['resized'], { type: mime })),
        };
        const origDoc = globalThis.document;
        globalThis.document = { createElement: () => fakeCanvas } as unknown as Document;

        try {
            const file = new File([new Uint8Array(16)], 'DSC_0001.JPG', { type: 'image/jpg' });
            const prepared = await prepareImageImport(file);
            expect(prepared.type).toBe('image/jpeg');
            expect(drawnWidth * drawnHeight).toBeLessThanOrEqual(25000000);
            expect(drawnWidth).toBeGreaterThan(5000);
            expect(close).toHaveBeenCalledTimes(1);
        } finally {
            globalThis.document = origDoc;
        }
    });
});
