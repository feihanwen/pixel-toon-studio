import { clamp, smoothstep } from '../shared/color';
import { inkAt, structure } from '../shared/edges';
import { sampleBilinear, type StyleContext } from '../shared/sampling';

/**
 * Bold American pop-art / comic print.
 *
 * Restores the punchy look of the original renderer (per-channel 5-level posterization on a
 * contrast-boosted image, Ben-Day dots that grow in shadows and saturated areas, comic ink
 * edges), with tile-safe, anti-aliased dots and a continuous "色块强度" control.
 * References: Ben-Day / AM halftone screening; posterize + halftone pipelines used by
 * open-source pop-art filters (ImageMagick ordered-dither halftone, GravO8/halftone).
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

export function popArt(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    p: Record<string, number>,
    ctx: StyleContext,
    mosaicMask?: Float32Array | null,
) {
    const out = new Uint8ClampedArray(src.length), { lum, sat, grad } = structure(src, w, h);
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
    const step = 255 / (levels - 1);
    const lut = new Float32Array(256);
    for (let v = 0; v < 256; v++) {
        const boosted = clamp((v - 128) * contrast + 128);
        lut[v] = v + (Math.round(boosted / step) * step - v) * mix;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const q = y * w + x, i = q * 4, l = lum[q], s = sat[q];
        const flat = l > 170 && s < .22 && grad[q] < 14;
        const gate = flat ? 0 : Math.max(0, Math.min(1, ((170 - l) / 80 + s * .7 + grad[q] / 100 - .27) * density));
        const radius = period * (.13 + .28 * gate);
        const spot = gate > 0 ? popDotCoverage(ctx.originX + x, ctx.originY + y, period, radius) * gate : 0;
        const ink = inkStrength > 0 ? inkAt(q, grad, lum, sat, w, h, 55, 80) * inkStrength : 0;
        const localShift = mosaicMask ? shift * (1 - mosaicMask[q]) : shift;
        const r = localShift ? sampleBilinear(src, w, h, x + localShift, y, 0) : src[i];
        const b = localShift ? sampleBilinear(src, w, h, x - localShift, y, 2) : src[i + 2];
        const channels = [r, src[i + 1], b];
        for (let c = 0; c < 3; c++) {
            const v = lut[Math.max(0, Math.min(255, Math.round(channels[c])))];
            out[i + c] = clamp(v * (1 - spot * .6 - ink * .8) + spot * 25 + ink * 8);
        }
        out[i + 3] = 255;
    }
    return out;
}
