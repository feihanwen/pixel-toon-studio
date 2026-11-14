import { smoothstep } from '../worker/shared/color';
/** Local, deterministic photo correction. No generative model or network calls. */
export interface AutoColorSelection { enabled: boolean; strength: number; algorithmVersion?: 1 | 2 }
export interface AutoColorPlan { algorithmVersion?: 1 | 2; shadowLift?: number; gamma: number; black: number; white: number; gains: [number, number, number]; saturation: number; strength: number }
export const defaultAutoColor = (): AutoColorSelection => ({ enabled: false, strength: 70, algorithmVersion: 2 });
const bound = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const luma = (r: number, g: number, b: number) => r * .2126 + g * .7152 + b * .0722;

/** Analyze a fixed-size full-photo sample, shared by preview and every export tile. */
export function analyzeAutoColor(data: Uint8ClampedArray, strength: number, algorithmVersion: 1 | 2 = 1): AutoColorPlan {
    const histogram = new Uint32Array(256), neutral = [0, 0, 0];
    let count = 0, neutralCount = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 250) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2], y = luma(r, g, b);
        histogram[Math.round(y)]++; count++;
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
        // Use near-neutral midtones/highlights; a red wall must not dictate white balance.
        if (y > 80 && y < 240 && hi - lo < hi * .16) {
            neutral[0] += r; neutral[1] += g; neutral[2] += b; neutralCount++;
        }
    }
    const percentile = (fraction: number) => {
        const target = Math.max(1, Math.ceil(count * fraction)); let sum = 0;
        for (let v = 0; v < 256; v++) { sum += histogram[v]; if (sum >= target) return v / 255; }
        return .5;
    };
    if (!count) return { gamma: 1, black: 0, white: 1, gains: [1, 1, 1], saturation: 1, strength: 0 };
    const low = percentile(.01), mid = percentile(.5), high = percentile(.99);
    const gains: [number, number, number] = [1, 1, 1];
    if (neutralCount >= Math.max(24, count * .01)) {
        const average = luma(neutral[0], neutral[1], neutral[2]);
        for (let c = 0; c < 3; c++) gains[c] = bound(average / neutral[c], .94, 1.06);
    }
    // Do not turn black photos grey or amplify noise in nearly empty exposures.
    const gamma = mid > .025 && high - low > .08 ? bound(Math.log(.46) / Math.log(bound(mid, .03, .97)), .72, 1.08) : 1;
    if (algorithmVersion === 2) {
        const hasRange = mid > .025 && high - low > .08;
        const v2Gamma = hasRange ? bound(Math.log(.4) / Math.log(bound(mid, .03, .97)), .8, 1.04) : 1;
        return { algorithmVersion: 2, gamma: v2Gamma, black: 0, white: 1,
            gains: gains.map(gain => bound(gain, .97, 1.03)) as [number, number, number],
            shadowLift: hasRange ? .045 * (1 - smoothstep(.12, .3, low)) : 0,
            saturation: hasRange ? 1.06 : 1, strength: bound(strength, 0, 100) / 100 };
    }
    return { gamma, black: Math.min(.018, low * .12), white: Math.max(.94, high), gains, saturation: 1.08, strength: bound(strength, 0, 100) / 100 };
}

export function applyAutoColor(data: Uint8ClampedArray, plan?: AutoColorPlan | null) {
    if (!plan || plan.strength <= 0) return;
    if (plan.algorithmVersion === 2) { applyAutoColorV2(data, plan); return; }
    const { gamma, black, white, gains, strength } = plan;
    for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i] / 255 * gains[0], g = data[i + 1] / 255 * gains[1], b = data[i + 2] / 255 * gains[2];
        const y = luma(r, g, b);
        const target = Math.pow(bound((y - black) / (white - black), 0, 1), gamma);
        const ratio = y > .0001 ? target / y : 1;
        // A common luminance curve preserves hue; reduce chroma only as needed to fit gamut.
        const rgb = [r * ratio, g * ratio, b * ratio];
        let sat = plan.saturation;
        for (const value of rgb) {
            const delta = value - target;
            if (delta > 0) sat = Math.min(sat, (1 - target) / delta);
            else if (delta < 0) sat = Math.min(sat, -target / delta);
        }
        for (let c = 0; c < 3; c++) {
            const corrected = bound(target + (rgb[c] - target) * sat, 0, 1) * 255;
            data[i + c] += (corrected - data[i + c]) * strength;
        }
    }
}

/** V2 leaves the black/white endpoints anchored and avoids boosting saturated colors. */
function applyAutoColorV2(data: Uint8ClampedArray, plan: AutoColorPlan) {
    const curve = new Float32Array(4097);
    for (let j = 0; j <= 4096; j++) {
        const y = j / 4096;
        const protect = smoothstep(.012, .08, y) * (1 - smoothstep(.5, .92, y));
        const shadow = (plan.shadowLift ?? 0) * smoothstep(.015, .09, y) * (1 - smoothstep(.18, .5, y));
        curve[j] = bound(y + (Math.pow(y, plan.gamma) - y) * protect + shadow, 0, 1);
    }
    for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i] / 255 * plan.gains[0], g = data[i + 1] / 255 * plan.gains[1], b = data[i + 2] / 255 * plan.gains[2];
        const y = luma(r, g, b), target = curve[Math.round(bound(y, 0, 1) * 4096)];
        const ratio = y > .0001 ? target / y : 1;
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b), sat = hi > 0 ? (hi - lo) / hi : 0;
        let chroma = 1 + (plan.saturation - 1) * (1 - smoothstep(.3, .8, sat));
        const dr = r * ratio - target, dg = g * ratio - target, db = b * ratio - target;
        chroma = Math.min(chroma, gamutLimit(dr, target), gamutLimit(dg, target), gamutLimit(db, target));
        data[i] += (bound(target + dr * chroma, 0, 1) * 255 - data[i]) * plan.strength;
        data[i + 1] += (bound(target + dg * chroma, 0, 1) * 255 - data[i + 1]) * plan.strength;
        data[i + 2] += (bound(target + db * chroma, 0, 1) * 255 - data[i + 2]) * plan.strength;
    }
}
function gamutLimit(delta: number, target: number) {
    return delta > 0 ? (1 - target) / delta : delta < 0 ? -target / delta : Infinity;
}
