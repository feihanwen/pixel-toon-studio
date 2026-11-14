export interface StyleContext {
    originX: number;
    originY: number;
    fullWidth: number;
    fullHeight: number;
    scale: number;
}

export function sampleBilinear(src: Uint8ClampedArray, w: number, h: number, x: number, y: number, c: number): number {
    const xx = Math.max(0, Math.min(w - 1, x)), yy = Math.max(0, Math.min(h - 1, y));
    const x0 = Math.floor(xx), y0 = Math.floor(yy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = xx - x0, fy = yy - y0;
    return (src[(y0 * w + x0) * 4 + c] * (1 - fx) + src[(y0 * w + x1) * 4 + c] * fx) * (1 - fy)
        + (src[(y1 * w + x0) * 4 + c] * (1 - fx) + src[(y1 * w + x1) * 4 + c] * fx) * fy;
}

/** Align the working grid to the entire image, including tiles with fractional scale. */
export function styleGrid(src: Uint8ClampedArray, w: number, h: number, ctx: StyleContext, side: number) {
    const step = Math.max(1, Math.max(ctx.fullWidth, ctx.fullHeight) / side);
    const gx = Math.floor(ctx.originX / step) - 2, gy = Math.floor(ctx.originY / step) - 2;
    const width = Math.ceil((ctx.originX + w) / step) + 2 - gx + 1;
    const height = Math.ceil((ctx.originY + h) / step) + 2 - gy + 1;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const xx = Math.max(0, Math.min(ctx.fullWidth - 1, (gx + x + .5) * step - .5)) - ctx.originX;
        const yy = Math.max(0, Math.min(ctx.fullHeight - 1, (gy + y + .5) * step - .5)) - ctx.originY;
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) data[i + c] = sampleBilinear(src, w, h, xx, yy, c);
        data[i + 3] = 255;
    }
    return { data, width, height, gx, gy, step };
}

export function expandGrid(data: Uint8ClampedArray, grid: ReturnType<typeof styleGrid>, w: number, h: number, ctx: StyleContext): Uint8ClampedArray {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const xx = (ctx.originX + x + .5) / grid.step - .5 - grid.gx;
        const yy = (ctx.originY + y + .5) / grid.step - .5 - grid.gy;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) out[i + c] = sampleBilinear(data, grid.width, grid.height, xx, yy, c);
        out[i + 3] = 255;
    }
    return out;
}

export function edgeSmooth(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let red = 0, green = 0, blue = 0, total = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const j = (Math.max(0, Math.min(h - 1, y + dy)) * w + Math.max(0, Math.min(w - 1, x + dx))) * 4;
            const d = Math.abs(src[j] - src[i]) + Math.abs(src[j + 1] - src[i + 1]) + Math.abs(src[j + 2] - src[i + 2]);
            const weight = (dx || dy ? 1 : 2) / (1 + d * d / 1600);
            red += src[j] * weight; green += src[j + 1] * weight; blue += src[j + 2] * weight; total += weight;
        }
        out[i] = red / total; out[i + 1] = green / total; out[i + 2] = blue / total; out[i + 3] = 255;
    }
    return out;
}
