import { clamp, smoothstep } from '../shared/color';
import { sampleBilinear, type StyleContext } from '../shared/sampling';

export const HALFTONE_REFERENCE_SIDE = 1600;
export function halftonePeriod(dot: number, width: number, height: number) {
    return Math.max(.01, dot * Math.max(width, height) / HALFTONE_REFERENCE_SIDE);
}

/** Relative, globally anchored screen. Subpixel screens fade to their mean coverage. */
export function dotCoverage(x: number, y: number, period: number, radiusRatio: number) {
    const rx = x * .949235418 + y * .314566561, ry = -x * .314566561 + y * .949235418;
    const dx = ((rx + period / 2) % period + period) % period - period / 2;
    const dy = ((ry + period / 2) % period + period) % period - period / 2;
    const radius = period * radiusRatio;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const edge = Math.min(.65, period * .2);
    const coverage = 1 - smoothstep(radius - edge, radius + edge, distance);
    const resolved = smoothstep(1.4, 2.8, period);
    return coverage * resolved + Math.PI * radiusRatio * radiusRatio * (1 - resolved);
}

/** No RGB channel quantization: quantize luminance softly, keep chroma in gamut. */
export function halftoneV2(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>, ctx: StyleContext) {
    const out = new Uint8ClampedArray(src.length), n = w * h;
    const lum = new Float32Array(n);
    for (let q = 0; q < n; q++) { const i = q * 4; lum[q] = (src[i] * .2126 + src[i + 1] * .7152 + src[i + 2] * .0722) / 255; }
    const period = halftonePeriod(p.dot ?? 6, ctx.fullWidth, ctx.fullHeight);
    const k = Math.max(ctx.fullWidth, ctx.fullHeight) / HALFTONE_REFERENCE_SIDE;
    const shift = (p.shift ?? 0) * k, density = (p.density ?? 45) / 100;
    const inkStrength = (p.ink ?? 55) / 100, poster = (p.poster ?? 90) / 100;
    // A luminance LUT keeps full-resolution renders cheap and deterministic.
    const tones = new Float32Array(4097);
    for (let j = 0; j <= 4096; j++) {
        const value = j / 4096;
        const contrast = (value - .38) * .18 * smoothstep(.015, .16, value);
        const lift = .14 * smoothstep(.42, .85, value) * (1 - smoothstep(.88, 1, value));
        const shaped = Math.max(0, Math.min(1, value + contrast + lift));
        const scaled = shaped * 7, level = Math.floor(scaled);
        let quantized = (level + smoothstep(.42, .58, scaled - level)) / 7;
        // Paper-like highlights retain enough headroom for warm chroma, instead of clipping white.
        if (value < .94) quantized = Math.min(.94, quantized);
        const shadow = smoothstep(.015, .1, value);
        tones[j] = value + (quantized - value) * poster * shadow;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const q = y * w + x, i = q * 4;
        const r = (shift ? sampleBilinear(src, w, h, x + shift, y, 0) : src[i]) / 255;
        const g = src[i + 1] / 255;
        const b = (shift ? sampleBilinear(src, w, h, x - shift, y, 2) : src[i + 2]) / 255;
        const value = r * .2126 + g * .7152 + b * .0722;
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b), sat = hi > 0 ? (hi - lo) / hi : 0;
        // Broad, low-confidence warm-midrange protection, not face recognition.
        const warm = r > g && g > b ? smoothstep(.02, .12, r - b) * (1 - smoothstep(.5, .85, sat)) : 0;
        const protection = 1 - .1 * warm;
        const layered = value + (tones[Math.round(value * 4096)] - value) * protection;
        const primary = smoothstep(.5, .9, sat) * (1 - warm);
        const blendedTarget = layered * (1 - primary * .65) + value * (1 - .12 * poster) * primary * .65;
        // Leave a tiny channel headroom for colored areas: vivid color is not hard clipping.
        const margin = sat > .15 && value > .02 && value < .97 ? 1.5 / 255 : 0;
        const target = Math.max(margin, Math.min(1 - margin, blendedTarget));
        // Soft chroma planes create comic color areas without independently snapping RGB.
        const colorStrength = poster * (1 - .65 * warm) * (1 - smoothstep(.45, .75, sat));
        const co = r - b, cg = g - (r + b) * .5;
        const co2 = co + (softChroma(co) - co) * colorStrength;
        const cg2 = cg + (softChroma(cg) - cg) * colorStrength;
        // Recenter chroma around Rec.709 luminance.
        const cr = co2 * .5 - cg2 * .5, cb = -co2 * .5 - cg2 * .5, cgreen = cg2 * .5;
        const offset = cr * .2126 + cgreen * .7152 + cb * .0722;
        const dr = cr - offset, dg = cgreen - offset, db = cb - offset;
        let chroma = 1 + .5 * smoothstep(.25, .75, sat) * (1 - .7 * warm) * poster;
        chroma = Math.min(chroma, gamutLimit(dr, target, margin), gamutLimit(dg, target, margin), gamutLimit(db, target, margin));
        const darkness = 1 - smoothstep(.08, .82, value);
        const highlight = 1 - smoothstep(.68, .94, value);
        const radiusRatio = .1 + .22 * darkness;
        const coverage = density > 0 ? dotCoverage(ctx.originX + x + .5, ctx.originY + y + .5, period, radiusRatio) : 0;
        // Saturated shadows have little spare luminance: don't triple-stack darkness.
        const shadowLimit = .35 + .65 * smoothstep(.015, .18, value);
        const dots = coverage * density * .9 * highlight * shadowLimit;
        let edge = 0;
        if (inkStrength > 0 && x > 0 && x < w - 1 && y > 0 && y < h - 1) {
            const gx = (lum[q + 1] - lum[q - 1]) * .5, gy = (lum[q + w] - lum[q - w]) * .5;
            const gradient = Math.sqrt(gx * gx + gy * gy);
            edge = smoothstep(.055, .22, gradient) * inkStrength * .55 * shadowLimit;
        }
        const darken = (1 - dots) * (1 - edge);
        out[i] = clamp((target + dr * chroma) * darken * 255);
        out[i + 1] = clamp((target + dg * chroma) * darken * 255);
        out[i + 2] = clamp((target + db * chroma) * darken * 255);
        out[i + 3] = 255;
    }
    return out;
}

function gamutLimit(delta: number, target: number, margin: number) {
    return delta > 0 ? (1 - margin - target) / delta : delta < 0 ? (margin - target) / delta : Infinity;
}

function softChroma(value: number) {
    const scaled = value * 8, low = Math.floor(scaled);
    return (low + smoothstep(.25, .75, scaled - low)) / 8;
}
