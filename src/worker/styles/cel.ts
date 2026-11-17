import { PREVIEW_SIDE } from '../../config/limits';
import { boxBlur } from '../shared/blur';
import { clamp, oklabToSrgbGamutSafe, smoothstep } from '../shared/color';
import { bilateralOklabPass, sobelColorMagnitude, toOklabPlanes } from '../shared/oklab';
import { expandGrid, styleGrid, type StyleContext } from '../shared/sampling';

const INK_RGB = [24, 18, 22] as const;

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
