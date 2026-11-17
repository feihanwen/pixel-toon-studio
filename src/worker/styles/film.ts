import { GRAIN_SEED } from '../../config/limits';
import { boxBlur } from '../shared/blur';
import { clamp, luminance, smoothstep } from '../shared/color';
import { grainAt } from '../shared/texture';
import type { StyleContext } from '../shared/sampling';

export const FILM = { blackLift: 31, whiteCeiling: 233, saturationLoss: .25, redGain: 22, blueGain: -25 } as const;
export function filmRadius(halation: number, scale: number): number { return Math.ceil((4 + halation * .18) * scale); }
export function filmSmearRadius(smear: number, scale: number): number { return smear > 0 ? Math.ceil((1 + smear * .06) * scale) : 0; }

export function film(src: Uint8ClampedArray, w: number, h: number, p: Record<string, number>, ctx: StyleContext): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length), fade = p.fade / 100, warmth = p.warmth / 100;
    const tint = (p.tint ?? 0) / 100;
    const vignette = Math.max(0, Math.min(1, (p.vignette ?? 0) / 100));
    const halo = p.halation / 100;
    const smear = Math.max(0, Math.min(100, p.smear ?? 0));
    let base = src;
    if (smear > 0) {
        base = src.slice();
        const channel = new Float32Array(w * h), mix = smear / 100 * .9;
        for (let c = 0; c < 3; c++) {
            for (let q = 0; q < channel.length; q++) channel[q] = src[q * 4 + c];
            const softened = boxBlur(channel, w, h, filmSmearRadius(smear, ctx.scale));
            for (let q = 0; q < channel.length; q++) base[q * 4 + c] = src[q * 4 + c] * (1 - mix) + softened[q] * mix;
        }
    }
    let glow: Float32Array | null = null, mask: Float32Array | null = null;
    if (halo > 0) {
        mask = new Float32Array(w * h);
        for (let q = 0; q < mask.length; q++) {
            const i = q * 4;
            mask[q] = smoothstep(195, 250, luminance(src[i], src[i + 1], src[i + 2]));
        }
        glow = boxBlur(mask, w, h, filmRadius(p.halation, ctx.scale));
    }
    const halfW = Math.max(1, ctx.fullWidth * 0.5);
    const halfH = Math.max(1, ctx.fullHeight * 0.5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const q = y * w + x, i = q * 4;
        const lum = luminance(base[i], base[i + 1], base[i + 2]);
        const exposureGate = .45 + .55 * Math.sin(Math.PI * lum / 255);
        const spread = glow && mask ? Math.max(0, glow[q] - mask[q] * .65) * halo : 0;
        const grain = p.grain > 0 ? grainAt(ctx.originX + x, ctx.originY + y, ctx.scale, GRAIN_SEED) * p.grain * .38 * (1.2 - lum / 510) : 0;
        let vigScale = 1;
        if (vignette > 0) {
            const nx = (ctx.originX + x + 0.5 - halfW) / halfW;
            const ny = (ctx.originY + y + 0.5 - halfH) / halfH;
            const r = Math.hypot(nx, ny);
            vigScale = 1 - vignette * 0.58 * smoothstep(0.45, 1.38, r);
        }
        for (let c = 0; c < 3; c++) {
            const desaturated = lum + (base[i + c] - lum) * (1 - FILM.saturationLoss * fade);
            const faded = FILM.blackLift + desaturated * (FILM.whiteCeiling - FILM.blackLift) / 255;
            const color = desaturated * (1 - fade) + faded * fade;
            const temperature = warmth * exposureGate * (c === 0 ? FILM.redGain : c === 2 ? FILM.blueGain : 2);
            const tintShift = tint * exposureGate * (c === 1 ? -16 : 9);
            const halation = spread * (c === 0 ? 42 : c === 1 ? 16 : 3);
            out[i + c] = clamp((color + temperature + tintShift + halation + grain) * vigScale);
        }
        out[i + 3] = 255;
    }
    return out;
}
