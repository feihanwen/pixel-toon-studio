import { describe, expect, it } from 'vitest';
import { analyzeAutoColor, applyAutoColor } from '../src/imaging/autoColor';
import { commit, initialSnapshot, moveHistory, normalizeHistory } from '../src/state/history';
const pixels = (colors: number[][]) => new Uint8ClampedArray(colors.flatMap(rgb => [...rgb, 255]));

describe('local photo color correction', () => {
    it('lifts a dark photo while preserving neutral color and highlight detail', () => {
        const input = pixels(Array.from({ length: 256 }, (_, i) => { const v = Math.round(i * i / 255); return [v, v, v]; }));
        const output = input.slice(); applyAutoColor(output, analyzeAutoColor(input, 100));
        expect(output[128 * 4]).toBeGreaterThan(input[128 * 4] + 15);
        expect(output[245 * 4]).toBeLessThan(255);
        for (let i = 0; i < output.length; i += 4) { expect(output[i]).toBe(output[i + 1]); expect(output[i]).toBe(output[i + 2]); }
    });
    it('does not infer a white balance cast from a dominant colored subject', () => {
        const input = pixels(Array.from({ length: 100 }, () => [150, 30, 20]));
        expect(analyzeAutoColor(input, 100).gains).toEqual([1, 1, 1]);
        applyAutoColor(input, analyzeAutoColor(input, 100));
        expect(input[0]).toBeGreaterThan(input[1]); expect(input[1]).toBeGreaterThan(input[2]);
    });
    it('leaves black and transparent images stable and never changes alpha', () => {
        for (const input of [new Uint8ClampedArray(400), pixels([[0, 0, 0], [255, 255, 255]])]) {
            const alpha = input.filter((_, i) => i % 4 === 3);
            applyAutoColor(input, analyzeAutoColor(input, 100));
            expect(input.filter((_, i) => i % 4 === 3)).toEqual(alpha);
            expect(input[0]).toBe(0);
        }
    });
    it('zero strength is exact and one whole-photo plan produces identical tiled output', () => {
        const input = pixels(Array.from({ length: 256 }, (_, i) => [i, Math.round(i * .8), Math.round(i * .7)]));
        const untouched = input.slice(); applyAutoColor(untouched, analyzeAutoColor(input, 0)); expect(untouched).toEqual(input);
        const plan = analyzeAutoColor(input, 70), full = input.slice(), stitched = new Uint8ClampedArray(input.length);
        applyAutoColor(full, plan);
        for (let i = 0; i < input.length; i += 100) { const tile = input.slice(i, i + 100); applyAutoColor(tile, plan); stitched.set(tile, i); }
        expect(stitched).toEqual(full);
    });
    it('restores legacy photos disabled and keeps per-photo history independent', () => {
        const one = initialSnapshot(), two = initialSnapshot();
        const history = commit({ entries: [one], cursor: 0 }, { ...one, autoColor: { enabled: true, strength: 82, algorithmVersion: 2 } });
        expect(history.entries[history.cursor].autoColor.enabled).toBe(true);
        expect(moveHistory(history, -1).entries[0].autoColor.enabled).toBe(false);
        expect(two.autoColor).toEqual({ enabled: false, strength: 70, algorithmVersion: 2 });
        expect(normalizeHistory(history)).toEqual(history);
        const legacy = JSON.parse(JSON.stringify(one)); delete legacy.autoColor;
        expect(normalizeHistory({ entries: [legacy], cursor: 0 }).entries[0].autoColor).toEqual({ ...two.autoColor, algorithmVersion: 1 });
    });
});

describe('gentle color v2', () => {
    it('anchors black and white and protects bright neutral detail', () => {
        const input = pixels(Array.from({ length: 256 }, (_, i) => [i, i, i]));
        const output = input.slice(); applyAutoColor(output, analyzeAutoColor(input, 100, 2));
        expect(output[0]).toBe(0); expect(output[255 * 4]).toBe(255);
        for (let i = 225; i < 255; i++) expect(Math.abs(output[i * 4] - input[i * 4])).toBeLessThanOrEqual(1);
        for (let i = 0; i < 256; i++) { expect(output[i * 4]).toBe(output[i * 4 + 1]); if (i) expect(output[i * 4]).toBeGreaterThanOrEqual(output[(i - 1) * 4]); }
    });
    it('does not add saturation to a high-saturation red subject or flatten dark photos', () => {
        const red = pixels(Array.from({ length: 100 }, () => [170, 20, 15]));
        const p = analyzeAutoColor(red, 100, 2); const changed = red.slice(); applyAutoColor(changed, p);
        expect(changed).toEqual(red);
        const black = pixels(Array.from({ length: 100 }, () => [2, 2, 2])); const before = black.slice();
        applyAutoColor(black, analyzeAutoColor(black, 100, 2)); expect(black).toEqual(before);
    });
    it('uses the same curve across tiles and zero strength is an exact bypass', () => {
        const input = pixels(Array.from({ length: 300 }, (_, i) => [i % 256, i % 193, i % 150]));
        const plan = analyzeAutoColor(input, 100, 2), full = input.slice(), pieces = input.slice();
        applyAutoColor(full, plan);
        for (let start = 0; start < input.length; start += 100) applyAutoColor(pieces.subarray(start, start + 100), plan);
        expect(full).toEqual(pieces);
        const zero = input.slice(); applyAutoColor(zero, { ...plan, strength: 0 }); expect(zero).toEqual(input);
    });
});
