import { clamp, quantize } from '../shared/color';
import { inkAt, structure } from '../shared/edges';
export function cel(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>) { const out = new Uint8ClampedArray(src.length), { lum, sat, grad } = structure(src, w, h); const levels = p.levels, protect = p.background / 100; for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        const q = y * w + x, i = q * 4, flat = lum[q] > 155 && sat[q] < .19 && grad[q] < 15;
        for (let c = 0; c < 3; c++) {
            let sum = 0, weight = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = Math.max(0, Math.min(w - 1, x + dx)), ny = Math.max(0, Math.min(h - 1, y + dy)), j = (ny * w + nx) * 4;
                    const d = Math.abs(src[j] - src[i]) + Math.abs(src[j + 1] - src[i + 1]) + Math.abs(src[j + 2] - src[i + 2]);
                    const wt = d < 55 ? 1 : .15;
                    sum += src[j + c] * wt;
                    weight += wt;
                }
            const smooth = sum / weight;
            const quant = quantize(smooth, levels);
            const blend = flat ? Math.max(0, .72 - protect * .66) : .75;
            out[i + c] = clamp(smooth * (1 - blend) + quant * blend);
        }
        const ink = inkAt(q, grad, lum, sat, w, h, p.sensitivity, p.background) * p.ink / 100 * (flat ? .3 : 1);
        for (let c = 0; c < 3; c++)
            out[i + c] = clamp(out[i + c] * (1 - ink * .85) + ink * 13);
        out[i + 3] = 255;
    } return out; }
