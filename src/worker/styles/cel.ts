import { PREVIEW_SIDE } from '../../config/limits';
import { boxBlur } from '../shared/blur';
import { clamp, oklabToSrgbGamutSafe, smoothstep, SRGB_TO_LINEAR_LUT } from '../shared/color';
import { expandGrid, styleGrid, type StyleContext } from '../shared/sampling';

const INK_RGB = [24, 18, 22] as const;

interface OklabPlanes {
    L: Float32Array;
    A: Float32Array;
    B: Float32Array;
}

function toOklabPlanes(src: Uint8ClampedArray, n: number): OklabPlanes {
    const L = new Float32Array(n);
    const A = new Float32Array(n);
    const B = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        const i = q * 4;
        const lr = SRGB_TO_LINEAR_LUT[src[i]];
        const lg = SRGB_TO_LINEAR_LUT[src[i + 1]];
        const lb = SRGB_TO_LINEAR_LUT[src[i + 2]];
        const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
        const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
        const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
        L[q] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
        A[q] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        B[q] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    }
    return { L, A, B };
}

/**
 * Separable edge-preserving Oklab bilateral pass.
 * Weighting chroma (a, b) more strongly than lightness (L) flattens surface noise
 * and soft shading bumps while keeping hue boundaries (e.g., skin vs. background) sharp.
 */
function bilateralOklabPass(
    planes: OklabPlanes,
    w: number,
    h: number,
    radius: number,
    step: number,
    sigmaRange: number,
): OklabPlanes {
    const n = w * h;
    const tL = new Float32Array(n), tA = new Float32Array(n), tB = new Float32Array(n);
    const oL = new Float32Array(n), oA = new Float32Array(n), oB = new Float32Array(n);
    const { L, A, B } = planes;
    const invRange2 = 1 / (sigmaRange * sigmaRange);
    const spatial = new Float32Array(radius * 2 + 1);
    for (let k = -radius; k <= radius; k++) {
        spatial[k + radius] = 1 / (1 + (k / (radius + 1)) ** 2);
    }

    const margin = radius * step;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        const safeEnd = Math.max(margin, w - margin);
        for (let x = 0; x < w; x++) {
            const q = row + x;
            const l0 = L[q], a0 = A[q], b0 = B[q];
            let sL = 0, sA = 0, sB = 0, sw = 0;
            if (x >= margin && x < safeEnd) {
                for (let k = -radius; k <= radius; k++) {
                    const j = q + k * step;
                    const dL = L[j] - l0, da = A[j] - a0, db = B[j] - b0;
                    const dE2 = (dL * dL + 3.2 * (da * da + db * db)) * invRange2;
                    const wt = spatial[k + radius] / (1 + dE2 * dE2);
                    sL += L[j] * wt;
                    sA += A[j] * wt;
                    sB += B[j] * wt;
                    sw += wt;
                }
            } else {
                for (let k = -radius; k <= radius; k++) {
                    const nx = Math.max(0, Math.min(w - 1, x + k * step));
                    const j = row + nx;
                    const dL = L[j] - l0, da = A[j] - a0, db = B[j] - b0;
                    const dE2 = (dL * dL + 3.2 * (da * da + db * db)) * invRange2;
                    const wt = spatial[k + radius] / (1 + dE2 * dE2);
                    sL += L[j] * wt;
                    sA += A[j] * wt;
                    sB += B[j] * wt;
                    sw += wt;
                }
            }
            tL[q] = sL / sw;
            tA[q] = sA / sw;
            tB[q] = sB / sw;
        }
    }

    const safeYEnd = Math.max(margin, h - margin);
    for (let y = 0; y < h; y++) {
        const interiorY = y >= margin && y < safeYEnd;
        const row = y * w;
        for (let x = 0; x < w; x++) {
            const q = row + x;
            const l0 = tL[q], a0 = tA[q], b0 = tB[q];
            let sL = 0, sA = 0, sB = 0, sw = 0;
            if (interiorY) {
                for (let k = -radius; k <= radius; k++) {
                    const j = q + k * step * w;
                    const dL = tL[j] - l0, da = tA[j] - a0, db = tB[j] - b0;
                    const dE2 = (dL * dL + 3.2 * (da * da + db * db)) * invRange2;
                    const wt = spatial[k + radius] / (1 + dE2 * dE2);
                    sL += tL[j] * wt;
                    sA += tA[j] * wt;
                    sB += tB[j] * wt;
                    sw += wt;
                }
            } else {
                for (let k = -radius; k <= radius; k++) {
                    const ny = Math.max(0, Math.min(h - 1, y + k * step));
                    const j = ny * w + x;
                    const dL = tL[j] - l0, da = tA[j] - a0, db = tB[j] - b0;
                    const dE2 = (dL * dL + 3.2 * (da * da + db * db)) * invRange2;
                    const wt = spatial[k + radius] / (1 + dE2 * dE2);
                    sL += tL[j] * wt;
                    sA += tA[j] * wt;
                    sB += tB[j] * wt;
                    sw += wt;
                }
            }
            oL[q] = sL / sw;
            oA[q] = sA / sw;
            oB[q] = sB / sw;
        }
    }

    return { L: oL, A: oA, B: oB };
}

function sobelColorMagnitude(planes: OklabPlanes, w: number, h: number): Float32Array {
    const { L, A, B } = planes;
    const grad = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
            const q = row + x;
            const gLx = (-L[q - w - 1] + L[q - w + 1] - 2 * L[q - 1] + 2 * L[q + 1] - L[q + w - 1] + L[q + w + 1]) * 0.25;
            const gLy = (-L[q - w - 1] - 2 * L[q - w] - L[q - w + 1] + L[q + w - 1] + 2 * L[q + w] + L[q + w + 1]) * 0.25;
            const gAx = (-A[q - w - 1] + A[q - w + 1] - 2 * A[q - 1] + 2 * A[q + 1] - A[q + w - 1] + A[q + w + 1]) * 0.25;
            const gAy = (-A[q - w - 1] - 2 * A[q - w] - A[q - w + 1] + A[q + w - 1] + 2 * A[q + w] + A[q + w + 1]) * 0.25;
            const gBx = (-B[q - w - 1] + B[q - w + 1] - 2 * B[q - 1] + 2 * B[q + 1] - B[q + w - 1] + B[q + w + 1]) * 0.25;
            const gBy = (-B[q - w - 1] - 2 * B[q - w] - B[q - w + 1] + B[q + w - 1] + 2 * B[q + w] + B[q + w + 1]) * 0.25;
            grad[q] = Math.sqrt(
                gLx * gLx + gLy * gLy
                + 4.8 * (gAx * gAx + gAy * gAy + gBx * gBx + gBy * gBy),
            );
        }
    }
    return grad;
}

/**
 * Cel-shaded anime filter.
 * Flattens surface texture in Oklab, quantizes perceptual lightness with anti-aliased
 * steps while locking hue angle (preventing per-channel RGB green/pink skin artifacts),
 * and composites crisp Sobel + DoG anime ink outlines.
 */
export function cel(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    p: Record<string, number>,
    ctx?: StyleContext,
): Uint8ClampedArray {
    const grid = ctx ? styleGrid(src, w, h, ctx, PREVIEW_SIDE) : null;
    const workSrc = grid ? grid.data : src;
    const sw = grid ? grid.width : w;
    const sh = grid ? grid.height : h;
    const n = sw * sh;

    const pass1 = bilateralOklabPass(toOklabPlanes(workSrc, n), sw, sh, 4, 1, 0.085);
    const smoothed = bilateralOklabPass(pass1, sw, sh, 2, 1, 0.055);
    const { L, A, B } = smoothed;
    const gradE = sobelColorMagnitude(smoothed, sw, sh);
    const blur2 = boxBlur(L, sw, sh, 2);

    const levels = Math.max(2, Math.round(p.levels ?? 5));
    const protect = Math.max(0, Math.min(1, (p.background ?? 70) / 100));
    const baseBlend = Math.max(0, Math.min(1, (p.blend ?? 75) / 100));
    const satScale = Math.max(0, 1 + (p.colorPop ?? 0) / 100);
    const sens = Math.max(0, Math.min(1, (p.sensitivity ?? 48) / 100));
    const inkStrength = Math.max(0, Math.min(1, (p.ink ?? 65) / 100));

    const out = new Uint8ClampedArray(n * 4);

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const q = y * sw + x;
            const i = q * 4;
            const lRaw = Math.max(0, Math.min(1, L[q]));
            const interiorSmooth = 1 - smoothstep(0.015, 0.050, gradE[q]);
            const l0 = Math.max(0, Math.min(1, lRaw + (blur2[q] - lRaw) * (0.75 * interiorSmooth)));
            const a0 = A[q];
            const b0 = B[q];
            const chroma = Math.hypot(a0, b0);

            const bgToneMask = smoothstep(0.50, 0.75, l0) * (1 - smoothstep(0.03, 0.135, chroma));
            const flatMask = bgToneMask * (1 - smoothstep(0.015, 0.060, gradE[q]));

            // Gentle anime midtone lift + crisp anti-aliased Oklab lightness cel banding
            const lLift = Math.max(0, Math.min(1, l0 + 0.045 * Math.sin(Math.PI * l0)));
            const scaled = lLift * (levels - 1);
            const base = Math.floor(scaled);
            const frac = scaled - base;
            const qL = Math.min(1, (base + smoothstep(0.35, 0.65, frac)) / (levels - 1));
            const effBlend = Math.min(1, baseBlend * 1.15) * (1 - flatMask * protect * 0.70);
            const finalL = l0 * (1 - effBlend) + qL * effBlend;

            // Preserve hue angle while giving midtones/shadows clean anime chroma
            const animePop = 1 + 0.14 * effBlend * (1 - flatMask * protect);
            const lRatio = Math.max(0.75, Math.min(1.25, 0.92 + 0.08 * (finalL / Math.max(0.08, l0))));
            const chromaScale = satScale * animePop * lRatio;
            const [r, g, b] = oklabToSrgbGamutSafe(finalL, a0 * chromaScale, b0 * chromaScale);

            // Crisp thinned Sobel color-edge + narrow dark-valley anime ink lines
            let ink = 0;
            if (inkStrength > 0 && x >= 1 && y >= 1 && x < sw - 1 && y < sh - 1) {
                const edgeThresh = 0.012 + (1 - sens) * 0.042 + bgToneMask * protect * 0.045;
                const valleyThresh = 0.010 + (1 - sens) * 0.028 + bgToneMask * protect * 0.028;
                const edgeScore = smoothstep(edgeThresh, edgeThresh + 0.036, gradE[q]);
                const avgH = 0.5 * (gradE[q - 1] + gradE[q + 1]);
                const avgV = 0.5 * (gradE[q - sw] + gradE[q + sw]);
                const ridge = smoothstep(0.95, 1.24, gradE[q] / (Math.min(avgH, avgV) + 1e-4));
                const valley = Math.max(0, blur2[q] - L[q]);
                const valleyScore = smoothstep(valleyThresh, valleyThresh + 0.024, valley);
                ink = Math.max(edgeScore * (0.18 + 0.82 * ridge), valleyScore * 0.85) * inkStrength;
            }

            const inkMix = ink * 0.88;
            out[i] = clamp(r * (1 - inkMix) + INK_RGB[0] * inkMix);
            out[i + 1] = clamp(g * (1 - inkMix) + INK_RGB[1] * inkMix);
            out[i + 2] = clamp(b * (1 - inkMix) + INK_RGB[2] * inkMix);
            out[i + 3] = 255;
        }
    }

    return grid && ctx ? expandGrid(out, grid, w, h, ctx) : out;
}
