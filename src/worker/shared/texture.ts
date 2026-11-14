import { smoothstep } from './color';

/** Integer coordinates and a fixed seed give identical results in every tile. */
export function hash2d(x: number, y: number, seed: number): number {
    let n = Math.imul(Math.floor(x), 0x1f123bb5) ^ Math.imul(Math.floor(y), 0x5f356495) ^ seed;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, frequency: number, seed: number): number {
    const xx = x * frequency, yy = y * frequency, ix = Math.floor(xx), iy = Math.floor(yy);
    const fx = smoothstep(0, 1, xx - ix), fy = smoothstep(0, 1, yy - iy);
    const a = hash2d(ix, iy, seed) * (1 - fx) + hash2d(ix + 1, iy, seed) * fx;
    const b = hash2d(ix, iy + 1, seed) * (1 - fx) + hash2d(ix + 1, iy + 1, seed) * fx;
    return a * (1 - fy) + b * fy;
}

export function grainAt(x: number, y: number, scale: number, seed: number): number {
    return (valueNoise(x / scale, y / scale, 1, seed) - .5) * 2;
}

export function linePattern(x: number, y: number, angle: number, spacing: number, width: number): number {
    const v = -x * Math.sin(angle) + y * Math.cos(angle);
    const phase = ((v % spacing) + spacing) % spacing;
    const distance = Math.min(phase, spacing - phase);
    return 1 - smoothstep(Math.max(0, width * .5 - .45), width * .5 + .45, distance);
}

export function dotPattern(x: number, y: number, angle: number, spacing: number, coverage: number): number {
    const co = Math.cos(angle), si = Math.sin(angle);
    const rx = x * co + y * si, ry = -x * si + y * co;
    const dx = ((rx % spacing) + spacing) % spacing - spacing / 2;
    const dy = ((ry % spacing) + spacing) % spacing - spacing / 2;
    const radius = spacing * Math.sqrt(Math.max(0, Math.min(.75, coverage)) / Math.PI);
    return coverage <= 0 ? 0 : 1 - smoothstep(Math.max(0, radius - .5), radius + .5, Math.hypot(dx, dy));
}
