import type { StyleId } from '../config/styles';
import type { RenderRequest } from '../types/worker';
import { boxBlur } from '../worker/shared/blur';
import { clamp, luminance, smoothstep } from '../worker/shared/color';
import { rasterizeStrokes, refineMaskLocalEdgeAware } from './maskMath';

export function mosaicDiffusionRadius(strength: number, fullWidth: number, fullHeight: number): number {
    const s = Math.max(0, Math.min(100, strength)) / 100;
    if (s <= 0) return 0;
    const shortSide = Math.min(fullWidth, fullHeight);
    return Math.max(3, Math.round(shortSide * (0.006 + 0.015 * s)));
}

export function mosaicHalo(strength: number, fullWidth: number, fullHeight: number): number {
    const r = mosaicDiffusionRadius(strength, fullWidth, fullHeight);
    if (r <= 0) return 0;
    return r * 2 + 12;
}

/** Resolves a [0..1] tile-local mosaic mask from precomputed AI mask buffer or raw strokes. */
export function resolveTileMosaicMask(
    req: Pick<RenderRequest, 'width' | 'height' | 'originX' | 'originY' | 'fullWidth' | 'fullHeight' | 'mosaic'>,
    src: Uint8ClampedArray,
): Float32Array | null {
    const m = req.mosaic;
    if (!m || m.strength <= 0) return null;

    const { width: w, height: h, originX, originY, fullWidth, fullHeight } = req;
    if (m.maskBuffer && m.maskWidth > 0 && m.maskHeight > 0) {
        const bytes = new Uint8Array(m.maskBuffer);
        const mw = m.maskWidth;
        const mh = m.maskHeight;
        const mask = new Float32Array(w * h);
        let anyNonZero = false;
        const fw = Math.max(1, fullWidth);
        const fh = Math.max(1, fullHeight);
        for (let y = 0; y < h; y++) {
            const fy = ((originY + y + 0.5) / fh) * mh - 0.5;
            const y0 = Math.max(0, Math.min(mh - 1, Math.floor(fy)));
            const y1 = Math.max(0, Math.min(mh - 1, y0 + 1));
            const wy = Math.max(0, Math.min(1, fy - y0));
            const row = y * w;
            for (let x = 0; x < w; x++) {
                const fx = ((originX + x + 0.5) / fw) * mw - 0.5;
                const x0 = Math.max(0, Math.min(mw - 1, Math.floor(fx)));
                const x1 = Math.max(0, Math.min(mw - 1, x0 + 1));
                const wx = Math.max(0, Math.min(1, fx - x0));
                const v00 = bytes[y0 * mw + x0];
                const v10 = bytes[y0 * mw + x1];
                const v01 = bytes[y1 * mw + x0];
                const v11 = bytes[y1 * mw + x1];
                const v = ((v00 * (1 - wx) + v10 * wx) * (1 - wy) + (v01 * (1 - wx) + v11 * wx) * wy) / 255;
                if (v > 0.002) {
                    mask[row + x] = v;
                    anyNonZero = true;
                }
            }
        }
        return anyNonZero ? mask : null;
    }

    if (m.strokes?.length) {
        const raster = rasterizeStrokes(m.strokes, w, h);
        let any = false;
        for (let q = 0; q < raster.combined.length; q++) {
            if (raster.combined[q] > 0.002) {
                any = true;
                break;
            }
        }
        if (!any) return null;
        return refineMaskLocalEdgeAware(src, w, h, raster.combined);
    }

    return null;
}

function estimateLocalGrainSigma(src: Uint8ClampedArray, w: number, h: number, mask: Float32Array): number {
    let sumSq = 0;
    let count = 0;
    for (let y = 2; y < h - 2; y += 2) {
        for (let x = 2; x < w - 2; x += 2) {
            const q = y * w + x;
            if (mask[q] > 0.08) continue;
            const i = q * 4;
            const c = luminance(src[i], src[i + 1], src[i + 2]);
            const avg =
                (luminance(src[(q - 1) * 4], src[(q - 1) * 4 + 1], src[(q - 1) * 4 + 2]) +
                    luminance(src[(q + 1) * 4], src[(q + 1) * 4 + 1], src[(q + 1) * 4 + 2]) +
                    luminance(src[(q - w) * 4], src[(q - w) * 4 + 1], src[(q - w) * 4 + 2]) +
                    luminance(src[(q + w) * 4], src[(q + w) * 4 + 1], src[(q + w) * 4 + 2])) *
                0.25;
            const diff = Math.abs(c - avg);
            if (diff < 6) {
                sumSq += diff * diff;
                count++;
            }
        }
    }
    return count > 0 ? Math.sqrt(sumSq / count) : 1.4;
}

/**
 * Pre-style unobtrusive frosted mosaic & diffusion:
 * - Mask-normalized averaging prevents exterior dark hair/clothing from staining skin.
 * - Preserves broad 3D facial lighting and re-injects sensor-matched organic micro-grain.
 */
export function applyPreStyleMosaic(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    mask: Float32Array,
    strength: number,
    originX: number,
    originY: number,
    fullWidth: number,
    fullHeight: number,
): void {
    const s = Math.max(0, Math.min(100, strength)) / 100;
    if (s <= 0) return;

    const shortSide = Math.min(fullWidth, fullHeight);
    const cellSize = Math.max(3, Math.round(shortSide * (0.004 + 0.011 * s)));
    const blurR = mosaicDiffusionRadius(strength, fullWidth, fullHeight);
    const grainSigma = estimateLocalGrainSigma(src, w, h, mask);
    const grainAmp = Math.max(2.0, Math.min(5.8, grainSigma * 2.3));

    const len = w * h;
    const maskW = new Float32Array(len);
    for (let q = 0; q < len; q++) {
        maskW[q] = 0.002 + mask[q] * 0.998;
    }

    // Global-grid aligned soft cell mosaic (keeps tile exports aligned seamlessly)
    const gx0 = Math.floor(originX / cellSize);
    const gy0 = Math.floor(originY / cellSize);
    const gx1 = Math.floor((originX + w - 1) / cellSize);
    const gy1 = Math.floor((originY + h - 1) / cellSize);
    const gw = gx1 - gx0 + 1;
    const gh = gy1 - gy0 + 1;

    const cellRgb = new Float32Array(gw * gh * 3);
    const cellW = new Float32Array(gw * gh);

    for (let y = 0; y < h; y++) {
        const cy = Math.floor((originY + y) / cellSize) - gy0;
        const row = y * w;
        for (let x = 0; x < w; x++) {
            const cx = Math.floor((originX + x) / cellSize) - gx0;
            const q = row + x;
            const wt = maskW[q];
            const gIdx = cy * gw + cx;
            const i = q * 4;
            cellW[gIdx] += wt;
            cellRgb[gIdx * 3] += src[i] * wt;
            cellRgb[gIdx * 3 + 1] += src[i + 1] * wt;
            cellRgb[gIdx * 3 + 2] += src[i + 2] * wt;
        }
    }
    for (let i = 0; i < gw * gh; i++) {
        const wt = cellW[i] || 1;
        cellRgb[i * 3] /= wt;
        cellRgb[i * 3 + 1] /= wt;
        cellRgb[i * 3 + 2] /= wt;
    }

    const mosaicCh = [new Float32Array(len), new Float32Array(len), new Float32Array(len)];
    for (let y = 0; y < h; y++) {
        const fy = (originY + y + 0.5) / cellSize - 0.5 - gy0;
        const y0 = Math.max(0, Math.min(gh - 1, Math.floor(fy)));
        const y1 = Math.max(0, Math.min(gh - 1, y0 + 1));
        const wy = smoothstep(0.15, 0.85, Math.max(0, Math.min(1, fy - y0)));
        const row = y * w;
        for (let x = 0; x < w; x++) {
            const fx = (originX + x + 0.5) / cellSize - 0.5 - gx0;
            const x0 = Math.max(0, Math.min(gw - 1, Math.floor(fx)));
            const x1 = Math.max(0, Math.min(gw - 1, x0 + 1));
            const wx = smoothstep(0.15, 0.85, Math.max(0, Math.min(1, fx - x0)));
            const q = row + x;
            for (let c = 0; c < 3; c++) {
                const v00 = cellRgb[(y0 * gw + x0) * 3 + c];
                const v10 = cellRgb[(y0 * gw + x1) * 3 + c];
                const v01 = cellRgb[(y1 * gw + x0) * 3 + c];
                const v11 = cellRgb[(y1 * gw + x1) * 3 + c];
                const top = v00 * (1 - wx) + v10 * wx;
                const bot = v01 * (1 - wx) + v11 * wx;
                mosaicCh[c][q] = top * (1 - wy) + bot * wy;
            }
        }
    }

    const r2 = Math.max(1, Math.round(blurR * 0.75));
    const normW = boxBlur(boxBlur(maskW, w, h, blurR), w, h, r2);
    const diffused = [0, 1, 2].map(c => {
        const weighted = new Float32Array(len);
        for (let q = 0; q < len; q++) weighted[q] = src[q * 4 + c] * maskW[q];
        const blurred = boxBlur(boxBlur(weighted, w, h, blurR), w, h, r2);
        for (let q = 0; q < len; q++) blurred[q] /= Math.max(0.001, normW[q]);
        return blurred;
    });

    const mosaicRatio = 0.28;
    const strengthAlpha = smoothstep(0, 0.35, s);

    for (let y = 0; y < h; y++) {
        const gy = originY + y;
        const cy2 = Math.floor(gy / 2);
        const row = y * w;
        for (let x = 0; x < w; x++) {
            const q = row + x;
            const m = mask[q];
            if (m <= 0.001) continue;

            const gx = originX + x;
            const cx2 = Math.floor(gx / 2);
            const h1 = (((gx * 374761393 + gy * 668265263) ^ 0x5bf03635) >>> 0) / 4294967295 - 0.5;
            const h2 = (((cx2 * 1274126177 + cy2 * 2246822519) ^ 0x9e3779b9) >>> 0) / 4294967295 - 0.5;
            const grain = (h1 * 0.55 + h2 * 0.45) * grainAmp;

            const alpha = m * strengthAlpha;
            const i = q * 4;
            for (let c = 0; c < 3; c++) {
                const blended = diffused[c][q] * (1 - mosaicRatio) + mosaicCh[c][q] * mosaicRatio;
                src[i + c] = clamp(src[i + c] * (1 - alpha) + (blended + grain) * alpha);
            }
        }
    }
}

/**
 * Post-style Chroma Guard:
 * Preserves stylized luminance/texture (halftone dots, cel bands, paper hatch, film grain)
 * while smoothing erratic per-channel RGB quantization hue artifacts inside the masked zone.
 */
export function applyPostStyleChromaGuard(
    out: Uint8ClampedArray,
    w: number,
    h: number,
    mask: Float32Array,
    strength: number,
    styleId: StyleId,
    fullWidth: number,
    fullHeight: number,
): void {
    // Monochrome / strict two-color styles don't have RGB quantization hue glitches.
    if (styleId === 'manga' || styleId === 'duotone' || strength <= 0) return;

    const s = Math.max(0, Math.min(100, strength)) / 100;
    const len = w * h;
    const lum = new Float32Array(len);
    const weight = new Float32Array(len);
    const cr = [new Float32Array(len), new Float32Array(len), new Float32Array(len)];

    for (let q = 0; q < len; q++) {
        const i = q * 4;
        const l = luminance(out[i], out[i + 1], out[i + 2]);
        lum[q] = l;
        const m = mask[q];
        // Include pixels inside mask + a slight ring of clean surrounding skin/style tone
        const wt = 0.04 + 0.96 * m;
        weight[q] = wt;
        for (let c = 0; c < 3; c++) {
            cr[c][q] = (out[i + c] - l) * wt;
        }
    }

    const shortSide = Math.min(fullWidth, fullHeight);
    const radius = Math.max(4, Math.round(shortSide * (0.008 + 0.012 * s)));
    const normW = boxBlur(weight, w, h, radius);
    const smoothCr = cr.map(ch => {
        const b = boxBlur(ch, w, h, radius);
        for (let q = 0; q < len; q++) b[q] /= Math.max(0.001, normW[q]);
        return b;
    });

    // Stronger chroma smoothing for quantization-heavy styles (halftone, cel)
    const guardStrength = (styleId === 'halftone' || styleId === 'cel' ? 0.92 : 0.65) * smoothstep(0, 0.4, s);

    for (let q = 0; q < len; q++) {
        const m = mask[q];
        if (m <= 0.001) continue;
        const alpha = m * guardStrength;
        const i = q * 4;
        const l = lum[q];
        for (let c = 0; c < 3; c++) {
            const target = l + smoothCr[c][q];
            out[i + c] = clamp(out[i + c] * (1 - alpha) + target * alpha);
        }
    }
}
