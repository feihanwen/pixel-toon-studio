import { smoothstep } from '../worker/shared/color';

/** Local, deterministic photo correction. No generative model or network calls. */
export interface AutoColorSelection {
    enabled: boolean;
    strength: number;
    algorithmVersion?: 1 | 2;
    exposure?: number;
    contrast?: number;
    temperature?: number;
    vibrance?: number;
}

export interface AutoColorDiagnostics {
    exposureNote: 'lifted' | 'recovered' | 'balanced';
    contrastNote: 'expanded' | 'balanced';
    whiteBalanceNote: 'warmed' | 'cooled' | 'balanced';
    lowLight: boolean;
}

export interface AutoColorOptions {
    exposure?: number;
    contrast?: number;
    temperature?: number;
    vibrance?: number;
}

export interface AutoColorPlan {
    algorithmVersion?: 1 | 2;
    shadowLift?: number;
    sContrast?: number;
    exposureShift?: number;
    vibranceOffset?: number;
    gamma: number;
    black: number;
    white: number;
    gains: [number, number, number];
    saturation: number;
    strength: number;
    diagnostics?: AutoColorDiagnostics;
}

export const defaultAutoColor = (): AutoColorSelection => ({
    enabled: false,
    strength: 70,
    algorithmVersion: 2,
});

const bound = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const luma = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722;

/** Analyze a fixed-size full-photo sample, shared by preview and every export tile. */
export function analyzeAutoColor(
    data: Uint8ClampedArray,
    strength: number,
    algorithmVersion: 1 | 2 = 1,
    options: AutoColorOptions = {},
): AutoColorPlan {
    const histogram = new Uint32Array(256);
    const neutral = [0, 0, 0];
    let count = 0;
    let neutralCount = 0;

    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 250) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const y = luma(r, g, b);
        histogram[Math.round(y)]++;
        count++;
        const hi = Math.max(r, g, b);
        const lo = Math.min(r, g, b);
        // Use near-neutral midtones/highlights; a red wall must not dictate white balance.
        if (y > 75 && y < 242 && hi - lo < hi * 0.17) {
            neutral[0] += r;
            neutral[1] += g;
            neutral[2] += b;
            neutralCount++;
        }
    }

    const percentile = (fraction: number) => {
        const target = Math.max(1, Math.ceil(count * fraction));
        let sum = 0;
        for (let v = 0; v < 256; v++) {
            sum += histogram[v];
            if (sum >= target) return v / 255;
        }
        return 0.5;
    };

    if (!count) {
        return { gamma: 1, black: 0, white: 1, gains: [1, 1, 1], saturation: 1, strength: 0 };
    }

    const low = percentile(0.01);
    const p10 = percentile(0.10);
    const mid = percentile(0.50);
    const p90 = percentile(0.90);
    const high = percentile(0.99);

    const gains: [number, number, number] = [1, 1, 1];
    const minNeutral = Math.max(24, count * 0.01);
    const wbConfidence = neutralCount >= minNeutral ? smoothstep(minNeutral, count * 0.08, neutralCount) : 0;

    if (neutralCount >= minNeutral) {
        const average = luma(neutral[0], neutral[1], neutral[2]);
        for (let c = 0; c < 3; c++) {
            const rawGain = average / Math.max(1, neutral[c]);
            gains[c] = bound(1 + (rawGain - 1) * (0.45 + wbConfidence * 0.55), 0.94, 1.06);
        }
    }

    // Do not turn black photos grey or amplify noise in nearly empty exposures.
    const hasRange = mid > 0.025 && high - low > 0.08;
    const gamma = hasRange ? bound(Math.log(0.46) / Math.log(bound(mid, 0.03, 0.97)), 0.72, 1.08) : 1;

    if (algorithmVersion === 2) {
        const exposure = bound(Number.isFinite(options.exposure) ? options.exposure! : 0, -50, 50);
        const contrast = bound(Number.isFinite(options.contrast) ? options.contrast! : 0, -50, 50);
        const temperature = bound(Number.isFinite(options.temperature) ? options.temperature! : 0, -50, 50);
        const vibrance = bound(Number.isFinite(options.vibrance) ? options.vibrance! : 0, -50, 50);

        const v2Gains: [number, number, number] = [1, 1, 1];
        if (neutralCount >= minNeutral) {
            const average = luma(neutral[0], neutral[1], neutral[2]);
            for (let c = 0; c < 3; c++) {
                const rawGain = average / Math.max(1, neutral[c]);
                const blended = 1 + (rawGain - 1) * (0.55 + wbConfidence * 0.45);
                v2Gains[c] = bound(blended, 0.92, 1.08);
            }
        }
        const tempShift = temperature / 50;
        const finalGains: [number, number, number] = [
            bound(v2Gains[0] * (1 + tempShift * 0.08), 0.85, 1.16),
            bound(v2Gains[1] * (1 + tempShift * 0.01), 0.90, 1.10),
            bound(v2Gains[2] * (1 - tempShift * 0.09), 0.85, 1.16),
        ];

        // Bidirectional gamma: lift dark photos (< 0.43) AND recover overexposed bright photos (> 0.56).
        let v2Gamma = 1;
        if (hasRange) {
            if (mid < 0.43) {
                v2Gamma = bound(Math.log(0.43) / Math.log(bound(mid, 0.03, 0.97)), 0.72, 1.0);
            } else if (mid > 0.56) {
                v2Gamma = bound(Math.log(0.50) / Math.log(bound(mid, 0.03, 0.97)), 1.0, 1.22);
            }
        }

        // Dynamic range expansion (S-curve) for hazy or flat-contrast scenes (narrow p90 - p10).
        const dynamicSpan = p90 - p10;
        const autoContrast = hasRange && dynamicSpan < 0.62 ? smoothstep(0.62, 0.25, dynamicSpan) * 0.28 : 0;
        const sContrast = bound((hasRange ? autoContrast : 0) + contrast / 125, -0.38, 0.55);

        const shadowLift = hasRange ? 0.045 * (1 - smoothstep(0.12, 0.34, low)) : 0;
        const exposureShift = exposure / 50;

        const exposureNote: AutoColorDiagnostics['exposureNote'] =
            v2Gamma < 0.95 || shadowLift > 0.02
                ? 'lifted'
                : v2Gamma > 1.05
                  ? 'recovered'
                  : 'balanced';
        const contrastNote: AutoColorDiagnostics['contrastNote'] =
            sContrast > 0.08 ? 'expanded' : 'balanced';
        const rbBalance = v2Gains[0] / Math.max(0.01, v2Gains[2]);
        const whiteBalanceNote: AutoColorDiagnostics['whiteBalanceNote'] =
            rbBalance > 1.025 ? 'warmed' : rbBalance < 0.975 ? 'cooled' : 'balanced';

        return {
            algorithmVersion: 2,
            gamma: v2Gamma,
            black: 0,
            white: 1,
            gains: finalGains,
            shadowLift,
            sContrast,
            exposureShift,
            vibranceOffset: vibrance / 50,
            saturation: hasRange ? 1.08 : 1,
            strength: bound(strength, 0, 100) / 100,
            diagnostics: {
                exposureNote,
                contrastNote,
                whiteBalanceNote,
                lowLight: mid < 0.34,
            },
        };
    }

    return {
        gamma,
        black: Math.min(0.018, low * 0.12),
        white: Math.max(0.94, high),
        gains,
        saturation: 1.08,
        strength: bound(strength, 0, 100) / 100,
    };
}

export function applyAutoColor(data: Uint8ClampedArray, plan?: AutoColorPlan | null) {
    if (!plan || plan.strength <= 0) return;
    if (plan.algorithmVersion === 2) {
        applyAutoColorV2(data, plan);
        return;
    }
    const { gamma, black, white, gains, strength } = plan;
    for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const r = (data[i] / 255) * gains[0];
        const g = (data[i + 1] / 255) * gains[1];
        const b = (data[i + 2] / 255) * gains[2];
        const y = luma(r, g, b);
        const target = Math.pow(bound((y - black) / (white - black), 0, 1), gamma);
        const ratio = y > 0.0001 ? target / y : 1;
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

/** V2 anchors black/white endpoints, protects bright neutral highlights, and supports fine user offsets. */
function applyAutoColorV2(data: Uint8ClampedArray, plan: AutoColorPlan) {
    const curve = new Float32Array(4097);
    const sContrast = plan.sContrast ?? 0;
    const exposureShift = plan.exposureShift ?? 0;
    const expGamma = exposureShift !== 0 ? Math.pow(2, -exposureShift * 0.45) : 1;

    for (let j = 0; j <= 4096; j++) {
        const y = j / 4096;
        // Taper auto-gamma smoothly before bright neutral highlights (~225/255 = 0.882) so highlight detail stays crisp.
        const protect = smoothstep(0.012, 0.08, y) * (1 - smoothstep(0.50, 0.87, y));
        const shadow = (plan.shadowLift ?? 0) * smoothstep(0.015, 0.09, y) * (1 - smoothstep(0.18, 0.50, y));
        let nextY = y + (Math.pow(y, plan.gamma) - y) * protect + shadow;
        if (expGamma !== 1) {
            nextY = Math.pow(bound(nextY, 0, 1), expGamma);
        }
        if (sContrast !== 0) {
            const sCurve = y < 0.5 ? 0.5 * Math.pow(2 * y, 1.35) : 1 - 0.5 * Math.pow(2 * (1 - y), 1.35);
            const sGate = smoothstep(0.01, 0.08, y) * (1 - smoothstep(0.86, 0.99, y));
            nextY += (sCurve - y) * sContrast * sGate;
        }
        curve[j] = bound(nextY, 0, 1);
    }

    const vibranceOffset = plan.vibranceOffset ?? 0;

    for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const r = (data[i] / 255) * plan.gains[0];
        const g = (data[i + 1] / 255) * plan.gains[1];
        const b = (data[i + 2] / 255) * plan.gains[2];
        const y = luma(r, g, b);
        const target = curve[Math.round(bound(y, 0, 1) * 4096)];
        const ratio = y > 0.0001 ? target / y : 1;
        const hi = Math.max(r, g, b);
        const lo = Math.min(r, g, b);
        const sat = hi > 0 ? (hi - lo) / hi : 0;

        // Protect high-saturation subjects from oversaturation while giving low/midtones clean vibrance.
        const autoSatBoost = (plan.saturation - 1) * (1 - smoothstep(0.3, 0.8, sat));
        const manualSatBoost = vibranceOffset * (vibranceOffset >= 0 ? 0.55 * (1 - 0.5 * smoothstep(0.45, 0.95, sat)) : 0.65);
        let chroma = Math.max(0.05, 1 + autoSatBoost + manualSatBoost);

        const dr = r * ratio - target;
        const dg = g * ratio - target;
        const db = b * ratio - target;
        chroma = Math.min(chroma, gamutLimit(dr, target), gamutLimit(dg, target), gamutLimit(db, target));

        const cr = bound(target + dr * chroma, 0, 1) * 255;
        const cg = bound(target + dg * chroma, 0, 1) * 255;
        const cb = bound(target + db * chroma, 0, 1) * 255;

        data[i] += (cr - data[i]) * plan.strength;
        data[i + 1] += (cg - data[i + 1]) * plan.strength;
        data[i + 2] += (cb - data[i + 2]) * plan.strength;
    }
}

function gamutLimit(delta: number, target: number) {
    return delta > 0 ? (1 - target) / delta : delta < 0 ? -target / delta : Infinity;
}
