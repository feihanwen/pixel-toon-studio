import { describe, it, expect } from 'vitest';
import { cacheKey, canonicalJson, checkDimensions, transition } from '../src/enhancement/domain';
import { tilePlan, tileLuma, reflect } from '../src/enhancement/local/tilePlan';
import { applyEdgeDenoise, applyLocalClarity } from '../src/enhancement/usm';
import { initialSnapshot, normalizeHistory } from '../src/state/history';

describe('enhancement contracts', () => {
    it('protects output allocations before inference', () => {
        expect(() => checkDimensions(3000, 2000, 2)).not.toThrow();
        expect(() => checkDimensions(4284, 5712, 1)).not.toThrow();
        expect(() => checkDimensions(4000, 3000, 2)).toThrow('24 MP');
        for (const n of [NaN, Infinity, -1, 0, 1.3]) expect(() => checkDimensions(n, 1)).toThrow();
    });
    it('canonicalizes all pixel settings and invalidates on model/source changes', async () => {
        expect(canonicalJson({ z: 1, a: { y: 1, x: 2 } })).toBe(canonicalJson({ a: { x: 2, y: 1 }, z: 1 }));
        expect(await cacheKey('source', { model: 1 })).toBe(await cacheKey('source', { model: 1 }));
        expect(await cacheKey('source', { model: 1 })).not.toBe(await cacheKey('source', { model: 2 }));
        expect(() => canonicalJson({ value: NaN })).toThrow();
    });
    it('enforces state transitions including cache hits and failures', () => {
        expect(transition('preparing', 'succeeded')).toBe('succeeded');
        expect(() => transition('idle', 'saving')).toThrow();
        expect(() => transition('succeeded', 'processing')).toThrow();
    });
    it.each([[1, 1], [257, 133], [1, 611], [602, 1]])('tiles cover %ix%i without overlaps in the valid area', (w, h) => {
        const counts = new Uint8Array(w * h);
        for (const t of tilePlan(w, h)) for (let y = t.y; y < t.y + t.height; y++) for (let x = t.x; x < t.x + t.width; x++) counts[y * w + x]++;
        expect(counts.every(n => n === 1)).toBe(true);
        expect(reflect(-400, 1)).toBe(0);
        const data = new Uint8ClampedArray(w * h * 4).fill(255), tile = tilePlan(w, h)[0];
        expect(tileLuma(data, w, h, tile, 8).values.every(v => Math.abs(v - 1) < .00001)).toBe(true);
    });
    it('applies edge-preserving denoise and local clarity and persists optional offsets in history', () => {
        const w = 16, h = 16;
        const noisy = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = 128 + ((x + y) % 2 === 0 ? 12 : -12);
            noisy[i] = noisy[i + 1] = noisy[i + 2] = v;
            noisy[i + 3] = 255;
        }
        const denoised = noisy.slice();
        applyEdgeDenoise(denoised, w, h, 80);
        expect(Math.abs(denoised[0] - 128)).toBeLessThan(Math.abs(noisy[0] - 128));

        const edge = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = x < 8 ? 80 : 180;
            edge[i] = edge[i + 1] = edge[i + 2] = v;
            edge[i + 3] = 255;
        }
        const crisp = edge.slice();
        applyLocalClarity(crisp, w, h, 80);
        expect(crisp[(8 * w + 8) * 4]).toBeGreaterThan(edge[(8 * w + 8) * 4]);
        expect(crisp[(8 * w + 7) * 4]).toBeLessThan(edge[(8 * w + 7) * 4]);

        const snap = initialSnapshot();
        snap.enhancement = { enabled: true, resultId: 'r1', strength: 85, sharpen: 40, clarity: 30, denoise: 25 };
        expect(normalizeHistory({ entries: [snap], cursor: 0 }).entries[0].enhancement).toEqual(snap.enhancement);
    });
});
