import { clamp, quantize } from '../shared/color';
export function pixel(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>, originX: number, originY: number, scale: number) {
    const size = Math.max(2, Math.round(p.size * scale)), gridW = Math.ceil(w / size) + 2, gridH = Math.ceil(h / size) + 2, grid = new Float32Array(gridW * gridH * 4), gx0 = Math.floor(originX / size) * size, gy0 = Math.floor(originY / size) * size;
    for (let gy = 0; gy < gridH; gy++)
        for (let gx = 0; gx < gridW; gx++) {
            const sx = gx0 + gx * size - originX, sy = gy0 + gy * size - originY;
            let count = 0, r = 0, g = 0, b = 0;
            for (let yy = Math.max(0, sy); yy < Math.min(h, sy + size); yy++)
                for (let xx = Math.max(0, sx); xx < Math.min(w, sx + size); xx++) {
                    const i = (yy * w + xx) * 4;
                    r += src[i];
                    g += src[i + 1];
                    b += src[i + 2];
                    count++;
                }
            const j = (gy * gridW + gx) * 4;
            if (count) {
                grid[j] = quantize(r / count, p.colors);
                grid[j + 1] = quantize(g / count, p.colors);
                grid[j + 2] = quantize(b / count, p.colors);
                grid[j + 3] = 1;
            }
        }
    const out = new Uint8ClampedArray(src.length), threshold = 35 + p.filter * .48;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const gx = Math.floor((originX + x - gx0) / size), gy = Math.floor((originY + y - gy0) / size), j = (gy * gridW + gx) * 4, i = (y * w + x) * 4;
            let edge = 0;
            if (gx > 0 && gy > 0) {
                const left = j - 4, up = j - gridW * 4;
                const diffL = Math.abs(grid[j] - grid[left]) + Math.abs(grid[j + 1] - grid[left + 1]) + Math.abs(grid[j + 2] - grid[left + 2]);
                const diffU = Math.abs(grid[j] - grid[up]) + Math.abs(grid[j + 1] - grid[up + 1]) + Math.abs(grid[j + 2] - grid[up + 2]);
                const localX = (originX + x - gx0) % size, localY = (originY + y - gy0) % size;
                if ((localX === 0 && diffL > threshold) || (localY === 0 && diffU > threshold))
                    edge = p.ink / 100;
            }
            for (let c = 0; c < 3; c++)
                out[i + c] = clamp(grid[j + c] * (1 - edge * .88) + edge * 12);
            out[i + 3] = 255;
        }
    return out;
}
