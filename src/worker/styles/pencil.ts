import { PAPER_SEED, PENCIL_STYLE_SIDE } from '../../config/limits';
import type { RenderPencilSketch } from '../../types/worker';
import { clamp, luminance, smoothstep } from '../shared/color';
import { boxBlur } from '../shared/blur';
import { edgeSmooth, expandGrid, styleGrid, type StyleContext } from '../shared/sampling';
import { hash2d, valueNoise } from '../shared/texture';

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
 * 6 evenly spaced basis angles across [0, PI) (every 30 deg) for smooth contour-following
 * colored-pencil shading without phase tearing or rigid single-angle stripes.
 */
const BASIS_COUNT = 6;
const BASIS_COS = new Float32Array(BASIS_COUNT);
const BASIS_SIN = new Float32Array(BASIS_COUNT);
for (let b = 0; b < BASIS_COUNT; b++) {
    const theta = (b * Math.PI) / BASIS_COUNT;
    BASIS_COS[b] = Math.cos(theta);
    BASIS_SIN[b] = Math.sin(theta);
}

/** Dilated edge-preserving bilateral pass (stride 2) to simplify photographic micro-texture into clean illustrated color planes. */
function edgeSmoothDilated(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            let red = 0, green = 0, blue = 0, total = 0;
            for (let dy = -2; dy <= 2; dy += 2) {
                const yy = Math.max(0, Math.min(h - 1, y + dy));
                for (let dx = -2; dx <= 2; dx += 2) {
                    const xx = Math.max(0, Math.min(w - 1, x + dx));
                    const j = (yy * w + xx) * 4;
                    const d = Math.abs(src[j] - src[i]) + Math.abs(src[j + 1] - src[i + 1]) + Math.abs(src[j + 2] - src[i + 2]);
                    const weight = (dx || dy ? 1 : 2) / (1 + (d * d) / 2200);
                    red += src[j] * weight;
                    green += src[j + 1] * weight;
                    blue += src[j + 2] * weight;
                    total += weight;
                }
            }
            out[i] = red / total;
            out[i + 1] = green / total;
            out[i + 2] = blue / total;
            out[i + 3] = 255;
        }
    }
    return out;
}

/**
 * Evaluates a single layer of finite, tapered, staggered hand-drawn pencil strokes
 * in rotated global coordinates (u along stroke, v across stroke).
 */
function evalStrokeLayer(
    u: number,
    vw: number,
    spacing: number,
    leadHalfWidth: number,
    strokeLen: number,
    seed: number,
): number {
    const row = Math.floor(vw / spacing);
    const distPx = Math.abs(vw - (row + 0.5) * spacing);
    if (distPx >= leadHalfWidth) return 0;

    const leadProfile = 1 - smoothstep(0, leadHalfWidth, distPx);
    const rowPhase = hash2d(row, 17, seed);
    const uShifted = u + rowPhase * 43.0;
    const seg = Math.floor(uShifted / strokeLen);
    const segT = uShifted / strokeLen - seg;

    // Tapered stroke ends so strokes start and finish organically rather than running endlessly
    const taper = smoothstep(0.0, 0.16, segT) * (1 - smoothstep(0.84, 1.0, segT));
    const pressure = 0.42 + 0.58 * hash2d(row, seg, seed + 19);
    return leadProfile * taper * pressure;
}

/**
 * Synthesizes two staggered, overlapping layers of finite colored-pencil strokes
 * along basis direction `dirIdx`, avoiding both infinite zebra bands and sandpaper noise.
 */
function sampleHandPencilStroke(
    px: number,
    py: number,
    dirIdx: number,
    spacing: number,
    leadHalfWidth: number,
    strokeLen: number,
    seed: number,
): number {
    const co = BASIS_COS[dirIdx], si = BASIS_SIN[dirIdx];
    const u = px * co + py * si;
    const v = -px * si + py * co;
    const wobble = (valueNoise(u * 0.032, v * 0.085, 1, seed + 3) - 0.5) * 1.1;
    const vw = v + wobble;

    const a = evalStrokeLayer(u, vw, spacing, leadHalfWidth, strokeLen, seed);
    const b = evalStrokeLayer(u + strokeLen * 0.48, vw + spacing * 0.5, spacing, leadHalfWidth, strokeLen * 0.92, seed + 53);
    return Math.min(1, a * 0.68 + b * 0.62);
}

/** Bilinearly samples the precomputed full-image neural line-art sketch map at global grid coordinates. */
function sampleAiSketch(
    sketchBytes: Uint8Array,
    aw: number,
    ah: number,
    px: number,
    py: number,
    step: number,
    fullW: number,
    fullH: number,
): number {
    const fx = Math.max(0, Math.min(aw - 1, ((px + 0.5) * step / fullW) * aw - 0.5));
    const fy = Math.max(0, Math.min(ah - 1, ((py + 0.5) * step / fullH) * ah - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(aw - 1, x0 + 1), y1 = Math.min(ah - 1, y0 + 1);
    const wx = fx - x0, wy = fy - y0;
    const v00 = sketchBytes[y0 * aw + x0], v10 = sketchBytes[y0 * aw + x1];
    const v01 = sketchBytes[y1 * aw + x0], v11 = sketchBytes[y1 * aw + x1];
    return ((v00 * (1 - wx) + v10 * wx) * (1 - wy) + (v01 * (1 - wx) + v11 * wx) * wy) / 255;
}

export function pencil(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    p: Record<string, number>,
    ctx: StyleContext & { pencilSketch?: RenderPencilSketch },
): Uint8ClampedArray {
    const grid = styleGrid(src, w, h, ctx, PENCIL_STYLE_SIDE);
    const { width: sw, height: sh, gx, gy, step } = grid;
    const n = sw * sh;

    // 1. Painterly color-plane simplification (eliminates camera noise/pores while keeping edges sharp)
    const smooth1 = edgeSmooth(grid.data, sw, sh);
    const smooth2 = edgeSmoothDilated(smooth1, sw, sh);
    const smooth3 = edgeSmoothDilated(smooth2, sw, sh);
    const prepared = edgeSmooth(smooth3, sw, sh);

    const hasAiSketch =
        !!ctx.pencilSketch &&
        ctx.pencilSketch.width > 0 &&
        ctx.pencilSketch.height > 0 &&
        ctx.pencilSketch.sketchBuffer.byteLength >= ctx.pencilSketch.width * ctx.pencilSketch.height;
    const aiSketchBytes = hasAiSketch ? new Uint8Array(ctx.pencilSketch!.sketchBuffer) : null;
    const aiW = ctx.pencilSketch?.width ?? 0;
    const aiH = ctx.pencilSketch?.height ?? 0;

    const rawLum = new Float32Array(n);
    const lum = new Float32Array(n);
    const sat = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        const i = q * 4;
        const r = prepared[i], g = prepared[i + 1], b = prepared[i + 2];
        if (!hasAiSketch) {
            rawLum[q] = luminance(smooth2[i], smooth2[i + 1], smooth2[i + 2]);
        }
        lum[q] = luminance(r, g, b);
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
        sat[q] = hi === 0 ? 0 : (hi - lo) / hi;
    }

    // 2. Structure tensor (+ classical XDoG/Sobel contour fallback when AI sketch is absent)
    const xx = new Float32Array(n);
    const yy = new Float32Array(n);
    const xy = new Float32Array(n);
    let sketchRaw: Float32Array | null = null;

    if (hasAiSketch) {
        for (let y = 0; y < sh; y++) {
            const y0 = Math.max(0, y - 1), y1 = Math.min(sh - 1, y + 1);
            for (let x = 0; x < sw; x++) {
                const x0 = Math.max(0, x - 1), x1 = Math.min(sw - 1, x + 1);
                const q = y * sw + x;
                const gxS = (lum[y * sw + x1] - lum[y * sw + x0]) * 0.5;
                const gyS = (lum[y1 * sw + x] - lum[y0 * sw + x]) * 0.5;
                xx[q] = gxS * gxS;
                yy[q] = gyS * gyS;
                xy[q] = gxS * gyS;
            }
        }
    } else {
        const blurFine = boxBlur(rawLum, sw, sh, 1);
        const blurCoarse = boxBlur(lum, sw, sh, 3);
        const grad = new Float32Array(n);

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
                const lumMag = Math.hypot(gxSobel, gySobel);

                const iL = (y * sw + x0) * 4, iR = (y * sw + x1) * 4;
                const iT = (y0 * sw + x) * 4, iB = (y1 * sw + x) * 4;
                const chrX = Math.max(
                    Math.abs(smooth1[iR] - smooth1[iL]),
                    Math.abs(smooth1[iR + 1] - smooth1[iL + 1]),
                    Math.abs(smooth1[iR + 2] - smooth1[iL + 2]),
                ) * 0.25;
                const chrY = Math.max(
                    Math.abs(smooth1[iB] - smooth1[iT]),
                    Math.abs(smooth1[iB + 1] - smooth1[iT + 1]),
                    Math.abs(smooth1[iB + 2] - smooth1[iT + 2]),
                ) * 0.25;
                const l = lum[q];
                const chrWeight = 0.68 * (1 - smoothstep(155, 222, l));
                const mag = Math.max(lumMag, Math.hypot(chrX, chrY) * chrWeight);

                const cPix = q * 4;
                const skyBlue = smoothstep(130, 190, blurCoarse[q]) * smoothstep(6, 24, prepared[cPix + 2] - prepared[cPix]);
                const softCloudSuppress = Math.max(
                    smoothstep(155, 225, l) * (1 - smoothstep(10, 30, lumMag)) * 0.85,
                    skyBlue * (1 - smoothstep(22, 52, lumMag)) * 0.86,
                );
                const dog = Math.max(0, blurCoarse[q] - blurFine[q] - 1.75);
                grad[q] = Math.max(0, (mag * 0.94 + dog * 0.82) * (1 - softCloudSuppress));

                xx[q] = gxSobel * gxSobel;
                yy[q] = gySobel * gySobel;
                xy[q] = gxSobel * gySobel;
            }
        }

        const convRadius = Math.max(1, Math.min(2, Math.round(0.8 + p.stroke * 0.14)));
        const winDir = new Uint8Array(n);
        const winVal = new Float32Array(n);
        const dirSums = new Float32Array(8);

        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const q = y * sw + x;
                const g0 = grad[q];
                if (g0 < 1.6) continue;
                let bestDir = 0;
                let bestSum = -1;
                for (let d = 0; d < 8; d++) {
                    const dx = DIR_COS[d], dy = DIR_SIN[d];
                    let sum = g0;
                    for (let s = 1; s <= convRadius; s++) {
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
                const orthoDir = (bestDir + 4) & 7;
                const orthoSum = dirSums[orthoDir];
                const anisotropy = Math.max(0, (bestSum - orthoSum * 0.84) / (bestSum + 1e-4));

                const ox = Math.round(DIR_COS[orthoDir]), oy = Math.round(DIR_SIN[orthoDir]);
                const qPos = Math.max(0, Math.min(sh - 1, y + oy)) * sw + Math.max(0, Math.min(sw - 1, x + ox));
                const qNeg = Math.max(0, Math.min(sh - 1, y - oy)) * sw + Math.max(0, Math.min(sw - 1, x - ox));
                const ridgeFactor = g0 >= Math.max(grad[qPos], grad[qNeg]) * 0.90 ? 1.0 : 0.65;

                const lineContinuity = smoothstep(g0 * 0.85, g0 * 2.15, bestSum - g0);
                winDir[q] = bestDir;
                winVal[q] = g0 * (0.15 + 1.05 * anisotropy) * ridgeFactor * lineContinuity;
            }
        }

        sketchRaw = new Float32Array(n);
        const normFactor = 1 / (2 * convRadius + 1);
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const q = y * sw + x;
                let acc = winVal[q] * 1.25;
                for (let d = 0; d < 8; d++) {
                    const dx = DIR_COS[d], dy = DIR_SIN[d];
                    for (let s = 1; s <= convRadius; s++) {
                        const wt = 1 - (s - 0.5) / (convRadius + 1);
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
    }

    // Multi-scale diffused structure tensor: propagates object/limb/fold orientation smoothly into flat interiors
    const jxx = boxBlur(boxBlur(xx, sw, sh, 4), sw, sh, 4);
    const jyy = boxBlur(boxBlur(yy, sw, sh, 4), sw, sh, 4);
    const jxy = boxBlur(boxBlur(xy, sw, sh, 4), sw, sh, 4);

    // 3. Layered Finite Colored-Pencil Strokes + Fine Cotton Paper Transmittance + Neural Line Art
    const out = new Uint8ClampedArray(prepared.length);
    const lineStrength = p.line / 100;
    const pigment = p.pigment / 100;
    const paperStrength = p.paper / 100;
    const hatchBlend = Math.max(0, Math.min(1, (p.hatch ?? 36) / 100));
    const warmShift = ((p.warmPaper ?? 40) - 40) / 100;
    const strokeScale = p.stroke;

    const spacing = 1.50 + (strokeScale - 1) * 0.38;
    const leadHalfWidth = 0.58 + (strokeScale - 1) * 0.15;
    const strokeLen = 12.0 + (strokeScale - 1) * 1.8;

    const paperBaseR = clamp(252 + warmShift * 4);
    const paperBaseG = clamp(248 - warmShift * 3);
    const paperBaseB = clamp(240 - warmShift * 14);

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const q = y * sw + x, i = q * 4;
            const px = gx + x, py = gy + y;

            // Cotton drawing paper tooth & subtle woven fiber relief
            const fineTooth = valueNoise(px, py, 0.62, PAPER_SEED) - 0.5;
            const medTooth = valueNoise(px, py, 0.22, PAPER_SEED + 3) - 0.5;
            const coarseFiber = valueNoise(px, py, 0.06, PAPER_SEED + 5) - 0.5;
            const paperRelief = fineTooth * 0.55 + medTooth * 0.31 + coarseFiber * 0.14;
            const paperShade = paperRelief * (8 + paperStrength * 22);

            const pR = clamp(paperBaseR + paperShade * 0.90);
            const pG = clamp(paperBaseG + paperShade * 0.95);
            const pB = clamp(paperBaseB + paperShade * 1.05);

            // Smooth diffused contour flow orientation
            const txx = jxx[q], tyy = jyy[q], txy = jxy[q];
            const tensorEnergy = txx + tyy;
            const coherence = Math.min(1, Math.hypot(txx - tyy, 2 * txy) / (tensorEnergy + 10));
            const tangentAngle = 0.5 * Math.atan2(2 * txy, txx - tyy) + Math.PI * 0.5;

            const macroDrift = (coarseFiber * 1.35) - 0.61;
            const steer = Math.min(0.95, coherence * 1.45);
            const sin2 = Math.sin(2 * tangentAngle) * steer + Math.sin(2 * macroDrift) * (1 - steer);
            const cos2 = Math.cos(2 * tangentAngle) * steer + Math.cos(2 * macroDrift) * (1 - steer);
            const flowAngle = ((0.5 * Math.atan2(sin2, cos2)) % Math.PI + Math.PI) % Math.PI;

            const binF = flowAngle * (BASIS_COUNT / Math.PI);
            const b0 = Math.floor(binF) % BASIS_COUNT;
            const b1 = (b0 + 1) % BASIS_COUNT;
            const frac = smoothstep(0, 1, binF - Math.floor(binF));

            const s0 = sampleHandPencilStroke(px, py, b0, spacing, leadHalfWidth, strokeLen, PAPER_SEED + 11 + b0 * 17);
            const s1 = sampleHandPencilStroke(px, py, b1, spacing, leadHalfWidth, strokeLen, PAPER_SEED + 11 + b1 * 17);
            const primaryStroke = s0 * (1 - frac) + s1 * frac;

            const l = lum[q];
            const cR = prepared[i], cG = prepared[i + 1], cB = prepared[i + 2];
            const s = sat[q];

            const paperReserve = smoothstep(202, 250, l) * (1 - s * 0.74);
            const darkness = (255 - l) / 255;
            const shadowWeight = smoothstep(0.20, 0.70, darkness);

            let crossStroke = primaryStroke;
            const crossMix = (0.18 + 0.82 * shadowWeight) * hatchBlend;
            if (crossMix > 0.015) {
                const c0Idx = (b0 + 2) % BASIS_COUNT;
                const c1Idx = (b1 + 2) % BASIS_COUNT;
                const c0 = sampleHandPencilStroke(px, py, c0Idx, spacing * 1.06, leadHalfWidth, strokeLen * 0.92, PAPER_SEED + 131 + c0Idx * 19);
                const c1 = sampleHandPencilStroke(px, py, c1Idx, spacing * 1.06, leadHalfWidth, strokeLen * 0.92, PAPER_SEED + 131 + c1Idx * 19);
                crossStroke = c0 * (1 - frac) + c1 * frac;
            }

            const strokeVisibility = (0.58 + 0.42 * smoothstep(0.08, 0.54, darkness))
                * (0.78 + 0.22 * smoothstep(0.08, 0.42, coherence))
                * (0.44 + 0.56 * hatchBlend);

            const layeredStrokes = primaryStroke * (1 - crossMix * 0.44) + crossStroke * (crossMix * 0.44);

            // Airy, luminous colored-pencil wax pigment
            const satBoost = 0.98 + pigment * 0.24;
            const liftedL = l + Math.max(0, (66 - l) * 0.16);
            const pigR = Math.max(12, Math.min(254, liftedL + (cR - l) * satBoost));
            const pigG = Math.max(12, Math.min(254, liftedL + (cG - l) * satBoost));
            const pigB = Math.max(12, Math.min(254, liftedL + (cB - l) * satBoost));

            const darkAnchor = 1 + smoothstep(0.65, 0.95, darkness) * 0.34;
            const baseGamma = (0.31 + pigment * 0.58) * darkAnchor * (1 - paperReserve * 0.44);
            const strokeDeviation = layeredStrokes - 0.40;
            const strokeMod = 1 + strokeDeviation * (0.64 + hatchBlend * 0.58) * strokeVisibility;
            const toothEffect = 1 + paperRelief * (0.42 + paperStrength * 0.80) * (1 - darkness * 0.42);
            const gamma = Math.max(0.02, baseGamma * Math.max(0.40, strokeMod) * Math.max(0.38, toothEffect));

            const shadedR = pR * ((pigR / 255) ** gamma);
            const shadedG = pG * ((pigG / 255) ** gamma);
            const shadedB = pB * ((pigB / 255) ** gamma);

            let sketchSoft = 0;
            if (aiSketchBytes) {
                const aiVal = sampleAiSketch(aiSketchBytes, aiW, aiH, px, py, step, ctx.fullWidth, ctx.fullHeight);
                sketchSoft = smoothstep(0.08, 0.56, 1 - aiVal);
            } else {
                const sVal = sketchRaw![q];
                sketchSoft = sVal <= 2.1 ? 0 : Math.tanh((sVal - 2.1) * 0.125);
            }
            const lineGrain = Math.max(0.48, Math.min(1.20, 0.96 + fineTooth * (0.42 + paperStrength * 0.58)));
            const lineAlpha = Math.min(0.92, sketchSoft * lineStrength * 1.12 * lineGrain);

            // Warm colored-pencil outline lead harmonized with local pigment
            const inkR = clamp(pigR * 0.19 + 20);
            const inkG = clamp(pigG * 0.17 + 18);
            const inkB = clamp(pigB * 0.21 + 17);

            out[i]     = clamp(shadedR * (1 - lineAlpha) + inkR * lineAlpha);
            out[i + 1] = clamp(shadedG * (1 - lineAlpha) + inkG * lineAlpha);
            out[i + 2] = clamp(shadedB * (1 - lineAlpha) + inkB * lineAlpha);
            out[i + 3] = 255;
        }
    }

    return expandGrid(out, grid, w, h, ctx);
}
