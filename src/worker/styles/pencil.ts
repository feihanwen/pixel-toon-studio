import { PAPER_SEED, PENCIL_STYLE_SIDE } from '../../config/limits';
import { clamp, luminance, smoothstep } from '../shared/color';
import { boxBlur } from '../shared/blur';
import { edgeSmooth, expandGrid, styleGrid, type StyleContext } from '../shared/sampling';
import { valueNoise } from '../shared/texture';

/**
 * 8 discrete stroke directions (0..7 => 0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5 deg)
 * following Lu, Xu & Jia (NPAR/ICCP 2012) "Combining Sketch and Tone for Pencil Drawing Production".
 */
const DIR_COS = new Float32Array(8);
const DIR_SIN = new Float32Array(8);
for (let d = 0; d < 8; d++) {
    const theta = (d * Math.PI) / 8;
    DIR_COS[d] = Math.cos(theta);
    DIR_SIN[d] = Math.sin(theta);
}

/**
 * 4 fixed global hatching basis angles for anisotropic pencil stroke synthesis:
 * -38 deg (primary artist diagonal), +24 deg (oblique cross-hatch), -76 deg (steep contour), +8 deg (horizontal contour).
 */
const HATCH_ANGLES = [-0.663225, 0.418879, -1.326450, 0.139626] as const;
const HATCH_COS = HATCH_ANGLES.map(Math.cos);
const HATCH_SIN = HATCH_ANGLES.map(Math.sin);

/**
 * Anisotropic 16:1 stretched pencil-nib grain in rotated global coordinates (u, v).
 * Produces long, slender, tapered, aperiodic colored-pencil strokes (1px thin across, ~18px long along)
 * with zero geometric grid artifacts and 100% tile seamlessness.
 */
function sampleAnisotropicStroke(
    px: number,
    py: number,
    dirIdx: number,
    freqAcross: number,
    seed: number,
): number {
    const co = HATCH_COS[dirIdx], si = HATCH_SIN[dirIdx];
    const u = px * co + py * si;
    const v = -px * si + py * co;
    // Slight organic hand-curve along the stroke
    const curve = (valueNoise(u * 0.035, v * 0.035, 1, seed + 7) - 0.5) * 1.1;
    // Fine nib streak (16:1 aspect ratio) + medium pressure core (10:1 aspect ratio)
    const fine = valueNoise(u * freqAcross * 0.058, (v + curve) * freqAcross, 1, seed);
    const core = valueNoise(u * freqAcross * 0.095 + 17.3, (v + curve * 0.6) * freqAcross * 0.55, 1, seed + 31);
    const combined = fine * 0.68 + core * 0.32;
    return Math.max(0, Math.min(1, 0.5 + (combined - 0.5) * 2.35));
}

export function pencil(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    p: Record<string, number>,
    ctx: StyleContext,
): Uint8ClampedArray {
    const grid = styleGrid(src, w, h, ctx, PENCIL_STYLE_SIDE);
    const { width: sw, height: sh, gx, gy } = grid;
    const n = sw * sh;

    // 1. Edge-preserving base smoothing for clean chromaticity and structure extraction
    const smooth1 = edgeSmooth(grid.data, sw, sh);
    const prepared = edgeSmooth(smooth1, sw, sh);

    const rawLum = new Float32Array(n);
    const lum = new Float32Array(n);
    const sat = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        const i = q * 4;
        const r = prepared[i], g = prepared[i + 1], b = prepared[i + 2];
        rawLum[q] = luminance(smooth1[i], smooth1[i + 1], smooth1[i + 2]);
        lum[q] = luminance(r, g, b);
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
        sat[q] = hi === 0 ? 0 : (hi - lo) / hi;
    }

    // 2. XDoG (Extended Difference of Gaussians, Winnemöller et al. 2012) + Sobel gradient
    const blurFine = boxBlur(rawLum, sw, sh, 1);
    const blurCoarse = boxBlur(lum, sw, sh, 3);

    const grad = new Float32Array(n);
    const xx = new Float32Array(n);
    const yy = new Float32Array(n);
    const xy = new Float32Array(n);

    for (let y = 0; y < sh; y++) {
        const y0 = Math.max(0, y - 1), y1 = Math.min(sh - 1, y + 1);
        for (let x = 0; x < sw; x++) {
            const x0 = Math.max(0, x - 1), x1 = Math.min(sw - 1, x + 1);
            const q = y * sw + x;

            const tl = rawLum[y0 * sw + x0], tc = rawLum[y0 * sw + x], tr = rawLum[y0 * sw + x1];
            const ml = rawLum[y * sw + x0],                            mr = rawLum[y * sw + x1];
            const bl = rawLum[y1 * sw + x0], bc = rawLum[y1 * sw + x], br = rawLum[y1 * sw + x1];

            const gxSobel = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * 0.125;
            const gySobel = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * 0.125;
            const mag = Math.hypot(gxSobel, gySobel);

            // Suppress soft cloud transitions in bright sky so clouds aren't ringed by dark lines
            const l = lum[q];
            const softCloudSuppress = smoothstep(145, 225, l) * (1 - smoothstep(11, 30, mag)) * 0.82;
            const dog = Math.max(0, blurCoarse[q] - blurFine[q] - 1.6);
            grad[q] = Math.max(0, (mag * 0.78 + dog * 0.82) * (1 - softCloudSuppress));

            xx[q] = gxSobel * gxSobel;
            yy[q] = gySobel * gySobel;
            xy[q] = gxSobel * gySobel;
        }
    }

    // 3. Lu, Xu & Jia (2012) 8-Direction Line Convolution with Anisotropic Clutter Suppression:
    //    Only edges with strong linear alignment (bestSum - orthoSum) emit dark sketch strokes,
    //    keeping chaotic foliage/blossom petals clean while branches and architecture stay crisp.
    const strokeRadius = Math.max(1, Math.min(4, Math.round(1 + p.stroke * 0.35)));
    const winDir = new Uint8Array(n);
    const winVal = new Float32Array(n);
    const dirSums = new Float32Array(8);

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const q = y * sw + x;
            const g0 = grad[q];
            if (g0 < 3.0) continue;
            let bestDir = 0;
            let bestSum = -1;
            for (let d = 0; d < 8; d++) {
                const dx = DIR_COS[d], dy = DIR_SIN[d];
                let sum = g0;
                for (let s = 1; s <= strokeRadius; s++) {
                    const nx1 = Math.max(0, Math.min(sw - 1, Math.round(x + dx * s)));
                    const ny1 = Math.max(0, Math.min(sh - 1, Math.round(y + dy * s)));
                    const nx2 = Math.max(0, Math.min(sw - 1, Math.round(x - dx * s)));
                    const ny2 = Math.max(0, Math.min(sh - 1, Math.round(y - dy * s)));
                    sum += grad[ny1 * sw + nx1] + grad[ny2 * sw + nx2];
                }
                dirSums[d] = sum;
                if (sum > bestSum) {
                    bestSum = sum;
                    bestDir = d;
                }
            }
            const orthoSum = dirSums[(bestDir + 4) & 7];
            const anisotropy = Math.max(0, (bestSum - orthoSum * 0.55) / (bestSum + 1e-4));
            winDir[q] = bestDir;
            winVal[q] = g0 * (0.45 + 0.75 * anisotropy);
        }
    }

    const sketchRaw = new Float32Array(n);
    const normFactor = 1 / (2 * strokeRadius + 1);
    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const q = y * sw + x;
            let acc = winVal[q];
            for (let d = 0; d < 8; d++) {
                const dx = DIR_COS[d], dy = DIR_SIN[d];
                for (let s = 1; s <= strokeRadius; s++) {
                    const wt = 1 - (s - 1) / (strokeRadius + 1);
                    const nx1 = Math.max(0, Math.min(sw - 1, Math.round(x + dx * s)));
                    const ny1 = Math.max(0, Math.min(sh - 1, Math.round(y + dy * s)));
                    const q1 = ny1 * sw + nx1;
                    if (winDir[q1] === d) acc += winVal[q1] * wt;

                    const nx2 = Math.max(0, Math.min(sw - 1, Math.round(x - dx * s)));
                    const ny2 = Math.max(0, Math.min(sh - 1, Math.round(y - dy * s)));
                    const q2 = ny2 * sw + nx2;
                    if (winDir[q2] === d) acc += winVal[q2] * wt;
                }
            }
            sketchRaw[q] = acc * normFactor;
        }
    }

    // Smooth structure tensor for local stroke flow orientation
    const jxx = boxBlur(xx, sw, sh, 2);
    const jyy = boxBlur(yy, sw, sh, 2);
    const jxy = boxBlur(xy, sw, sh, 2);

    // 4. Anisotropic Colored-Pencil Hatching + Subtractive Wax Transmittance (T^beta)
    const out = new Uint8ClampedArray(prepared.length);
    const lineStrength = p.line / 100;
    const pigment = p.pigment / 100;
    const paperStrength = p.paper / 100;
    const strokeScale = p.stroke;

    // Fine across-stroke nib frequency controlled by p.stroke (1..8)
    const freqAcross = 1.18 / (1 + (strokeScale - 1) * 0.17);

    // Warm cream sketch paper (#FCF8F0)
    const paperBaseR = 252, paperBaseG = 248, paperBaseB = 240;

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const q = y * sw + x, i = q * 4;
            const px = gx + x, py = gy + y;

            // Paper tooth & woven fiber texture
            const fineTooth = valueNoise(px, py, 0.75, PAPER_SEED) - 0.5;
            const medTooth = valueNoise(px, py, 0.25, PAPER_SEED + 3) - 0.5;
            const coarseFiber = valueNoise(px, py, 0.08, PAPER_SEED + 5) - 0.5;
            const paperRelief = fineTooth * 0.52 + medTooth * 0.33 + coarseFiber * 0.15;
            const paperShade = paperRelief * (9 + paperStrength * 24);

            const pR = clamp(paperBaseR + paperShade * 0.9);
            const pG = clamp(paperBaseG + paperShade * 0.95);
            const pB = clamp(paperBaseB + paperShade * 1.05);

            // Structure tensor orientation & coherence
            const txx = jxx[q], tyy = jyy[q], txy = jxy[q];
            const coherence = Math.min(1, Math.hypot(txx - tyy, 2 * txy) / (txx + tyy + 16));
            const tangentAngle = 0.5 * Math.atan2(2 * txy, txx - tyy) + Math.PI * 0.5;

            // Evaluate the 4 long, slender anisotropic pencil stroke layers
            const s0 = sampleAnisotropicStroke(px, py, 0, freqAcross, PAPER_SEED + 11);
            const s1 = sampleAnisotropicStroke(px, py, 1, freqAcross * 0.95, PAPER_SEED + 43);
            const s2 = sampleAnisotropicStroke(px, py, 2, freqAcross * 0.92, PAPER_SEED + 79);
            const s3 = sampleAnisotropicStroke(px, py, 3, freqAcross * 0.95, PAPER_SEED + 113);

            // Steer primary strokes along local tangent when coherence is high;
            // default to classic -38 deg artist diagonal (s0) in flat areas
            const w0 = Math.cos(tangentAngle - HATCH_ANGLES[0]) ** 2;
            const w1 = Math.cos(tangentAngle - HATCH_ANGLES[1]) ** 2;
            const w2 = Math.cos(tangentAngle - HATCH_ANGLES[2]) ** 2;
            const w3 = Math.cos(tangentAngle - HATCH_ANGLES[3]) ** 2;
            const wSum = w0 + w1 + w2 + w3 + 1e-5;
            const contourStroke = (s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3) / wSum;
            const steer = Math.min(0.88, coherence * 1.3);
            const primaryStroke = s0 * (1 - steer) + contourStroke * steer;

            // Cross-hatching in midtones/shadows uses the conjugate oblique direction
            const crossStroke = s1 * (1 - steer * 0.5) + ((s1 * w2 + s2 * w1 + s0 * w3 + s3 * w0) / wSum) * (steer * 0.5);

            const l = lum[q];
            const cR = prepared[i], cG = prepared[i + 1], cB = prepared[i + 2];
            const s = sat[q];

            // Paper reserve in bright, low-saturation areas (white walls, bright cloud centers)
            const paperReserve = smoothstep(192, 246, l) * (1 - s * 0.76);
            const darkness = (255 - l) / 255;
            const shadowWeight = smoothstep(0.28, 0.78, darkness);

            // Combine primary and cross-hatching strokes
            const strokeTexture = primaryStroke * (1 - shadowWeight * 0.36)
                + (primaryStroke * 0.55 + crossStroke * 0.55) * (shadowWeight * 0.36);

            // Boost pigment vibrance so colored pencil wax looks vivid and rich on warm paper
            const satBoost = 1.26 + pigment * 0.38;
            const liftedL = l + Math.max(0, (88 - l) * 0.15);
            const pigR = Math.max(8, Math.min(254, liftedL + (cR - l) * satBoost));
            const pigG = Math.max(8, Math.min(254, liftedL + (cG - l) * satBoost));
            const pigB = Math.max(8, Math.min(254, liftedL + (cB - l) * satBoost));

            // Subtractive Beer-Lambert colored-pencil transmittance: Paper * (Pigment / 255) ^ gamma
            // In dark shadows, artist burnishing fills paper valleys (higher stroke floor) so darks
            // stay deep and rich without bright gray paper scratches showing through.
            const baseGamma = (0.40 + pigment * 0.75) * (1 - paperReserve * 0.78);
            const strokeFloor = 0.46 + darkness * 0.44;
            const strokeSpan = 0.86 - darkness * 0.32;
            const strokeMod = strokeFloor + strokeTexture * strokeSpan;
            const toothEffect = 1 + paperRelief * (0.45 + paperStrength * 0.82) * (1 - darkness * 0.55);
            const gamma = Math.max(0.02, baseGamma * strokeMod * Math.max(0.35, toothEffect));

            const shadedR = pR * ((pigR / 255) ** gamma);
            const shadedG = pG * ((pigG / 255) ** gamma);
            const shadedB = pB * ((pigB / 255) ** gamma);

            // Directional sketch outline S (Lu et al. 2012 + XDoG soft threshold)
            const sVal = sketchRaw[q];
            const sketchSoft = sVal <= 3.1 ? 0 : Math.tanh((sVal - 3.1) * 0.095);
            const lineGrain = Math.max(0.35, Math.min(1.2, 0.9 + fineTooth * (0.58 + paperStrength * 0.68)));
            const lineAlpha = Math.min(0.88, sketchSoft * lineStrength * lineGrain);

            // Colored-pencil outline ink: deep shade of the object's own color + warm graphite core
            const inkR = clamp(pigR * 0.36 + 36);
            const inkG = clamp(pigG * 0.34 + 32);
            const inkB = clamp(pigB * 0.38 + 30);

            out[i]     = clamp(shadedR * (1 - lineAlpha) + inkR * lineAlpha);
            out[i + 1] = clamp(shadedG * (1 - lineAlpha) + inkG * lineAlpha);
            out[i + 2] = clamp(shadedB * (1 - lineAlpha) + inkB * lineAlpha);
            out[i + 3] = 255;
        }
    }

    return expandGrid(out, grid, w, h, ctx);
}
