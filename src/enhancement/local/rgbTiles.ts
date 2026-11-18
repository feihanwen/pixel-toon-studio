import { currentMsg } from '../../config/errors';
import { reflect, type Tile } from './tilePlan';

export function rgbTilePlan(width: number, height: number, side: number, blend: number): Tile[] {
    if (![width, height, side].every(n => Number.isInteger(n) && n > 0) || !Number.isInteger(blend) || blend < 0 || side <= blend * 2) {
        throw new Error(currentMsg('无效的 RGB 分块尺寸', 'Invalid RGB tile dimensions'));
    }
    const tiles: Tile[] = [], stride = side - blend * 2;
    for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride)
        tiles.push({ x, y, width: Math.min(side, width - x), height: Math.min(side, height - y) });
    return tiles;
}
export function tileRgb(rgba: Uint8ClampedArray, width: number, height: number, tile: Tile, halo: number) {
    const w = tile.width + 2 * halo, h = tile.height + 2 * halo, plane = w * h;
    const values = new Float32Array(plane * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (reflect(tile.y + y - halo, height) * width + reflect(tile.x + x - halo, width)) * 4;
        const a = rgba[i + 3] / 255;
        for (let c = 0; c < 3; c++) values[c * plane + y * w + x] = (rgba[i + c] / 255) * a + 1 - a;
    }
    return { values, width: w, height: h };
}
function feather(position: number, length: number, ramp: number, low: boolean, high: boolean) {
    const fade = (distance: number) => .5 - .5 * Math.cos(Math.PI * Math.min(1, (distance + .5) / ramp));
    return (low ? fade(position) : 1) * (high ? fade(length - 1 - position) : 1);
}
export function accumulateTile(sums: Float32Array, weights: Float32Array, data: Float32Array,
    width: number, height: number, tile: Tile, halo: number, scale: number, blend: number) {
    const iw = (tile.width + halo * 2) * scale, ih = (tile.height + halo * 2) * scale, plane = iw * ih;
    if (data.length !== plane * 3) throw new Error(currentMsg('模型输出尺寸异常', 'Unexpected model output dimensions'));
    const tw = tile.width * scale, th = tile.height * scale, ow = width * scale;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const weight = feather(x, tw, blend * scale * 2, tile.x > 0, tile.x + tile.width < width)
            * feather(y, th, blend * scale * 2, tile.y > 0, tile.y + tile.height < height);
        const src = (y + halo * scale) * iw + x + halo * scale;
        const dst = (tile.y * scale + y) * ow + tile.x * scale + x;
        for (let c = 0; c < 3; c++) {
            const value = data[c * plane + src];
            if (!Number.isFinite(value)) throw new Error(currentMsg('模型输出包含无效像素', 'Model output contains invalid pixel values'));
            sums[dst * 3 + c] += value * weight;
        }
        weights[dst] += weight;
    }
}
function cubic(x: number) {
    const t = Math.abs(x);
    return t <= 1 ? 1.5 * t ** 3 - 2.5 * t ** 2 + 1 : t < 2 ? -.5 * t ** 3 + 2.5 * t ** 2 - 4 * t + 2 : 0;
}
// Anti-aliased Catmull-Rom resampling in global coordinates after native-scale fusion.
// Native x2 stays at the same grid; a native x1 denoiser uses true bicubic x2 enlargement.
export function finishRgb(sums: Float32Array, weights: Float32Array, rgba: Uint8ClampedArray, width: number, height: number, nativeScale: number) {
    const iw = width * nativeScale, ih = height * nativeScale, ow = width * 2, oh = height * 2;
    for (let i = 0; i < weights.length; i++) {
        if (!(weights[i] > 0)) throw new Error(currentMsg('分块输出有未覆盖像素', 'Tiled output has uncovered pixels'));
        for (let c = 0; c < 3; c++) sums[i * 3 + c] /= weights[i];
    }
    const output = new Uint8ClampedArray(ow * oh * 4), ratio = nativeScale / 2, support = Math.max(1, ratio);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
        const sx = (x + .5) * ratio - .5, sy = (y + .5) * ratio - .5;
        const rgb = [0, 0, 0]; let total = 0;
        for (let yy = Math.ceil(sy - 2 * support); yy <= sy + 2 * support; yy++) for (let xx = Math.ceil(sx - 2 * support); xx <= sx + 2 * support; xx++) {
            const w = cubic((xx - sx) / support) * cubic((yy - sy) / support);
            if (!w) continue;
            const i = (Math.max(0, Math.min(ih - 1, yy)) * iw + Math.max(0, Math.min(iw - 1, xx))) * 3;
            for (let c = 0; c < 3; c++) rgb[c] += sums[i + c] * w;
            total += w;
        }
        const ax = (x + .5) / 2 - .5, ay = (y + .5) / 2 - .5;
        let alpha = 0, aw = 0;
        for (let yy = Math.floor(ay) - 1; yy <= Math.floor(ay) + 2; yy++) for (let xx = Math.floor(ax) - 1; xx <= Math.floor(ax) + 2; xx++) {
            const w = cubic(xx - ax) * cubic(yy - ay);
            alpha += rgba[(Math.max(0, Math.min(height - 1, yy)) * width + Math.max(0, Math.min(width - 1, xx))) * 4 + 3] / 255 * w; aw += w;
        }
        alpha = Math.max(0, Math.min(1, alpha / aw));
        const dst = (y * ow + x) * 4;
        for (let c = 0; c < 3; c++) output[dst + c] = alpha > 1 / 255 ? (rgb[c] / total - (1 - alpha)) / alpha * 255 : 0;
        output[dst + 3] = alpha * 255;
    }
    return output;
}
