import { boxBlur } from '../shared/blur';
import { clamp, luminance, smoothstep } from '../shared/color';

/**
 * 2D 线条像素插画风 (PIXEL LINE)
 *
 * Combines three Non-Photorealistic Rendering (NPR) techniques so both full-scene pixel
 * structure and fine portrait/facial features remain crisp and readable:
 *  1. Content-Adaptive Quadtree / Multi-Scale Pixel Grid (inspired by Gerstner et al.,
 *     "Pixelated Image Abstraction", NPAR 2012): flat regions and broad limbs quantize to
 *     clean `size x size` pixel blocks, while high-density feature regions (faces, hands,
 *     logos) and sharp contours subdivide into `fineSize x fineSize` pixel sub-blocks so
 *     facial features never blur into a coarse mosaic.
 *  2. Perceptual Oklab Illustration Palette Quantization with tonal smoothing.
 *  3. XDoG + Gradient Ridge 2D Pixel-Line Extraction (inspired by Winnemöller et al.,
 *     "XDoG: An eXtended Difference-of-Gaussians Compendium", 2012, and Inglis & Kaplan,
 *     "Pixelating Vector Line Art", NPAR 2012) snapped to the fine pixel grid with
 *     hue-preserving Selective Outlining (Sel-Out).
 */

function srgbToLinear(v: number): number {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
    const c = Math.max(0, Math.min(1, v));
    return (c <= 0.0031308 ? 12.92 * c : 1.055 * (c ** (1 / 2.4)) - 0.055) * 255;
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
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

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
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

function quantizeOklabColor(
    r: number,
    g: number,
    b: number,
    levels: number,
    faceProtect: number,
): [number, number, number] {
    const [L, a, ob] = rgbToOklab(r, g, b);
    // Gentle S-curve contrast keeps colors vibrant without harsh midtone splits on faces
    const sStrength = 0.30 * (1 - faceProtect * 0.55);
    const curved = L + (smoothstep(0.02, 0.98, L) - L) * sStrength;
    const effLevels = levels * (1 + faceProtect * 0.65);
    const lStep = 1 / (effLevels + 1);
    const scaledL = curved / lStep - 0.5;
    const baseIdx = Math.floor(scaledL);
    const frac = scaledL - baseIdx;
    const snappedIdx = baseIdx + (faceProtect > 0.25 ? smoothstep(0.22, 0.78, frac) : Math.round(frac));
    const qL = Math.max(0, Math.min(1, (snappedIdx + 0.5) * lStep));

    const chroma = Math.hypot(a, ob);
    const chromaBoost = 1.16 - faceProtect * 0.1;
    const boosted = Math.min(0.32, chroma * chromaBoost);
    const chromaStep = 0.32 / Math.max(4, levels + 1);
    const qChroma = chroma < 0.01 ? 0 : Math.max(1, Math.round(boosted / chromaStep)) * chromaStep;
    const finalChroma = qChroma * (1 - faceProtect * 0.4) + boosted * (faceProtect * 0.4);
    const scaleC = chroma > 1e-5 ? finalChroma / chroma : 0;

    const [qr, qg, qb] = oklabToRgb(qL, a * scaleC, ob * scaleC);
    return [clamp(Math.round(qr)), clamp(Math.round(qg)), clamp(Math.round(qb))];
}

export function pixel(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    p: Record<string, number>,
    originX: number,
    originY: number,
    scale: number,
): Uint8ClampedArray {
    const size = Math.max(2, Math.round((p.size ?? 6) * scale));
    const filterNorm = Math.max(0, Math.min(1, (p.filter ?? 65) / 100));
    const inkStrength = Math.max(0, Math.min(1, (p.ink ?? 70) / 100));
    const levels = Math.max(2, Math.round(p.colors ?? 9));
    const n = w * h;

    // Fine pixel unit for 2D linework and detail subdivision (e.g. 2px when size=6, 1px when size<=3)
    const fineSize = size <= 3 ? 1 : Math.max(2, Math.round(size / 3));

    // ---------- 1. Luminance, warm-tone detection, and multi-scale XDoG / gradient ----------
    const lum = new Float32Array(n);
    const sat = new Float32Array(n);
    const warm = new Float32Array(n);

    for (let q = 0; q < n; q++) {
        const i = q * 4;
        const r = src[i], g = src[i + 1], b = src[i + 2];
        const l = luminance(r, g, b);
        lum[q] = l;
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
        const s = hi > 0 ? (hi - lo) / hi : 0;
        sat[q] = s;
        if (r > g && g >= b * 0.92 && l > 35 && l < 242) {
            const rgDiff = (r - b) / 255;
            warm[q] = smoothstep(0.05, 0.20, rgDiff) * (1 - smoothstep(0.58, 0.85, s));
        }
    }

    const warmContext = w > 2 && h > 2 ? boxBlur(warm, w, h, Math.max(2, size)) : warm;
    const blurFine = w > 2 && h > 2 ? boxBlur(lum, w, h, Math.max(1, Math.floor(fineSize * 0.5))) : lum;
    const blurMid = w > 2 && h > 2 ? boxBlur(lum, w, h, Math.max(2, Math.round(size * 0.5))) : lum;
    const blurBroad = w > 2 && h > 2 ? boxBlur(lum, w, h, Math.max(3, size)) : lum;

    const grad = new Float32Array(n);
    const dogField = new Float32Array(n);
    const featureSeed = new Float32Array(n);

    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
            const q = y * w + x;
            const gx = (lum[y * w + x1] - lum[y * w + x0]) * 0.5;
            const gy = (lum[y1 * w + x] - lum[y0 * w + x]) * 0.5;
            const gMag = Math.hypot(gx, gy);
            grad[q] = gMag;

            // Sharp dark feature valley (XDoG): emphasizes compact dark strokes (eyes, lashes, brows, lips, seams)
            const valleySharp = Math.max(0, blurMid[q] - blurFine[q]);
            const valleyWide = Math.max(0, blurBroad[q] - blurFine[q]);
            const dog = valleySharp * 0.72 + valleyWide * 0.28;
            dogField[q] = dog;

            // Compact feature density seed: high where warm skin meets dark features (eyes, brows, hair, mouth, fingers)
            if (warmContext[q] > 0.12 && (dog > 7 || gMag > 14)) {
                featureSeed[q] = warmContext[q] * smoothstep(6, 26, dog * 1.3 + gMag * 0.7);
            }
        }
    }

    // Face / compact-feature zone: high where warm tones have dense internal features (faces, hands),
    // while broad smooth limbs (legs/arms interior) keep low density so they show crisp pixel blocks!
    const featureDensity = w > 2 && h > 2 ? boxBlur(featureSeed, w, h, Math.max(3, size * 2)) : featureSeed;

    const detailField = new Float32Array(n);
    const lineInkField = new Float32Array(n);

    for (let q = 0; q < n; q++) {
        const wc = warmContext[q];
        const fd = Math.min(1, featureDensity[q] * 3.8);
        const gMag = grad[q];
        const dog = dogField[q];

        // Suppress faint texture in bright, low-saturation flat backgrounds (ceiling, walls)
        const isFlatBright = blurBroad[q] > 160 && sat[q] < 0.22 && wc < 0.15;
        const bgSuppress = isFlatBright ? 0.4 + filterNorm * 0.55 : 0;

        const rawDetail = (gMag * 0.95 + dog * 1.75) * (1 - bgSuppress * 0.75);
        const detailThreshLo = (11 + filterNorm * 15) * (1 - fd * 0.5);
        const detailThreshHi = (27 + filterNorm * 24) * (1 - fd * 0.45);
        detailField[q] = Math.max(
            fd * 0.92,
            smoothstep(detailThreshLo, detailThreshHi, rawDetail),
        );

        // 2D Illustration Line response:
        // Require a crisp gradient or sharp XDoG valley so soft nose/cheek shadows don't turn into dark blotches
        const crispFactor = smoothstep(3.5, 14, gMag + dog * 0.6);
        const valleyThresh = (7.5 + filterNorm * 9.5) * (1 - fd * 0.38) * (1 + bgSuppress * 1.4);
        const valleyInk = smoothstep(valleyThresh, valleyThresh * 2.3 + 8, dog) * crispFactor;

        const gradThresh = (15 + filterNorm * 19) * (1 - fd * 0.30) * (1 + bgSuppress * 1.2);
        const gradInk = smoothstep(gradThresh, gradThresh * 2.1 + 11, gMag) * 0.78;

        lineInkField[q] = Math.max(valleyInk, gradInk);
    }

    // ---------- 2. Macro Grid (`size x size`) Sampling & Quantization ----------
    const pad = 3;
    const gx0 = Math.floor(originX / size) * size - pad * size;
    const gy0 = Math.floor(originY / size) * size - pad * size;
    const gridW = Math.ceil((originX + w - gx0) / size) + pad;
    const gridH = Math.ceil((originY + h - gy0) / size) + pad;
    const nCells = gridW * gridH;

    const rawR = new Float32Array(nCells);
    const rawG = new Float32Array(nCells);
    const rawB = new Float32Array(nCells);
    const cellFace = new Float32Array(nCells);
    const cellDetail = new Float32Array(nCells);

    const half = (size - 1) * 0.5;
    const invSigma = 1 / Math.max(1, size * 0.55);

    for (let gy = 0; gy < gridH; gy++) {
        const sy = gy0 + gy * size - originY;
        const yStart = Math.max(0, Math.min(h - 1, sy));
        const yEnd = Math.max(yStart + 1, Math.min(h, sy + size));
        for (let gx = 0; gx < gridW; gx++) {
            const sx = gx0 + gx * size - originX;
            const xStart = Math.max(0, Math.min(w - 1, sx));
            const xEnd = Math.max(xStart + 1, Math.min(w, sx + size));

            let meanL = 0, wSum = 0, fSum = 0, maxDet = 0;
            for (let yy = yStart; yy < yEnd; yy++) {
                const dy = (yy - sy - half) * invSigma;
                for (let xx = xStart; xx < xEnd; xx++) {
                    const dx = (xx - sx - half) * invSigma;
                    const sw = 1 / (1 + dx * dx + dy * dy);
                    const q = yy * w + xx;
                    meanL += lum[q] * sw;
                    fSum += Math.min(1, featureDensity[q] * 3.8) * sw;
                    if (detailField[q] > maxDet) maxDet = detailField[q];
                    wSum += sw;
                }
            }
            meanL /= wSum || 1;
            fSum /= wSum || 1;

            let r = 0, g = 0, b = 0, total = 0;
            for (let yy = yStart; yy < yEnd; yy++) {
                const dy = (yy - sy - half) * invSigma;
                for (let xx = xStart; xx < xEnd; xx++) {
                    const dx = (xx - sx - half) * invSigma;
                    const q = yy * w + xx, i = q * 4;
                    const lDiff = (lum[q] - meanL) / 30;
                    const wt = 1 / ((1 + dx * dx + dy * dy) * (1 + lDiff * lDiff));
                    r += src[i] * wt;
                    g += src[i + 1] * wt;
                    b += src[i + 2] * wt;
                    total += wt;
                }
            }
            const c = gy * gridW + gx;
            rawR[c] = r / total;
            rawG[c] = g / total;
            rawB[c] = b / total;
            cellFace[c] = fSum;
            cellDetail[c] = maxDet;
        }
    }

    // Macro cell bilateral speckle filter (cleans up background concrete/foliage noise)
    const smoothR = new Float32Array(nCells);
    const smoothG = new Float32Array(nCells);
    const smoothB = new Float32Array(nCells);
    const smoothL = new Float32Array(nCells);
    const rangeSigma = 10 + filterNorm * 28;
    const spatialBlend = 0.15 + filterNorm * 0.75;

    for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
            const c = gy * gridW + gx;
            const cr = rawR[c], cg = rawG[c], cb = rawB[c];
            let sr = cr * 2, sg = cg * 2, sb = cb * 2, wtSum = 2;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = Math.max(0, Math.min(gridH - 1, gy + dy));
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nc = ny * gridW + Math.max(0, Math.min(gridW - 1, gx + dx));
                    const dist = Math.abs(rawR[nc] - cr) + Math.abs(rawG[nc] - cg) + Math.abs(rawB[nc] - cb);
                    const wt = spatialBlend * (dx === 0 || dy === 0 ? 1 : 0.5) * Math.exp(-((dist / rangeSigma) ** 2));
                    sr += rawR[nc] * wt;
                    sg += rawG[nc] * wt;
                    sb += rawB[nc] * wt;
                    wtSum += wt;
                }
            }
            smoothR[c] = sr / wtSum;
            smoothG[c] = sg / wtSum;
            smoothB[c] = sb / wtSum;
            smoothL[c] = luminance(smoothR[c], smoothG[c], smoothB[c]);
        }
    }

    const macroR = new Float32Array(nCells);
    const macroG = new Float32Array(nCells);
    const macroB = new Float32Array(nCells);
    for (let c = 0; c < nCells; c++) {
        const [qr, qg, qb] = quantizeOklabColor(smoothR[c], smoothG[c], smoothB[c], levels, cellFace[c]);
        macroR[c] = qr;
        macroG[c] = qg;
        macroB[c] = qb;
    }

    // ---------- 3. Fine Sub-Grid (`fineSize x fineSize`) for Adaptive Detail & 2D Lines ----------
    const fPad = 2;
    const fx0 = Math.floor(originX / fineSize) * fineSize - fPad * fineSize;
    const fy0 = Math.floor(originY / fineSize) * fineSize - fPad * fineSize;
    const fGridW = Math.ceil((originX + w - fx0) / fineSize) + fPad;
    const fGridH = Math.ceil((originY + h - fy0) / fineSize) + fPad;
    const nFine = fGridW * fGridH;

    const fineR = new Float32Array(nFine);
    const fineG = new Float32Array(nFine);
    const fineB = new Float32Array(nFine);
    const fineDetail = new Float32Array(nFine);
    const fineInk = new Float32Array(nFine);

    for (let fy = 0; fy < fGridH; fy++) {
        const sy = fy0 + fy * fineSize - originY;
        const yStart = Math.max(0, Math.min(h - 1, sy));
        const yEnd = Math.max(yStart + 1, Math.min(h, sy + fineSize));
        for (let fx = 0; fx < fGridW; fx++) {
            const sx = fx0 + fx * fineSize - originX;
            const xStart = Math.max(0, Math.min(w - 1, sx));
            const xEnd = Math.max(xStart + 1, Math.min(w, sx + fineSize));

            let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
            let maxInk = 0, sumInk = 0, maxDet = 0, faceAvg = 0, count = 0;
            for (let yy = yStart; yy < yEnd; yy++) {
                for (let xx = xStart; xx < xEnd; xx++) {
                    const q = yy * w + xx, i = q * 4;
                    const ink = lineInkField[q];
                    const wt = 1 + ink * 2.5;
                    rSum += src[i] * wt;
                    gSum += src[i + 1] * wt;
                    bSum += src[i + 2] * wt;
                    wSum += wt;
                    if (ink > maxInk) maxInk = ink;
                    sumInk += ink;
                    if (detailField[q] > maxDet) maxDet = detailField[q];
                    faceAvg += Math.min(1, featureDensity[q] * 3.8);
                    count++;
                }
            }
            const fc = fy * fGridW + fx;
            const mr = rSum / wSum, mg = gSum / wSum, mb = bSum / wSum;
            const fNorm = faceAvg / (count || 1);
            const [qr, qg, qb] = quantizeOklabColor(mr, mg, mb, levels, fNorm);
            fineR[fc] = qr;
            fineG[fc] = qg;
            fineB[fc] = qb;
            fineDetail[fc] = maxDet;
            fineInk[fc] = maxInk * 0.65 + (sumInk / (count || 1)) * 0.35;
        }
    }

    // ---------- 4. Composite Macro Pixel Blocks + Adaptive Fine Detail + 2D Pixel Lines ----------
    const edgeJump = (c1: number, c2: number): number => {
        const lumDiff = Math.abs(smoothL[c1] - smoothL[c2]);
        const colDiff = (
            Math.abs(smoothR[c1] - smoothR[c2]) +
            Math.abs(smoothG[c1] - smoothG[c2]) +
            Math.abs(smoothB[c1] - smoothB[c2])
        ) * 0.22;
        const avgLum = (smoothL[c1] + smoothL[c2]) * 0.5;
        const skyDamp = avgLum > 170 ? (avgLum - 170) * 0.25 : 0;
        return lumDiff * 0.85 + colDiff - skyDamp;
    };

    const macroEdgeThresh = 24 + filterNorm * 32;
    const strokePx = fineSize;

    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
        const wy = originY + y - gy0;
        const gy = Math.floor(wy / size);
        const localY = wy - gy * size;
        const mRow = gy * gridW;

        const fwy = originY + y - fy0;
        const fy = Math.floor(fwy / fineSize);
        const fRow = fy * fGridW;

        for (let x = 0; x < w; x++) {
            const wx = originX + x - gx0;
            const gx = Math.floor(wx / size);
            const localX = wx - gx * size;
            const mc = mRow + gx;

            const fwx = originX + x - fx0;
            const fx = Math.floor(fwx / fineSize);
            const fc = fRow + fx;

            // Adaptive blend between macro `size x size` block and fine `fineSize x fineSize` block
            const det = Math.max(cellDetail[mc] * 0.35, fineDetail[fc]);
            const subMix = smoothstep(0.28, 0.72, det);

            let r = macroR[mc] + (fineR[fc] - macroR[mc]) * subMix;
            let g = macroG[mc] + (fineG[fc] - macroG[mc]) * subMix;
            let b = macroB[mc] + (fineB[fc] - macroB[mc]) * subMix;

            if (inkStrength > 0.001) {
                let blockEdge = 0;
                if (gx > 0 && gy > 0 && gx < gridW - 1 && gy < gridH - 1) {
                    const lC = smoothL[mc];
                    const cL = mc - 1, cR = mc + 1, cU = mc - gridW, cD = mc + gridW;
                    const jL = lC <= smoothL[cL] ? edgeJump(mc, cL) : 0;
                    const jR = lC < smoothL[cR] ? edgeJump(mc, cR) : 0;
                    const jU = lC <= smoothL[cU] ? edgeJump(mc, cU) : 0;
                    const jD = lC < smoothL[cD] ? edgeJump(mc, cD) : 0;

                    const onLeft = localX < strokePx ? jL : 0;
                    const onRight = localX >= size - strokePx ? jR : 0;
                    const onTop = localY < strokePx ? jU : 0;
                    const onBottom = localY >= size - strokePx ? jD : 0;

                    let diagScore = 0;
                    if (localX < strokePx && localY < strokePx && lC <= smoothL[mc - gridW - 1]) {
                        const topHasLeft = smoothL[cU] <= smoothL[mc - gridW - 1] ? edgeJump(cU, mc - gridW - 1) : 0;
                        const leftHasTop = smoothL[cL] <= smoothL[mc - gridW - 1] ? edgeJump(cL, mc - gridW - 1) : 0;
                        if (topHasLeft > macroEdgeThresh && leftHasTop > macroEdgeThresh) {
                            diagScore = Math.min(topHasLeft, leftHasTop);
                        }
                    }

                    const maxJump = Math.max(onLeft, onRight, onTop, onBottom, diagScore);
                    if (maxJump > macroEdgeThresh) {
                        blockEdge = smoothstep(macroEdgeThresh * 0.9, macroEdgeThresh + 26, maxJump) * (1 - cellFace[mc] * 0.85);
                    }
                }

                const fineLine = fineInk[fc];
                const combinedEdge = Math.max(blockEdge, fineLine) * inkStrength;

                if (combinedEdge > 0.01) {
                    // Selective outline (Sel-Out): deep hue-tinted illustration ink
                    const inkR = r * 0.17 + 9;
                    const inkG = g * 0.15 + 9;
                    const inkB = b * 0.22 + 15;
                    const mix = Math.min(0.92, combinedEdge * 0.9);
                    r += (inkR - r) * mix;
                    g += (inkG - g) * mix;
                    b += (inkB - b) * mix;
                }
            }

            const i = (y * w + x) * 4;
            out[i] = clamp(Math.round(r));
            out[i + 1] = clamp(Math.round(g));
            out[i + 2] = clamp(Math.round(b));
            out[i + 3] = 255;
        }
    }
    return out;
}
