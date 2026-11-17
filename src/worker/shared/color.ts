export const clamp = (v: number) => Math.max(0, Math.min(255, v));
export const luminance = (r: number, g: number, b: number) => r * .2126 + g * .7152 + b * .0722;
export function saturation(r: number, g: number, b: number) { const hi = Math.max(r, g, b), lo = Math.min(r, g, b); return hi === 0 ? 0 : (hi - lo) / hi; }
export function adjust(data: Uint8ClampedArray, global: {
    brightness: number;
    contrast: number;
    saturation: number;
    highlights?: number;
    shadows?: number;
    temperature?: number;
}) {
    const brightness = global.brightness * 1.6;
    const contrast = (100 + global.contrast) / (100 - global.contrast || 1);
    const sat = 1 + global.saturation / 100;
    const highlights = (global.highlights ?? 0) / 100;
    const shadows = (global.shadows ?? 0) / 100;
    const temperature = (global.temperature ?? 0) / 100;
    const hasTone = highlights !== 0 || shadows !== 0 || temperature !== 0;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];
        if (hasTone) {
            const norm = luminance(r, g, b) / 255;
            const shadowWeight = (1 - smoothstep(0.05, 0.55, norm)) * smoothstep(0, 0.04, norm + 0.04);
            const highWeight = smoothstep(0.45, 0.96, norm);
            const toneShift = (shadows * shadowWeight * 56) + (highlights * highWeight * 52);
            const warmShift = temperature * 26 * (0.35 + 0.65 * Math.sin(Math.PI * norm));
            r = clamp(r + toneShift + warmShift);
            g = clamp(g + toneShift + warmShift * 0.12);
            b = clamp(b + toneShift - warmShift);
        }
        const y = luminance(r, g, b);
        const rgb = [r, g, b];
        for (let c = 0; c < 3; c++)
            data[i + c] = clamp(((y + (rgb[c] - y) * sat - 128) * contrast + 128) + brightness);
        data[i + 3] = 255;
    }
}
export function quantize(v: number, levels: number) { return Math.round(v * (levels - 1) / 255) * 255 / (levels - 1); }

export function smoothstep(lo: number, hi: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}

/** Called once per palette, never per pixel. Saturation and lightness use 0..1. */
export function hslToRgb(hue: number, sat: number, light: number): [number, number, number] {
    const h = ((hue % 360) + 360) % 360 / 30;
    const a = sat * Math.min(light, 1 - light);
    const channel = (n: number) => {
        const k = (n + h) % 12;
        return (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
    };
    return [channel(0), channel(8), channel(4)];
}

export function relativeLuminance(rgb: readonly number[]): number {
    const linear = (v: number) => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; };
    return linear(rgb[0]) * .2126 + linear(rgb[1]) * .7152 + linear(rgb[2]) * .0722;
}

export function srgbToLinear(v: number): number {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(v: number): number {
    const c = Math.max(0, Math.min(1, v));
    return (c <= 0.0031308 ? 12.92 * c : 1.055 * (c ** (1 / 2.4)) - 0.055) * 255;
}

export const SRGB_TO_LINEAR_LUT = Float32Array.from({ length: 256 }, (_, v) => srgbToLinear(v));
const LINEAR_TO_SRGB_LUT_SIZE = 8192;
const LINEAR_TO_SRGB_LUT = Float32Array.from(
    { length: LINEAR_TO_SRGB_LUT_SIZE + 1 },
    (_, i) => linearToSrgb(i / LINEAR_TO_SRGB_LUT_SIZE),
);

function fastLinearToSrgb(v: number): number {
    if (v <= 0) return 0;
    if (v >= 1) return 255;
    return LINEAR_TO_SRGB_LUT[(v * LINEAR_TO_SRGB_LUT_SIZE + 0.5) | 0];
}

export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

export function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
        linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ];
}

/**
 * Converts Oklab to sRGB [0..255] while preserving hue angle when chroma exceeds sRGB gamut
 * (shrinks chroma toward the exact achromatic grey at lightness L in linear RGB before transfer).
 */
export function oklabToSrgbGamutSafe(L: number, a: number, b: number): [number, number, number] {
    const lC = Math.max(0, Math.min(1, L));
    const l_ = lC + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = lC - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = lC - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    let lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    const minC = Math.min(lr, lg, lb);
    const maxC = Math.max(lr, lg, lb);
    if (minC < 0 || maxC > 1) {
        const gray = lC * lC * lC;
        let t = 1;
        if (minC < 0 && gray > minC) t = Math.min(t, gray / (gray - minC));
        if (maxC > 1 && maxC > gray) t = Math.min(t, (1 - gray) / (maxC - gray));
        t = Math.max(0, Math.min(1, t));
        lr = gray + (lr - gray) * t;
        lg = gray + (lg - gray) * t;
        lb = gray + (lb - gray) * t;
    }
    return [fastLinearToSrgb(lr), fastLinearToSrgb(lg), fastLinearToSrgb(lb)];
}
