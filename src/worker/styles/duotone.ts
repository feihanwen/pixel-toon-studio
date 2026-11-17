import { PREVIEW_SIDE } from '../../config/limits';
import { boxBlur } from '../shared/blur';
import { hslToRgb, relativeLuminance, smoothstep } from '../shared/color';
import { structure } from '../shared/edges';
import { edgeSmooth, expandGrid, styleGrid, type StyleContext } from '../shared/sampling';

export function duotonePalette(shadowHue: number, highlightHue: number, saturation = 75) {
    const satScale = Math.max(0, Math.min(1.25, saturation / 75));
    const darkSat = Math.min(1, 0.72 * satScale);
    const lightSat = Math.min(1, 0.8 * satScale);
    let dark = hslToRgb(shadowHue, darkSat, .22), light = hslToRgb(highlightHue, lightSat, .82);
    if (relativeLuminance(light) - relativeLuminance(dark) < .35) {
        dark = hslToRgb(shadowHue, darkSat, .12);
        light = hslToRgb(highlightHue, lightSat, .92);
    }
    return { dark, light };
}

export function duotone(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>, ctx: StyleContext): Uint8ClampedArray {
    const grid = styleGrid(src, w, h, ctx, PREVIEW_SIDE);
    const prepared = edgeSmooth(grid.data, grid.width, grid.height);
    const { lum, grad } = structure(prepared, grid.width, grid.height), out = new Uint8ClampedArray(prepared.length);
    const localMean = boxBlur(lum, grid.width, grid.height, 5);
    const { dark, light } = duotonePalette(p.shadowHue, p.highlightHue, p.saturation ?? 75);
    const threshold = .2 + p.split * .006, detail = p.detail / 100;
    const contrast = Math.max(0.4, 1 + (p.contrast ?? 15) / 100);
    const band = .015 + detail * .3;
    for (let q = 0; q < lum.length; q++) {
        const i = q * 4;
        const value = Math.max(0, Math.min(1, ((lum[q] + (lum[q] - localMean[q]) * .2) / 255 - .5) * contrast + .5 - Math.min(.06, grad[q] / 1200)));
        const t = smoothstep(threshold - band, threshold + band, value);
        const stepped = Math.round(t * 5) / 5;
        // Keep a narrow antialias band while admitting at most four interior tones.
        const amount = detail === 0 ? t : stepped * .85 + t * .15;
        for (let c = 0; c < 3; c++) out[i + c] = dark[c] + (light[c] - dark[c]) * amount;
        out[i + 3] = 255;
    }
    return expandGrid(out, grid, w, h, ctx);
}
