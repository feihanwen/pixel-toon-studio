import { PREVIEW_SIDE } from '../../config/limits';
import { boxBlur } from '../shared/blur';
import { smoothstep } from '../shared/color';
import { structure, inkAt } from '../shared/edges';
import { dotPattern, linePattern } from '../shared/texture';
import { edgeSmooth, expandGrid, styleGrid, type StyleContext } from '../shared/sampling';

export function manga(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>, ctx: StyleContext): Uint8ClampedArray {
    const grid = styleGrid(src, w, h, ctx, PREVIEW_SIDE);
    const { width: sw, height: sh, gx, gy } = grid;
    const prepared = edgeSmooth(grid.data, sw, sh), { lum, sat, grad } = structure(prepared, sw, sh);
    const localMean = boxBlur(lum, sw, sh, 4);
    const out = new Uint8ClampedArray(prepared.length), protect = p.white / 100, levels = Math.max(2, Math.round(p.levels ?? 4));
    const contrast = 1 + (p.contrast ?? 0) / 100;
    const hatchStrength = Math.max(0, Math.min(1, (p.hatch ?? 65) / 100));
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const q = y * sw + x, i = q * 4, l = lum[q];
        const flatLight = smoothstep(145, 230, l) * (1 - smoothstep(5, 24, grad[q]));
        const white = flatLight * protect;
        const rawTone = Math.max(0, Math.min(1, (l + (l - localMean[q]) * .25 - 12) / 231));
        const tone = contrast === 1 ? rawTone : Math.max(0, Math.min(1, (rawTone - 0.5) * contrast + 0.5));
        const quantized = Math.round(tone * (levels - 1)) / (levels - 1);
        const base = 242 * (.36 + .64 * quantized) + 13;
        const coverage = (1 - tone) * .58 * (1 - white);
        const dot = dotPattern(gx + x, gy + y, Math.PI / 4, p.dot, coverage);
        const hatch = hatchStrength > 0 && tone < .3 ? linePattern(gx + x, gy + y, -Math.PI / 4, p.dot * .8, .7) * (1 - tone / .3) : 0;
        const ink = inkAt(q, grad, lum, sat, sw, sh, 68, p.white) * p.ink / 100;
        const paper = base * (1 - white) + 255 * white;
        const value = paper * (1 - dot * .82) * (1 - hatch * hatchStrength) * (1 - ink * .96);
        out[i] = out[i + 1] = out[i + 2] = value;
        out[i + 3] = 255;
    }
    return expandGrid(out, grid, w, h, ctx);
}
