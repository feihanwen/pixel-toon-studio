import { describe, it, expect } from 'vitest';
import { cacheKey, canonicalJson, checkDimensions, transition } from '../src/enhancement/domain';
import { tilePlan, tileLuma, reflect } from '../src/enhancement/local/tilePlan';

describe('enhancement contracts', () => {
    it('protects output allocations before inference', () => {
        expect(() => checkDimensions(3000, 2000, 2)).not.toThrow();
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
});
