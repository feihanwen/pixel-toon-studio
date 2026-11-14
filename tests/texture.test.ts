import { describe, it, expect } from 'vitest';
import { boxBlur } from '../src/worker/shared/blur';
import { hslToRgb } from '../src/worker/shared/color';
import { hash2d, valueNoise, grainAt, dotPattern, linePattern } from '../src/worker/shared/texture';

describe('shared style primitives', () => {
    it('stable hashes/noise across negative and positive global coordinates', () => {
        for (const x of [-200, -1, 0, 1.5, 50000]) {
            const v = hash2d(x, -17, 21);
            expect(v).toBe(hash2d(x, -17, 21)); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);
            expect(valueNoise(x, -5, .2, 1)).toBeGreaterThanOrEqual(0);
            expect(Math.abs(grainAt(x, 4, 2, 1))).toBeLessThanOrEqual(1);
            expect(dotPattern(x, 2, .4, 6, .5)).toBeGreaterThanOrEqual(0);
            expect(linePattern(x, 2, .4, 6, 1)).toBeLessThanOrEqual(1);
        }
    });
    it('box blur is equivalent to a direct clamped 2D reference, even on narrow images', () => {
        for (const [w, h, r] of [[9, 7, 2], [1, 7, 12], [8, 1, 2]]) {
            const input = Float32Array.from({ length: w * h }, (_, i) => i % 11), out = boxBlur(input, w, h, r);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                let sum = 0;
                for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) sum += input[Math.max(0, Math.min(h - 1, y + dy)) * w + Math.max(0, Math.min(w - 1, x + dx))];
                expect(out[y * w + x]).toBeCloseTo(sum / ((2 * r + 1) ** 2), 4);
            }
            expect(boxBlur(input, w, h, 0)).toEqual(input);
        }
    });
    it('HSL conversion handles primary colors and hue wraparound', () => {
        expect(hslToRgb(0, 1, .5)).toEqual([255, 0, 0]);
        expect(hslToRgb(120, 1, .5)).toEqual([0, 255, 0]);
        expect(hslToRgb(-120, 1, .5)).toEqual(hslToRgb(240, 1, .5));
        expect(hslToRgb(360, 1, .5)).toEqual(hslToRgb(0, 1, .5));
    });
});
