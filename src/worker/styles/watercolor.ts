import { WATERCOLOR_DIRECTION_BINS, WATERCOLOR_STYLE_SIDE } from '../../config/limits';
import { clamp, luminance } from '../shared/color';

interface Sample { dx: number; dy: number; sector: number; next: number; weight: number; near: boolean }
const kernels = new Map<string, Sample[]>();
const TAU = Math.PI * 2;

function kernel(radius: number, direction: number, stretchLevel: number): Sample[] {
    const key = `${radius}:${direction}:${stretchLevel}`;
    const cached = kernels.get(key);
    if (cached) return cached;
    const samples: Sample[] = [];
    const orientation = direction * TAU / WATERCOLOR_DIRECTION_BINS;
    const co = Math.cos(orientation), si = Math.sin(orientation);
    const stretch = 1 + stretchLevel * .22;
    for (let ring = 0; ring < 3; ring++) {
        const distance = radius * (ring === 0 ? .36 : ring === 1 ? .67 : 1.08);
        for (let angle = 0; angle < 16; angle++) {
            const theta = angle * TAU / 16;
            const ux = Math.cos(theta) * distance * stretch;
            const uy = Math.sin(theta) * distance / stretch;
            const phase = angle / 2;
            const sector = Math.floor(phase) % 8;
            samples.push({ dx: Math.round(ux * co - uy * si), dy: Math.round(ux * si + uy * co), sector, next: (sector + 1) % 8, weight: phase - Math.floor(phase), near: ring < 2 });
        }
    }
    kernels.set(key, samples);
    return samples;
}

function sampleBilinear(src: Uint8ClampedArray, w: number, h: number, x: number, y: number, channel: number): number {
    const xx = Math.max(0, Math.min(w - 1, x));
    const yy = Math.max(0, Math.min(h - 1, y));
    const x0 = Math.floor(xx), y0 = Math.floor(yy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = xx - x0, fy = yy - y0;
    const a = src[(y0 * w + x0) * 4 + channel] * (1 - fx) + src[(y0 * w + x1) * 4 + channel] * fx;
    const b = src[(y1 * w + x0) * 4 + channel] * (1 - fx) + src[(y1 * w + x1) * 4 + channel] * fx;
    return a * (1 - fy) + b * fy;
}

function smooth(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = 0, g = 0, b = 0, sum = 0;
        const centerLum = luminance(src[i], src[i + 1], src[i + 2]);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.max(0, Math.min(w - 1, x + dx));
            const yy = Math.max(0, Math.min(h - 1, y + dy));
            const j = (yy * w + xx) * 4;
            const colorDistance = Math.abs(centerLum - luminance(src[j], src[j + 1], src[j + 2]));
            const weight = (dx === 0 && dy === 0 ? 2 : dx === 0 || dy === 0 ? 1 : .7) / (1 + colorDistance * colorDistance / 900);
            r += src[j] * weight; g += src[j + 1] * weight; b += src[j + 2] * weight; sum += weight;
        }
        out[i] = r / sum; out[i + 1] = g / sum; out[i + 2] = b / sum; out[i + 3] = 255;
    }
    return out;
}

function paintedLayer(src: Uint8ClampedArray, w: number, h: number, radius: number, softness: number, detail: number, vibrance = 13, warmth = 28): Uint8ClampedArray {
    const prepared = smooth(smooth(src, w, h), w, h);
    const out = new Uint8ClampedArray(src.length);
    const lum = new Float32Array(w * h);
    for (let p = 0; p < lum.length; p++) {
        const i = p * 4;
        lum[p] = luminance(prepared[i], prepared[i + 1], prepared[i + 2]);
    }
    const gradientX = new Float32Array(w * h), gradientY = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        gradientX[p] = (lum[y * w + Math.min(w - 1, x + 1)] - lum[y * w + Math.max(0, x - 1)]) * .5;
        gradientY[p] = (lum[Math.min(h - 1, y + 1) * w + x] - lum[Math.max(0, y - 1) * w + x]) * .5;
    }
    const sums = Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => new Float64Array(8)));
    const candidates = new Float64Array(6);
    const q = .45 - softness * .0015;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x, i = p * 4;
        let jxx = 0, jyy = 0, jxy = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.max(0, Math.min(w - 1, x + dx)), yy = Math.max(0, Math.min(h - 1, y + dy));
            const q = yy * w + xx, gx = gradientX[q], gy = gradientY[q];
            jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
        }
        const gradient = Math.hypot(gradientX[p], gradientY[p]) * 2;
        const coherence = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / (jxx + jyy + 1);
        const orientation = .5 * Math.atan2(2 * jxy, jxx - jyy) + Math.PI / 2;
        const direction = ((Math.round(orientation * WATERCOLOR_DIRECTION_BINS / TAU) % WATERCOLOR_DIRECTION_BINS) + WATERCOLOR_DIRECTION_BINS) % WATERCOLOR_DIRECTION_BINS;
        const stretchLevel = gradient < 10 ? 0 : Math.min(2, Math.floor(coherence * 3));
        const points = kernel(radius, direction, stretchLevel);
        for (let scale = 0; scale < 2; scale++) for (let field = 0; field < 6; field++) sums[scale][field].fill(0);
        for (let k = 0; k < points.length; k++) {
            const point = points[k];
            const xx = Math.max(0, Math.min(w - 1, x + point.dx));
            const yy = Math.max(0, Math.min(h - 1, y + point.dy));
            const j = (yy * w + xx) * 4;
            const value = lum[yy * w + xx];
            const s0 = point.sector, s1 = point.next;
            const a = 1 - point.weight, b = point.weight;
            for (let scale = 0; scale < 2; scale++) {
                if (scale === 0 && !point.near) continue;
                const fields = sums[scale];
                fields[0][s0] += a; fields[0][s1] += b;
                fields[1][s0] += prepared[j] * a; fields[1][s1] += prepared[j] * b;
                fields[2][s0] += prepared[j + 1] * a; fields[2][s1] += prepared[j + 1] * b;
                fields[3][s0] += prepared[j + 2] * a; fields[3][s1] += prepared[j + 2] * b;
                fields[4][s0] += value * a; fields[4][s1] += value * b;
                fields[5][s0] += value * value * a; fields[5][s1] += value * value * b;
            }
        }
        for (let scale = 0; scale < 2; scale++) {
            const fields = sums[scale];
            let total = 0, rr = 0, gg = 0, bb = 0;
            for (let sector = 0; sector < 8; sector++) {
                const count = fields[0][sector];
                if (count <= 0) continue;
                const average = fields[4][sector] / count;
                const variance = Math.max(0, fields[5][sector] / count - average * average);
                const weight = 1 / Math.pow(9 + variance, q);
                rr += fields[1][sector] / count * weight;
                gg += fields[2][sector] / count * weight;
                bb += fields[3][sector] / count * weight;
                total += weight;
            }
            const offset = scale * 3;
            candidates[offset] = total ? rr / total : prepared[i];
            candidates[offset + 1] = total ? gg / total : prepared[i + 1];
            candidates[offset + 2] = total ? bb / total : prepared[i + 2];
        }
        const nearMix = Math.min(.82, .24 + gradient / 130);
        const fineDetail = Math.abs(luminance(src[i], src[i + 1], src[i + 2]) - lum[p]);
        const protection = Math.min(.42, detail / 100 * (Math.max(0, gradient - 5) / 45 + fineDetail / 25) * .55);
        const pigmentMix = .35 + softness / 100 * .15;
        const baseLum = candidates[0] * nearMix + candidates[3] * (1 - nearMix);
        const baseGreen = candidates[1] * nearMix + candidates[4] * (1 - nearMix);
        const baseBlue = candidates[2] * nearMix + candidates[5] * (1 - nearMix);
        const paintLum = luminance(baseLum, baseGreen, baseBlue);
        const pigmentLum = Math.round(paintLum / 24) * 24;
        const vibranceScale = 1 + vibrance / 100;
        const warmScale = warmth / 28;
        for (let channel = 0; channel < 3; channel++) {
            const abstractColor = candidates[channel] * nearMix + candidates[channel + 3] * (1 - nearMix);
            let painted = abstractColor + (pigmentLum - paintLum) * pigmentMix;
            painted = painted * (1 - protection) + prepared[i + channel] * protection;
            const wash = (channel === 0 ? 7 : channel === 1 ? 1 : -6) * warmScale;
            out[i + channel] = clamp(paintLum + (painted - paintLum) * vibranceScale + wash);
        }
        out[i + 3] = 255;
    }
    return out;
}

export function watercolor(src: Uint8ClampedArray, w: number, h: number, params: Record<string, number>, originX: number, originY: number, fullWidth: number, fullHeight: number): Uint8ClampedArray {
    const intensity = Math.max(0, Math.min(100, params.smear ?? 78)) / 100;
    if (intensity === 0) return new Uint8ClampedArray(src);
    const radius = Math.max(2, Math.min(18, Math.round(params.radius ?? 7)));
    const softness = Math.max(0, Math.min(100, params.softness ?? 62));
    const detail = Math.max(0, Math.min(100, params.detail ?? 55));
    const vibrance = Math.max(-50, Math.min(100, params.vibrance ?? 13));
    const warmth = Math.max(-100, Math.min(100, params.warmth ?? 28));
    const step = Math.max(1, Math.max(fullWidth, fullHeight) / WATERCOLOR_STYLE_SIDE);
    const gx0 = Math.floor(originX / step) - 2, gy0 = Math.floor(originY / step) - 2;
    const gx1 = Math.ceil((originX + w) / step) + 2, gy1 = Math.ceil((originY + h) / step) + 2;
    const sw = gx1 - gx0 + 1, sh = gy1 - gy0 + 1;
    const reduced = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const globalX = Math.max(0, Math.min(fullWidth - 1, (gx0 + x + .5) * step - .5));
        const globalY = Math.max(0, Math.min(fullHeight - 1, (gy0 + y + .5) * step - .5));
        const sx = globalX - originX, sy = globalY - originY, i = (y * sw + x) * 4;
        for (let c = 0; c < 3; c++) reduced[i + c] = sampleBilinear(src, w, h, sx, sy, c);
        reduced[i + 3] = 255;
    }
    const painted = paintedLayer(reduced, sw, sh, radius, softness, detail, vibrance, warmth);
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const lx = (originX + x + .5) / step - .5 - gx0;
        const ly = (originY + y + .5) / step - .5 - gy0;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) out[i + c] = clamp(src[i + c] * (1 - intensity) + sampleBilinear(painted, sw, sh, lx, ly, c) * intensity);
        out[i + 3] = 255;
    }
    return out;
}
