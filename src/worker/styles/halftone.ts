import { clamp, quantize } from '../shared/color';
import { inkAt, structure } from '../shared/edges';
export function halftone(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>, originX: number, originY: number, scale: number) { const out = new Uint8ClampedArray(src.length), { lum, sat, grad } = structure(src, w, h), dot = Math.max(3, Math.round(p.dot * scale)), angle = .32, cos = Math.cos(angle), sin = Math.sin(angle); for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        const q = y * w + x, i = q * 4, l = lum[q], s = sat[q], flat = l > 170 && s < .22 && grad[q] < 14;
        const gate = flat ? 0 : Math.max(0, Math.min(1, ((170 - l) / 80 + s * .7 + grad[q] / 100 - .27) * p.density / 55));
        const rx = (originX + x) * cos + (originY + y) * sin, ry = -(originX + x) * sin + (originY + y) * cos;
        const dx = ((rx + dot / 2) % dot + dot) % dot - dot / 2, dy = ((ry + dot / 2) % dot + dot) % dot - dot / 2;
        const radius = dot * .13 + dot * .28 * gate;
        const spot = Math.sqrt(dx * dx + dy * dy) < radius ? gate : 0;
        const ink = inkAt(q, grad, lum, sat, w, h, 55, 80) * p.ink / 100;
        for (let c = 0; c < 3; c++) {
            const shift = Math.round(p.shift * scale);
            const sx = Math.max(0, Math.min(w - 1, x + (c === 0 ? shift : c === 2 ? -shift : 0)));
            const j = (y * w + sx) * 4 + c;
            const boosted = clamp((src[j] - 128) * 1.24 + 128);
            const poster = quantize(boosted, 5);
            out[i + c] = clamp(poster * (1 - spot * .6 - ink * .8) + spot * 25 + ink * 8);
        }
        out[i + 3] = 255;
    } return out; }
