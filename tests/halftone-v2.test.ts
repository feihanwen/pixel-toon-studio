import { describe, expect, it } from 'vitest';
import { halftoneV2, halftonePeriod, dotCoverage } from '../src/worker/styles/halftoneV2';
import { popArt } from '../src/worker/styles/popArt';
import { halftone } from '../src/worker/styles/halftone';
import { render } from '../src/worker/pipeline';
import { defaultParams } from '../src/config/styles';
import { initialSnapshot, normalizeHistory } from '../src/state/history';
import { fixture, flat, metrics } from './style-fixtures';
const ctx = (w: number, h: number, originX = 0, originY = 0, fullWidth = w, fullHeight = h) => ({ originX, originY, fullWidth, fullHeight, scale: Math.max(1, Math.max(fullWidth, fullHeight) / 1600) });
const run = (src: Uint8ClampedArray, w: number, h: number, p = defaultParams().halftone) => halftoneV2(src, w, h, p, ctx(w, h));

describe('fine pop art', () => {
    it('keeps a constant relative period including fractional small-photo screens', () => {
        for (const h of [486, 972, 1449, 1600, 3200]) {
            expect(halftonePeriod(6, Math.round(h * .75), h) / h).toBeCloseTo(6 / 1600, 10);
        }
        expect(halftonePeriod(6, 728, 972)).toBeCloseTo(3.645);
        expect(halftonePeriod(6, 364, 486)).toBeLessThan(2);
    });
    it('measures a stable raster screen frequency across resolutions', () => {
        const expectedCycles = .949235418 * 1600 / 6;
        for (const side of [972, 1449, 1600, 3200]) {
            const data = flat(side, 3, 128), params = { ...defaultParams().halftone, ink: 0, density: 100, poster: 0 };
            const rendered = halftoneV2(data, side, 3, params, ctx(side, 3, 0, Math.floor(side * .37), side, side));
            let bestFrequency = 0, bestPower = -1;
            for (let frequency = 245; frequency <= 261; frequency += .25) {
                let re = 0, im = 0;
                for (let x = 0; x < side; x++) {
                    const angle = 2 * Math.PI * frequency * x / side, value = rendered[(side + x) * 4];
                    re += value * Math.cos(angle); im += value * Math.sin(angle);
                }
                const power = re * re + im * im;
                if (power > bestPower) { bestPower = power; bestFrequency = frequency; }
            }
            expect(Math.abs(bestFrequency - expectedCycles) / expectedCycles).toBeLessThan(.05);
        }
    });
    it('anchors dots in global coordinates and smoothly fades unresolvable screens', () => {
        const cos = .949235418, sin = .314566561;
        for (const period of [3.645, 6, 8.1]) for (const x of [0, 17.7, 100.3]) {
            expect(dotCoverage(x, 31.2, period, .3)).toBeCloseTo(dotCoverage(x + period * cos, 31.2 + period * sin, period, .3), 5);
        }
        const small = Array.from({ length: 50 }, (_, i) => dotCoverage(i * .3, i * .7, 1.3, .3));
        expect(Math.max(...small) - Math.min(...small)).toBeLessThan(.00001);
        for (const period of [1.4, 2, 2.8, 3.645, 6, 10]) {
            let sum = 0;
            for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) sum += dotCoverage(x + .5, y + .5, period, .3);
            expect(Math.abs(sum / 25600 - Math.PI * .3 ** 2)).toBeLessThan(.03);
        }
    });
    it('can independently disable every layer and preserves neutral/highlight color', () => {
        const input = flat(128, 192, 180), zero = { dot: 6, density: 0, ink: 0, shift: 0, poster: 0 };
        expect(run(input, 128, 192, zero)).toEqual(input);
        expect(metrics(run(input, 128, 192, { ...zero, density: 100 }), input).mad).toBeGreaterThan(1);
        expect(metrics(run(input, 128, 192, { ...zero, poster: 100 }), input).mad).toBeGreaterThan(1);
        const withEdge = fixture(128, 192);
        expect(metrics(run(withEdge, 128, 192, { ...zero, ink: 100 }), withEdge).mad).toBeGreaterThan(0);
        const grey = run(input, 128, 192);
        for (let i = 0; i < grey.length; i += 4) { expect(grey[i]).toBe(grey[i + 1]); expect(grey[i]).toBe(grey[i + 2]); }
        const white = flat(128, 192, 255); expect(run(white, 128, 192)).toEqual(white);
    });
    it('has the requested vivid paper highlights and preserves saturated red hue', () => {
        const light = flat(64, 96, 200), settings = { ...defaultParams().halftone, density: 0, ink: 0 };
        const result = run(light, 64, 96, settings);
        expect(result[0]).toBeGreaterThan(220); expect(result[0]).toBeLessThan(255);
        expect(result[0]).toBe(result[1]); expect(result[1]).toBe(result[2]);
        const red = flat(64, 96, 0); for (let i = 0; i < red.length; i += 4) { red[i] = 220; red[i + 1] = 35; red[i + 2] = 25; }
        const vivid = run(red, 64, 96, settings);
        expect((vivid[0] - vivid[2]) / vivid[0]).toBeGreaterThanOrEqual((220 - 25) / 220);
        expect(vivid[1]).toBeGreaterThanOrEqual(vivid[2]);
    });
    it('is deterministic and avoids channel clipping on a red gradient', () => {
        const input = fixture(160, 240); expect(run(input, 160, 240)).toEqual(run(input, 160, 240));
        const ramp = flat(256, 16, 0);
        for (let i = 0; i < ramp.length; i += 4) { ramp[i] = 80 + (i / 4 % 256) * .65; ramp[i + 1] = 15; ramp[i + 2] = 12; }
        const fine = run(ramp, 256, 16), classic = halftone(ramp, 256, 16, defaultParams().halftone, 0, 0, 1);
        const clips = (data: Uint8ClampedArray) => { let count = 0; for (let i = 0; i < data.length; i += 4) if ([data[i], data[i + 1], data[i + 2]].some(v => v === 0 || v === 255)) count++; return count; };
        expect(clips(fine)).toBeLessThanOrEqual(clips(classic));
        for (let i = 0; i < fine.length; i += 4) { expect(fine[i]).toBeGreaterThan(fine[i + 1]); expect(fine[i + 1]).toBeGreaterThanOrEqual(fine[i + 2]); }
    });
    it('always dispatches the bold pop-art renderer without a version switch', () => {
        const src = fixture(128, 192), params = defaultParams().halftone;
        const req = { kind: 'render' as const, id: 1, tabId: 'a', revision: 1, mode: 'export' as const,
            width: 128, height: 192, ...ctx(128, 192), styleId: 'halftone' as const, params,
            global: { brightness: 0, contrast: 0, saturation: 0 } };
        const expected = popArt(src, 128, 192, params, ctx(128, 192));
        expect(new Uint8ClampedArray(render({ ...req, buffer: src.slice().buffer }))).toEqual(expected);
    });
    it('migrates all old snapshots directly to fine-pop parameters', () => {
        const raw = JSON.parse(JSON.stringify(initialSnapshot()));
        delete raw.styleVersions; delete raw.autoColor.algorithmVersion; delete raw.params.halftone.poster;
        const legacy = normalizeHistory({ entries: [raw, structuredClone(raw)], cursor: 0 });
        expect(legacy.entries.every(s => s.params.halftone.poster === 90 && s.autoColor.algorithmVersion === 1)).toBe(true);
        expect(normalizeHistory(legacy)).toEqual(legacy);
        expect(initialSnapshot().params.halftone).toEqual({ dot: 6, density: 45, ink: 55, shift: 0, poster: 90 });
    });
    for (const [w, h, tileSide] of [[387, 259, 137], [1927, 173, 677], [728, 972, 251]]) {
        it(`stitches at ${w}x${h} including maximum channel shift`, () => {
            const input = fixture(w, h), p = { ...defaultParams().halftone, shift: 6 }, full = run(input, w, h, p), stitched = new Uint8ClampedArray(input.length);
            const halo = 20;
            for (let top = 0; top < h; top += tileSide) for (let left = 0; left < w; left += tileSide) {
                const right = Math.min(w, left + tileSide), bottom = Math.min(h, top + tileSide);
                const sx = Math.max(0, left - halo), sy = Math.max(0, top - halo), ex = Math.min(w, right + halo), ey = Math.min(h, bottom + halo);
                const tw = ex - sx, th = ey - sy, tile = new Uint8ClampedArray(tw * th * 4);
                for (let y = sy; y < ey; y++) tile.set(input.subarray((y * w + sx) * 4, (y * w + ex) * 4), (y - sy) * tw * 4);
                const painted = halftoneV2(tile, tw, th, p, ctx(tw, th, sx, sy, w, h));
                for (let y = top; y < bottom; y++) stitched.set(painted.subarray(((y - sy) * tw + left - sx) * 4, ((y - sy) * tw + right - sx) * 4), (y * w + left) * 4);
            }
            expect(metrics(full, stitched)).toMatchObject({ mad: 0, max: 0 });
        });
    }
});
