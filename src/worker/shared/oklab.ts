import { SRGB_TO_LINEAR_LUT } from './color';

export interface OklabPlanes {
    L: Float32Array;
    A: Float32Array;
    B: Float32Array;
}

/** Converts an RGBA pixel buffer into separate perceptual Oklab planes. */
export function toOklabPlanes(src: Uint8ClampedArray, n: number): OklabPlanes {
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
export function bilateralOklabPass(
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

/** Computes a chroma-weighted Sobel edge magnitude over Oklab planes. */
export function sobelColorMagnitude(planes: OklabPlanes, w: number, h: number): Float32Array {
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
