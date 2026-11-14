export const clamp = (v: number) => Math.max(0, Math.min(255, v));
export const luminance = (r: number, g: number, b: number) => r * .2126 + g * .7152 + b * .0722;
export function saturation(r: number, g: number, b: number) { const hi = Math.max(r, g, b), lo = Math.min(r, g, b); return hi === 0 ? 0 : (hi - lo) / hi; }
export function adjust(data: Uint8ClampedArray, global: {
    brightness: number;
    contrast: number;
    saturation: number;
}) { const brightness = global.brightness * 1.6; const contrast = (100 + global.contrast) / (100 - global.contrast || 1); const sat = 1 + global.saturation / 100; for (let i = 0; i < data.length; i += 4) {
    const y = luminance(data[i], data[i + 1], data[i + 2]);
    for (let c = 0; c < 3; c++)
        data[i + c] = clamp(((y + (data[i + c] - y) * sat - 128) * contrast + 128) + brightness);
    data[i + 3] = 255;
} }
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
