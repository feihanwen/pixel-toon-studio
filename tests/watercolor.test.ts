import { describe, expect, it } from 'vitest';
import { watercolor } from '../src/worker/styles/watercolor';

function picture(w: number, h: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const left = x < w * .52;
        const ripple = Math.sin(x * .31 + y * .19) * 13 + Math.sin(y * .55) * 9;
        data[i] = Math.round((left ? 190 : 45) + ripple + y * .12);
        data[i + 1] = Math.round((left ? 131 : 103) + ripple * .65 + x * .11);
        data[i + 2] = Math.round((left ? 104 : 161) + ripple * .55);
        data[i + 3] = 255;
    }
    return data;
}
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
    let sum = 0, changed = 0;
    for (let i = 0; i < a.length; i += 4) {
        const amount = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
        sum += amount;
        if (amount >= 6) changed++;
    }
    return { mad: sum / (a.length / 4), ratio: changed / (a.length / 4) };
}
const defaults = { radius: 7, smear: 78, softness: 62, detail: 55 };

describe('watercolor effect', () => {
    it('visibly changes the default and migrated legacy settings', () => {
        const source = picture(144, 112);
        const metricsList = [];
        for (const params of [defaults, { radius: 7, smear: 77, softness: 55, detail: 55 }]) {
            const result = watercolor(source, 144, 112, params, 0, 0, 144, 112);
            const metrics = difference(source, result);
            console.info(`watercolor setting ${params.smear}: MAD ${metrics.mad.toFixed(2)}, changed ${(metrics.ratio * 100).toFixed(1)}%`);
            metricsList.push(metrics);
        }
        for (const metrics of metricsList) {
            expect(metrics.mad).toBeGreaterThanOrEqual(6);
            expect(metrics.ratio).toBeGreaterThanOrEqual(.6);
        }
    });
    it('responds monotonically to painting intensity', () => {
        const source = picture(80, 64);
        const scores = [25, 50, 75, 100].map(smear => difference(source, watercolor(source, 80, 64, { ...defaults, smear }, 0, 0, 80, 64)).mad);
        for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    });
    it('gives each painting control an observable effect', () => {
        const source = picture(100, 72);
        for (const [key, low, high] of [['radius', 2, 12], ['softness', 0, 100], ['detail', 0, 100]] as const) {
            const a = watercolor(source, 100, 72, { ...defaults, [key]: low }, 0, 0, 100, 72);
            const b = watercolor(source, 100, 72, { ...defaults, [key]: high }, 0, 0, 100, 72);
            expect(difference(a, b).mad, key).toBeGreaterThan(.2);
        }
    });
    it('keeps separately rendered tiles aligned with the full image', () => {
        const w = 132, h = 88, source = picture(w, h);
        const full = watercolor(source, w, h, defaults, 0, 0, w, h);
        const result = new Uint8ClampedArray(source.length);
        const halo = 28;
        for (const [left, right] of [[0, 66], [66, 132]]) {
            const sx = Math.max(0, left - halo), ex = Math.min(w, right + halo);
            const tile = new Uint8ClampedArray((ex - sx) * h * 4);
            for (let y = 0; y < h; y++) tile.set(source.subarray((y * w + sx) * 4, (y * w + ex) * 4), y * (ex - sx) * 4);
            const painted = watercolor(tile, ex - sx, h, defaults, sx, 0, w, h);
            for (let y = 0; y < h; y++) result.set(painted.subarray((y * (ex - sx) + left - sx) * 4, (y * (ex - sx) + right - sx) * 4), (y * w + left) * 4);
        }
        expect(difference(full, result).mad).toBeLessThan(.35);
    });
    it('aligns tiles when style space is smaller than the output', () => {
        const w = 960, h = 240, source = picture(w, h);
        const full = watercolor(source, w, h, defaults, 0, 0, w, h);
        const result = new Uint8ClampedArray(source.length);
        const halo = 45;
        for (const [left, right] of [[0, 480], [480, 960]]) {
            const sx = Math.max(0, left - halo), ex = Math.min(w, right + halo), tw = ex - sx;
            const tile = new Uint8ClampedArray(tw * h * 4);
            for (let y = 0; y < h; y++) tile.set(source.subarray((y * w + sx) * 4, (y * w + ex) * 4), y * tw * 4);
            const painted = watercolor(tile, tw, h, defaults, sx, 0, w, h);
            for (let y = 0; y < h; y++) result.set(painted.subarray((y * tw + left - sx) * 4, (y * tw + right - sx) * 4), (y * w + left) * 4);
        }
        expect(difference(full, result).mad).toBeLessThan(.35);
    });
    it('records a full style-space render benchmark', () => {
        const source = picture(1600, 1200);
        const start = performance.now();
        const result = watercolor(source, 1600, 1200, defaults, 0, 0, 1600, 1200);
        const milliseconds = Math.round(performance.now() - start);
        console.info(`watercolor 1600x1200 input: ${milliseconds} ms`);
        expect(result).toHaveLength(source.length);
    });
});
