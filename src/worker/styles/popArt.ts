import { clamp, smoothstep } from '../shared/color';
import { inkAt, structure } from '../shared/edges';
import { sampleBilinear, type StyleContext } from '../shared/sampling';

/**
 * Bold American pop-art / comic print.
 *
 * Keeps the punchy per-channel posterized color-clash look, Ben-Day halftone dots,
 * and comic ink edges of the classic renderer, while applying a light edge-preserving
 * RGB denoise and soft-threshold quantization to reduce high-frequency speckles.
 */
export const POP_SCREEN_ANGLE = 0.32;
export const POP_LEVELS = 5;

export function popDotPeriod(dot: number, scale: number) {
    return Math.max(3, dot * Math.max(1, scale));
}

/** Anti-aliased dot coverage on a globally anchored rotated screen. */
export function popDotCoverage(x: number, y: number, period: number, radius: number) {
    const cos = Math.cos(POP_SCREEN_ANGLE), sin = Math.sin(POP_SCREEN_ANGLE);
    const rx = x * cos + y * sin, ry = -x * sin + y * cos;
    const dx = ((rx + period / 2) % period + period) % period - period / 2;
    const dy = ((ry + period / 2) % period + period) % period - period / 2;
    return 1 - smoothstep(radius - .6, radius + .6, Math.sqrt(dx * dx + dy * dy));
}

/**
 * Light separable edge-preserving RGB denoise (radius = 2) to calm sensor grain
 * and fabric micro-speckles before posterization without blurring real contours.
 */
function denoiseRgb(src: Uint8ClampedArray, w: number, h: number, sigma = 22): Uint8ClampedArray {
    const n = w * h;
    const tmp = new Float32Array(n * 3);
    const out = new Uint8ClampedArray(src.length);
    const invSigma2 = 1 / (sigma * sigma);
    const spatial = [0.45, 0.78, 1.0, 0.78, 0.45];

    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            const i = (row + x) * 4;
            const r0 = src[i], g0 = src[i + 1], b0 = src[i + 2];
            let sr = 0, sg = 0, sb = 0, sw = 0;
            for (let k = -2; k <= 2; k++) {
                const nx = Math.max(0, Math.min(w - 1, x + k));
                const j = (row + nx) * 4;
                const dr = src[j] - r0, dg = src[j + 1] - g0, db = src[j + 2] - b0;
                const d2 = (dr * dr + dg * dg + db * db) * (invSigma2 / 3);
                const wt = spatial[k + 2] / (1 + d2 * d2);
                sr += src[j] * wt;
                sg += src[j + 1] * wt;
                sb += src[j + 2] * wt;
                sw += wt;
            }
            const t = (row + x) * 3;
            tmp[t] = sr / sw;
            tmp[t + 1] = sg / sw;
            tmp[t + 2] = sb / sw;
        }
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const c0 = (y * w + x) * 3;
            const r0 = tmp[c0], g0 = tmp[c0 + 1], b0 = tmp[c0 + 2];
            let sr = 0, sg = 0, sb = 0, sw = 0;
            for (let k = -2; k <= 2; k++) {
                const ny = Math.max(0, Math.min(h - 1, y + k));
                const j = (ny * w + x) * 3;
                const dr = tmp[j] - r0, dg = tmp[j + 1] - g0, db = tmp[j + 2] - b0;
                const d2 = (dr * dr + dg * dg + db * db) * (invSigma2 / 3);
                const wt = spatial[k + 2] / (1 + d2 * d2);
                sr += tmp[j] * wt;
                sg += tmp[j + 1] * wt;
                sb += tmp[j + 2] * wt;
                sw += wt;
            }
            const o = (y * w + x) * 4;
            out[o] = clamp(sr / sw);
            out[o + 1] = clamp(sg / sw);
            out[o + 2] = clamp(sb / sw);
            out[o + 3] = 255;
        }
    }

    return out;
}

export function popArt(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    p: Record<string, number>,
    ctx: StyleContext,
    mosaicMask?: Float32Array | null,
) {
    const scale = Math.max(1, ctx.scale);
    const period = popDotPeriod(p.dot ?? 6, scale);
    const density = (p.density ?? 45) / 55;
    const inkStrength = (p.ink ?? 55) / 100;
    const shift = (p.shift ?? 0) * scale;
    // 0..90%: fade from photo to the classic poster; 90..100%: extra punch.
    const poster = Math.max(0, Math.min(1, (p.poster ?? 90) / 100));
    const mix = Math.min(1, poster / .9);
    const contrast = 1 + .24 * mix + .16 * Math.max(0, (poster - .9) / .1);
    const levels = Math.max(2, Math.round(p.levels ?? POP_LEVELS));

    if (poster === 0 && density === 0 && inkStrength === 0 && shift === 0) {
        const identity = new Uint8ClampedArray(src);
        for (let i = 3; i < identity.length; i += 4) identity[i] = 255;
        return identity;
    }

    const cleanSrc = poster > 0 || inkStrength > 0 ? denoiseRgb(src, w, h, 24) : src;
    const out = new Uint8ClampedArray(src.length);
    const { lum, sat, grad } = structure(cleanSrc, w, h);

    const step = 255 / (levels - 1);
    const lut = new Float32Array(256);
    for (let v = 0; v < 256; v++) {
        const boosted = clamp((v - 128) * contrast + 128);
        const scaled = boosted / step;
        const base = Math.floor(scaled);
        const qv = (base + smoothstep(0.42, 0.58, scaled - base)) * step;
        lut[v] = v + (qv - v) * mix;
    }

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const q = y * w + x, i = q * 4, l = lum[q], s = sat[q];
        const flat = l > 170 && s < .22 && grad[q] < 14;
        const gate = flat ? 0 : Math.max(0, Math.min(1, ((170 - l) / 80 + s * .7 + grad[q] / 100 - .27) * density));
        const radius = period * (.13 + .28 * gate);
        const spot = gate > 0 ? popDotCoverage(ctx.originX + x, ctx.originY + y, period, radius) * gate : 0;
        const ink = inkStrength > 0 ? inkAt(q, grad, lum, sat, w, h, 55, 80) * inkStrength : 0;
        const localShift = mosaicMask ? shift * (1 - mosaicMask[q]) : shift;
        const r = localShift ? sampleBilinear(cleanSrc, w, h, x + localShift, y, 0) : cleanSrc[i];
        const b = localShift ? sampleBilinear(cleanSrc, w, h, x - localShift, y, 2) : cleanSrc[i + 2];
        const channels = [r, cleanSrc[i + 1], b];
        for (let c = 0; c < 3; c++) {
            const v = lut[Math.max(0, Math.min(255, Math.round(channels[c])))];
            out[i + c] = clamp(v * (1 - spot * .6 - ink * .8) + spot * 25 + ink * 8);
        }
        out[i + 3] = 255;
    }
    return out;
}
