import { PAPER_SEED, PENCIL_STYLE_SIDE } from '../../config/limits';
import { luminance, smoothstep } from '../shared/color';
import { boxBlur } from '../shared/blur';
import { edgeSmooth, expandGrid, styleGrid, type StyleContext } from '../shared/sampling';
import { linePattern, valueNoise } from '../shared/texture';

export function pencil(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>, ctx: StyleContext): Uint8ClampedArray {
    const grid = styleGrid(src, w, h, ctx, PENCIL_STYLE_SIDE);
    const { width: sw, height: sh, gx, gy } = grid;
    const prepared = edgeSmooth(edgeSmooth(grid.data, sw, sh), sw, sh);
    const n = sw * sh, lum = new Float32Array(n), dx = new Float32Array(n), dy = new Float32Array(n);
    for (let q = 0; q < n; q++) { const i = q * 4; lum[q] = luminance(prepared[i], prepared[i + 1], prepared[i + 2]); }
    const xx = new Float32Array(n), yy = new Float32Array(n), xy = new Float32Array(n);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const q = y * sw + x;
        const vx = (lum[y * sw + Math.min(sw - 1, x + 1)] - lum[y * sw + Math.max(0, x - 1)]) * .5;
        const vy = (lum[Math.min(sh - 1, y + 1) * sw + x] - lum[Math.max(0, y - 1) * sw + x]) * .5;
        dx[q] = vx; dy[q] = vy; xx[q] = vx * vx; yy[q] = vy * vy; xy[q] = vx * vy;
    }
    const jxx = boxBlur(xx, sw, sh, 2), jyy = boxBlur(yy, sw, sh, 2), jxy = boxBlur(xy, sw, sh, 2);
    const out = new Uint8ClampedArray(prepared.length), pigment = p.pigment / 100, paper = p.paper / 100;
    const spacing = 2 + p.stroke * .62;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const q = y * sw + x, i = q * 4, l = lum[q];
        const gradient = Math.hypot(dx[q], dy[q]);
        const coherence = Math.hypot(jxx[q] - jyy[q], 2 * jxy[q]) / (jxx[q] + jyy[q] + 1);
        const orientation = coherence > .2 ? .5 * Math.atan2(2 * jxy[q], jxx[q] - jyy[q]) + Math.PI / 2 : -.65;
        const angle = Math.round(orientation * 12 / Math.PI) * Math.PI / 12;
        const px = gx + x, py = gy + y;
        const jitter = (valueNoise(px, py, 1 / 7, PAPER_SEED + 7) - .5) * .7;
        const length = (px * Math.cos(angle) + py * Math.sin(angle)) / (4 + p.stroke * 2);
        const broken = .65 + .35 * smoothstep(.12, .42, ((length % 1) + 1) % 1);
        const stroke = linePattern(px + jitter, py, angle, spacing, .65 + p.stroke * .07) * broken;
        const cross = linePattern(px, py, angle + 1.1, spacing * 1.2, .6) * (1 - coherence) * .4;
        const darkness = 1 - l / 255;
        const hatch = Math.min(1, stroke + cross) * (.12 + darkness * .6) * pigment;
        const line = smoothstep(5, 48, gradient) * p.line / 100 * .7;
        const texture = paper > 0 ? ((valueNoise(px, py, .8, PAPER_SEED) - .5) * 15 + (valueNoise(px, py, .11, PAPER_SEED + 1) - .5) * 9) * paper : 0;
        const coverage = .48 + pigment * .46;
        for (let c = 0; c < 3; c++) {
            const basePaper = c === 0 ? 252 : c === 1 ? 248 : 237;
            const color = prepared[i + c] * coverage + basePaper * (1 - coverage);
            const drawn = color * (1 - hatch * .45 - line) + (prepared[i + c] * .35 + 12) * line + texture;
            const protection = smoothstep(14, 65, gradient) * .2;
            out[i + c] = drawn * (1 - protection) + grid.data[i + c] * protection;
        }
        out[i + 3] = 255;
    }
    return expandGrid(out, grid, w, h, ctx);
}
