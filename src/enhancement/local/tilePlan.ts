export interface Tile { x: number; y: number; width: number; height: number }
export function tilePlan(width: number, height: number, tileSize = 128): Tile[] {
    if (![width, height, tileSize].every(v => Number.isInteger(v) && v > 0)) throw new Error('无效的分块尺寸');
    const tiles: Tile[] = [];
    for (let y = 0; y < height; y += tileSize) for (let x = 0; x < width; x += tileSize)
        tiles.push({ x, y, width: Math.min(tileSize, width - x), height: Math.min(tileSize, height - y) });
    return tiles;
}
export function reflect(index: number, size: number): number {
    if (size === 1) return 0;
    const period = 2 * (size - 1), n = ((index % period) + period) % period;
    return n < size ? n : period - n;
}
// The upstream model learns full-range Y; chroma is resized separately.
export function tileLuma(rgba: Uint8ClampedArray, width: number, height: number, tile: Tile, overlap: number) {
    const tw = tile.width + 2 * overlap, th = tile.height + 2 * overlap;
    const values = new Float32Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const i = (reflect(tile.y + y - overlap, height) * width + reflect(tile.x + x - overlap, width)) * 4;
        values[y * tw + x] = (.299 * rgba[i] + .587 * rgba[i + 1] + .114 * rgba[i + 2]) / 255;
    }
    return { values, width: tw, height: th };
}
