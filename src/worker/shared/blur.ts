/** Sliding-window separable box blur: O(width * height), with clamped borders. */
export function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
    const r = Math.max(0, Math.round(radius));
    if (!r) return src.slice();
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), count = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let sum = src[row] * (r + 1);
        for (let x = 1; x <= r; x++) sum += src[row + Math.min(w - 1, x)];
        for (let x = 0; x < w; x++) {
            tmp[row + x] = sum / count;
            sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let sum = tmp[x] * (r + 1);
        for (let y = 1; y <= r; y++) sum += tmp[Math.min(h - 1, y) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = sum / count;
            sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
    return out;
}
