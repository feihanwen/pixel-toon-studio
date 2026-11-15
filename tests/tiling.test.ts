import { describe, it, expect } from 'vitest';
import { defaultParams } from '../src/config/styles';
import { exportHalo } from '../src/imaging/exportHalo';
import { buildExportTiles, resolveExportConcurrency, runParallelPool } from '../src/imaging/export';
import { fixture, metrics, newStyles, processStyle } from './style-fixtures';

describe('new styles: global grid and export seams', () => {
    for (const id of ['pixel', ...newStyles] as const) for (const [w, h, tileSide] of [[387, 259, 137], [1927, 173, 677]]) {
        it(`${id}: ${w}x${h}, irregular tiles ${tileSide}`, () => {
            const source = fixture(w, h), params = { ...defaultParams()[id] };
            // Maximum support is important: halo must also be safe at slider endpoints.
            if (id === 'pixel') params.size = 16;
            if (id === 'film') { params.halation = 100; params.smear = 100; }
            if (id === 'pencil') params.stroke = 8;
            if (id === 'manga') params.dot = 12;
            const scale = Math.max(1, Math.max(w, h) / 1600), halo = exportHalo(id, params, scale, w, h);
            const full = processStyle(id, source, w, h, params), stitched = new Uint8ClampedArray(source.length);
            for (let top = 0; top < h; top += tileSide) for (let left = 0; left < w; left += tileSide) {
                const right = Math.min(w, left + tileSide), bottom = Math.min(h, top + tileSide);
                const sx = Math.max(0, left - halo), sy = Math.max(0, top - halo), ex = Math.min(w, right + halo), ey = Math.min(h, bottom + halo);
                const tw = ex - sx, th = ey - sy, tile = new Uint8ClampedArray(tw * th * 4);
                for (let y = sy; y < ey; y++) tile.set(source.subarray((y * w + sx) * 4, (y * w + ex) * 4), (y - sy) * tw * 4);
                const painted = processStyle(id, tile, tw, th, params, sx, sy, w, h);
                for (let y = top; y < bottom; y++) stitched.set(painted.subarray(((y - sy) * tw + left - sx) * 4, ((y - sy) * tw + right - sx) * 4), (y * w + left) * 4);
            }
            const diff = metrics(full, stitched);
            console.info(`${id} ${w}x${h} seam MAD ${diff.mad.toFixed(4)}, max ${diff.max}`);
            expect(diff.mad).toBeLessThan(.05);
            expect(diff.max).toBeLessThanOrEqual(2);
        });
    }

    it('schedules export tiles across a parallel worker pool with bounded concurrency', async () => {
        const tiles = buildExportTiles(3200, 2400, 24, 1536);
        expect(tiles).toHaveLength(6);
        expect(resolveExportConcurrency(1, 8)).toBe(1);
        expect(resolveExportConcurrency(6, 8)).toBe(4);
        expect(resolveExportConcurrency(6, 4)).toBe(2);

        let active = 0;
        let maxActive = 0;
        const visited: number[] = [];
        await runParallelPool(tiles, 3, async (tile, slot) => {
            expect(slot).toBeGreaterThanOrEqual(0);
            expect(slot).toBeLessThan(3);
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, 10));
            visited.push(tile.x + tile.y);
            active--;
        });
        expect(visited).toHaveLength(6);
        expect(maxActive).toBeGreaterThan(1);
        expect(maxActive).toBeLessThanOrEqual(3);
    });
});
