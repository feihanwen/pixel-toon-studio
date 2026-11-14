import { defaultParams, type StyleId } from '../src/config/styles';
import { render } from '../src/worker/pipeline';

export const newStyles = ['manga', 'pencil', 'duotone', 'film'] as const;
export function fixture(w: number, h: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, u = x / w, v = y / h;
        const highlight = ((u - .54) ** 2 + (v - .49) ** 2 < .018);
        const ripple = Math.sin(x * .49 + y * .11) * 12;
        out[i] = highlight ? 255 : 30 + u * 175 + ripple;
        out[i + 1] = highlight ? 254 : 65 + v * 145 + ripple * .5;
        out[i + 2] = highlight ? 250 : (u < .5 ? 170 : 50) + v * 40;
        if (Math.abs(v - .4 - u * .12) < .012) out[i] = out[i + 1] = out[i + 2] = 20;
        out[i + 3] = 255;
    }
    return out;
}
export function flat(w: number, h: number, value: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < out.length; i += 4) { out[i] = out[i + 1] = out[i + 2] = value; out[i + 3] = 255; }
    return out;
}
export function metrics(a: Uint8ClampedArray, b: Uint8ClampedArray) {
    let sum = 0, changed = 0, max = 0;
    for (let i = 0; i < a.length; i += 4) {
        const amount = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
        sum += amount; if (amount >= 4) changed++;
        for (let c = 0; c < 3; c++) max = Math.max(max, Math.abs(a[i + c] - b[i + c]));
    }
    return { mad: sum / (a.length / 4), ratio: changed / (a.length / 4), max };
}
export function processStyle(styleId: StyleId, src: Uint8ClampedArray, w: number, h: number, params = defaultParams()[styleId], originX = 0, originY = 0, fullWidth = w, fullHeight = h) {
    return new Uint8ClampedArray(render({ kind: 'render', id: 1, tabId: 'test', revision: 1, mode: 'export', styleId, params, width: w, height: h, originX, originY, fullWidth, fullHeight, scale: Math.max(1, Math.max(fullWidth, fullHeight) / 1600), global: { brightness: 0, contrast: 0, saturation: 0 }, buffer: src.slice().buffer }));
}
