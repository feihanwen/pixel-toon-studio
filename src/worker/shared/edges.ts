import { luminance, saturation } from './color';
export function structure(src: Uint8ClampedArray, w: number, h: number) { const n = w * h, lum = new Float32Array(n), sat = new Float32Array(n), grad = new Float32Array(n), local = new Float32Array(n); for (let p = 0; p < n; p++) {
    const i = p * 4;
    lum[p] = luminance(src[i], src[i + 1], src[i + 2]);
    sat[p] = saturation(src[i], src[i + 1], src[i + 2]);
} for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const gx = (lum[p + 1] - lum[p - 1]) * .5, gy = (lum[p + w] - lum[p - w]) * .5;
        grad[p] = Math.sqrt(gx * gx + gy * gy);
        local[p] = (Math.abs(lum[p - 1] - lum[p + 1]) + Math.abs(lum[p - w] - lum[p + w])) * .25;
    } return { lum, sat, grad, local }; }
export function inkAt(p: number, grad: Float32Array, lum: Float32Array, sat: Float32Array, w: number, h: number, sensitivity: number, background = 0) { const x = p % w, y = Math.floor(p / w); if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2)
    return 0; const flat = lum[p] > 165 && sat[p] < .22; const threshold = 17 + (100 - sensitivity) * .22 + (flat ? background * .28 : 0); const g = grad[p]; if (g < threshold)
    return 0; let neighbors = 0; for (const q of [p - 1, p + 1, p - w, p + w, p - w - 1, p + w + 1])
    if (grad[q] > threshold * .72)
        neighbors++; return neighbors >= 2 ? Math.min(1, (g - threshold) / 38) : 0; }
