import { describe, expect, it } from 'vitest';
import { defaultParams, STYLES } from '../src/config/styles';
import { exportHalo } from '../src/imaging/exportHalo';
import { rgbToOklab } from '../src/worker/shared/color';
import { fixture, flat, metrics, processStyle } from './style-fixtures';

describe('cel-shaded anime style', () => {
    it('preserves warm skin and beige hues without green or pink quantization artifacts', () => {
        const w = 128, h = 64;
        const src = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
            const t = y / (h - 1);
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                if (x < w / 2) {
                    // Warm skin shadow-to-highlight gradient (R > G > B)
                    src[i] = Math.round(135 + t * 105);
                    src[i + 1] = Math.round(98 + t * 92);
                    src[i + 2] = Math.round(74 + t * 76);
                } else {
                    // Warm beige fabric gradient (close RGB channels, R > G > B)
                    src[i] = Math.round(115 + t * 95);
                    src[i + 1] = Math.round(104 + t * 88);
                    src[i + 2] = Math.round(90 + t * 80);
                }
                src[i + 3] = 255;
            }
        }

        const out = processStyle('cel', src, w, h, defaultParams().cel);
        for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
                if (Math.abs(x - w / 2) <= 3) continue; // skip center seam outline
                const i = (y * w + x) * 4;
                const r = out[i], g = out[i + 1], b = out[i + 2];
                // Must never flip green >= red or collapse blue above green on warm skin/beige
                expect(r, `pixel (${x},${y}) r=${r} g=${g} b=${b}`).toBeGreaterThan(g);
                expect(g, `pixel (${x},${y}) r=${r} g=${g} b=${b}`).toBeGreaterThanOrEqual(b);

                const [, aIn, bIn] = rgbToOklab(src[i], src[i + 1], src[i + 2]);
                const [, aOut, bOut] = rgbToOklab(r, g, b);
                const hueCos = (aIn * aOut + bIn * bOut) / (Math.hypot(aIn, bIn) * Math.hypot(aOut, bOut) + 1e-6);
                expect(hueCos, `hue angle flipped at (${x},${y})`).toBeGreaterThan(0.92);
            }
        }
    });

    it('keeps uniform neutral surfaces neutral without spurious ink speckles', () => {
        const uniform = flat(64, 64, 150);
        const out = processStyle('cel', uniform, 64, 64, defaultParams().cel);
        for (let i = 0; i < out.length; i += 4) {
            expect(out[i]).toBe(out[i + 1]);
            expect(out[i + 1]).toBe(out[i + 2]);
        }
    });

    it('has strong independent effects for every cel slider parameter', () => {
        const source = fixture(96, 72);
        const celParams = defaultParams().cel;
        for (const [key, spec] of Object.entries(STYLES.cel.params)) {
            const a = processStyle('cel', source, 96, 72, { ...celParams, [key]: spec.min });
            const b = processStyle('cel', source, 96, 72, { ...celParams, [key]: spec.max });
            expect(metrics(a, b).mad, `cel.${key}`).toBeGreaterThan(0.12);
        }
    });

    it('renders seamlessly across irregular export tiles', () => {
        const w = 387, h = 259, tileSide = 137;
        const source = fixture(w, h);
        const params = { ...defaultParams().cel };
        const scale = Math.max(1, Math.max(w, h) / 1600);
        const halo = exportHalo('cel', params, scale, w, h);
        const full = processStyle('cel', source, w, h, params);
        const stitched = new Uint8ClampedArray(source.length);

        for (let top = 0; top < h; top += tileSide) {
            for (let left = 0; left < w; left += tileSide) {
                const right = Math.min(w, left + tileSide);
                const bottom = Math.min(h, top + tileSide);
                const sx = Math.max(0, left - halo);
                const sy = Math.max(0, top - halo);
                const ex = Math.min(w, right + halo);
                const ey = Math.min(h, bottom + halo);
                const tw = ex - sx, th = ey - sy;
                const tile = new Uint8ClampedArray(tw * th * 4);
                for (let y = sy; y < ey; y++) {
                    tile.set(source.subarray((y * w + sx) * 4, (y * w + ex) * 4), (y - sy) * tw * 4);
                }
                const painted = processStyle('cel', tile, tw, th, params, sx, sy, w, h);
                for (let y = top; y < bottom; y++) {
                    stitched.set(
                        painted.subarray(((y - sy) * tw + left - sx) * 4, ((y - sy) * tw + right - sx) * 4),
                        (y * w + left) * 4,
                    );
                }
            }
        }
        const diff = metrics(full, stitched);
        expect(diff.mad).toBeLessThan(0.05);
        expect(diff.max).toBeLessThanOrEqual(2);
    });

    it('renders 1600x1200 preview in reasonable time', () => {
        const source = fixture(1600, 1200);
        const start = performance.now();
        const out = processStyle('cel', source, 1600, 1200);
        const elapsed = performance.now() - start;
        console.info(`cel 1600x1200: ${Math.round(elapsed)} ms`);
        expect(out).toHaveLength(source.length);
    }, 30000);
});
