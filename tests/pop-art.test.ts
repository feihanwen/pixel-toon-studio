import { describe, expect, it } from 'vitest';
import { defaultParams, STYLES } from '../src/config/styles';
import { exportHalo } from '../src/imaging/exportHalo';
import { clamp } from '../src/worker/shared/color';
import { popArt } from '../src/worker/styles/popArt';
import { fixture, flat, metrics, processStyle } from './style-fixtures';

describe('bold pop-art halftone style', () => {
    it('keeps pop-art color-block contrast while reducing high-frequency speckles on noisy gradients', () => {
        const w = 128, h = 64;
        const noisy = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
            const t = y / (h - 1);
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                // Deterministic pseudo-random grain (+/-12) over a warm pink-to-shadow ramp
                const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                const grain = ((hash - Math.floor(hash)) - 0.5) * 24;
                noisy[i] = clamp(150 + t * 75 + grain);
                noisy[i + 1] = clamp(95 + t * 75 - grain * 0.7);
                noisy[i + 2] = clamp(110 + t * 65 + grain * 0.5);
                noisy[i + 3] = 255;
            }
        }

        const params = { ...defaultParams().halftone, density: 0, ink: 0 };
        const out = processStyle('halftone', noisy, w, h, params);

        // Compare pixel-to-pixel high-frequency jumps against raw hard posterize
        let outDiff = 0, rawDiff = 0;
        const step = 255 / 4;
        const rawLut = (v: number) => Math.round(clamp((v - 128) * 1.24 + 128) / step) * step;
        for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
                const i = (y * w + x) * 4;
                const j = (y * w + x + 1) * 4;
                for (let c = 0; c < 3; c++) {
                    outDiff += Math.abs(out[i + c] - out[j + c]);
                    rawDiff += Math.abs(rawLut(noisy[i + c]) - rawLut(noisy[j + c]));
                }
            }
        }
        expect(outDiff).toBeLessThan(rawDiff * 0.65);
    });

    it('keeps neutrals strictly neutral and returns identity when all controls are zero', () => {
        const grey = flat(64, 64, 150);
        const styledGrey = processStyle('halftone', grey, 64, 64, defaultParams().halftone);
        for (let i = 0; i < styledGrey.length; i += 4) {
            expect(styledGrey[i]).toBe(styledGrey[i + 1]);
            expect(styledGrey[i + 1]).toBe(styledGrey[i + 2]);
        }

        const input = fixture(64, 48);
        const identity = processStyle('halftone', input, 64, 48, {
            dot: 6, density: 0, ink: 0, shift: 0, poster: 0, levels: 5,
        });
        expect(identity).toEqual(input);
    });

    it('keeps bright flat highlights clean while applying halftone dots to shadows and vivid colors', () => {
        const w = 64, h = 64;
        const bright = flat(w, h, 240);
        const cleanBright = processStyle('halftone', bright, w, h, defaultParams().halftone);
        for (let i = 4; i < cleanBright.length; i += 4) {
            expect(cleanBright[i]).toBe(cleanBright[0]);
        }

        const midColor = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < midColor.length; i += 4) {
            midColor[i] = 195; midColor[i + 1] = 95; midColor[i + 2] = 110; midColor[i + 3] = 255;
        }
        const dotted = processStyle('halftone', midColor, w, h, { ...defaultParams().halftone, ink: 0 });
        let minVal = 255, maxVal = 0;
        for (let i = 0; i < dotted.length; i += 4) {
            minVal = Math.min(minVal, dotted[i]);
            maxVal = Math.max(maxVal, dotted[i]);
        }
        expect(maxVal - minVal).toBeGreaterThan(25);
    });

    it('has observable independent effects for every parameter and handles edge dimensions', () => {
        const source = fixture(128, 96);
        const base = defaultParams().halftone;
        for (const [key, spec] of Object.entries(STYLES.halftone.params)) {
            const a = processStyle('halftone', source, 128, 96, { ...base, [key]: spec.min });
            const b = processStyle('halftone', source, 128, 96, { ...base, [key]: spec.max });
            expect(metrics(a, b).mad, `halftone.${key}`).toBeGreaterThan(0.15);
        }

        for (const [w, h] of [[1, 1], [1, 17], [17, 1]]) {
            const out = popArt(fixture(w, h), w, h, base, {
                originX: 0, originY: 0, fullWidth: w, fullHeight: h, scale: 1,
            });
            expect(out.length).toBe(w * h * 4);
            expect(out[3]).toBe(255);
        }
    });

    it('renders seamlessly across irregular export tiles including large scale and max shift', () => {
        for (const [w, h, tileSide] of [[387, 259, 137], [1927, 173, 677]]) {
            const source = fixture(w, h);
            const params = { ...defaultParams().halftone, shift: 14 };
            const scale = Math.max(1, Math.max(w, h) / 1600);
            const halo = exportHalo('halftone', params, scale, w, h);
            const full = processStyle('halftone', source, w, h, params);
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
                    const painted = processStyle('halftone', tile, tw, th, params, sx, sy, w, h);
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
        }
    });
});
