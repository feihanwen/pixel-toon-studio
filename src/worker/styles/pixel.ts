import { clamp, oklabToSrgbGamutSafe, rgbToOklab } from '../shared/color';

/**
 * 2D Pixel Art / Pixel Line Illustration
 *
 * Fuses the two open-source pipelines from:
 *  - yogthos/pixel-mosaic (Sobel 3x3 + 4-sector NMS edge detection, edge-aware
 *    luminance-median vs average block rendering, contrast adjustment)
 *  - painebenjamin/unfake.py (2x2 morphological open/close cleanup, perceptual
 *    color quantization, dominant-color block downscaling, jaggy/speck cleanup)
 */

// ---------- 1. unfake.py: 2x2 Morphological Open + Close Cleanup ----------
function erode2x2(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
        const y1 = Math.min(h - 1, y + 1);
        for (let x = 0; x < w; x++) {
            const x1 = Math.min(w - 1, x + 1);
            const i00 = (y * w + x) * 4;
            const i10 = (y * w + x1) * 4;
            const i01 = (y1 * w + x) * 4;
            const i11 = (y1 * w + x1) * 4;
            out[i00] = Math.min(src[i00], src[i10], src[i01], src[i11]);
            out[i00 + 1] = Math.min(src[i00 + 1], src[i10 + 1], src[i01 + 1], src[i11 + 1]);
            out[i00 + 2] = Math.min(src[i00 + 2], src[i10 + 2], src[i01 + 2], src[i11 + 2]);
            out[i00 + 3] = 255;
        }
    }
    return out;
}

function dilate2x2(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - 1);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - 1);
            const i00 = (y * w + x) * 4;
            const i10 = (y * w + x0) * 4;
            const i01 = (y0 * w + x) * 4;
            const i11 = (y0 * w + x0) * 4;
            out[i00] = Math.max(src[i00], src[i10], src[i01], src[i11]);
            out[i00 + 1] = Math.max(src[i00 + 1], src[i10 + 1], src[i01 + 1], src[i11 + 1]);
            out[i00 + 2] = Math.max(src[i00 + 2], src[i10 + 2], src[i01 + 2], src[i11 + 2]);
            out[i00 + 3] = 255;
        }
    }
    return out;
}

function morphologicalCleanup(src: Uint8ClampedArray, w: number, h: number, blend: number): Uint8ClampedArray {
    if (blend <= 0.01 || w < 2 || h < 2) {
        return src;
    }
    const opened = dilate2x2(erode2x2(src, w, h), w, h);
    const closed = erode2x2(dilate2x2(opened, w, h), w, h);
    if (blend >= 0.99) {
        return closed;
    }
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
        out[i] = clamp(Math.round(src[i] + (closed[i] - src[i]) * blend));
        out[i + 1] = clamp(Math.round(src[i + 1] + (closed[i + 1] - src[i + 1]) * blend));
        out[i + 2] = clamp(Math.round(src[i + 2] + (closed[i + 2] - src[i + 2]) * blend));
        out[i + 3] = 255;
    }
    return out;
}

// ---------- 2. pixel-mosaic: Sobel 3x3 + 4-Sector NMS Edge Detection ----------
function calculateEdgeMap(src: Uint8ClampedArray, w: number, h: number, edgeSharpness: number): Float32Array {
    const n = w * h;
    const gray = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        const i = q * 4;
        gray[q] = (src[i] + src[i + 1] + src[i + 2]) / 3;
    }

    const magnitudeMap = new Float32Array(n);
    const directionMap = new Float32Array(n);

    for (let y = 1; y < h - 1; y++) {
        const rowU = (y - 1) * w;
        const row = y * w;
        const rowD = (y + 1) * w;
        for (let x = 1; x < w - 1; x++) {
            const g00 = gray[rowU + x - 1], g01 = gray[rowU + x], g02 = gray[rowU + x + 1];
            const g10 = gray[row + x - 1], g12 = gray[row + x + 1];
            const g20 = gray[rowD + x - 1], g21 = gray[rowD + x], g22 = gray[rowD + x + 1];

            const gx = -g00 + g02 - 2 * g10 + 2 * g12 - g20 + g22;
            const gy = -g00 - 2 * g01 - g02 + g20 + 2 * g21 + g22;

            const q = row + x;
            magnitudeMap[q] = Math.sqrt(gx * gx + gy * gy);
            directionMap[q] = Math.atan2(gy, gx) + Math.PI / 2;
        }
    }

    // 4-sector Non-Maximum Suppression (exact logic from pixel-mosaic/src/edgeDetection.js)
    const suppressed = new Float32Array(n);
    const PI = Math.PI;
    const TAU = PI * 2;
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const mag = magnitudeMap[idx];
            if (mag === 0) continue;

            let dir = directionMap[idx] % TAU;
            if (dir < 0) dir += TAU;

            let n1: number;
            let n2: number;
            if ((dir >= 0 && dir < PI / 8) || (dir >= (15 * PI) / 8 && dir < TAU) || (dir >= (7 * PI) / 8 && dir < (9 * PI) / 8)) {
                n1 = magnitudeMap[idx - 1];
                n2 = magnitudeMap[idx + 1];
            } else if ((dir >= PI / 8 && dir < (3 * PI) / 8) || (dir >= (9 * PI) / 8 && dir < (11 * PI) / 8)) {
                n1 = magnitudeMap[(y - 1) * w + (x + 1)];
                n2 = magnitudeMap[(y + 1) * w + (x - 1)];
            } else if ((dir >= (3 * PI) / 8 && dir < (5 * PI) / 8) || (dir >= (11 * PI) / 8 && dir < (13 * PI) / 8)) {
                n1 = magnitudeMap[(y - 1) * w + x];
                n2 = magnitudeMap[(y + 1) * w + x];
            } else {
                n1 = magnitudeMap[(y - 1) * w + (x - 1)];
                n2 = magnitudeMap[(y + 1) * w + (x + 1)];
            }

            if (mag >= n1 && mag >= n2) {
                suppressed[idx] = mag;
            }
        }
    }

    // Tile-invariant threshold mapped from edgeSharpness (0..1)
    const thresh = 22 + (1 - edgeSharpness) * 58;
    const edgeMap = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        if (suppressed[q] >= thresh) {
            edgeMap[q] = 1.0;
        }
    }
    return edgeMap;
}

// ---------- 3. Perceptual Discrete Color Quantization (for Dominant Mode & Palette) ----------
function quantizePerceptualColor(
    r: number,
    g: number,
    b: number,
    colorCount: number,
): { r: number; g: number; b: number; key: number } {
    const [L, a, ob] = rgbToOklab(r, g, b);
    const lLevels = Math.max(2, Math.round(colorCount * 0.85 + 2));
    const lStep = 1 / (lLevels - 1);
    const lIdx = Math.max(0, Math.min(lLevels - 1, Math.round(L / lStep)));
    const qL = lIdx * lStep;

    const chroma = Math.hypot(a, ob);
    const cLevels = Math.max(3, Math.round(colorCount * 0.65 + 2));
    const cStep = 0.28 / cLevels;

    let cIdx = 0;
    let hIdx = 0;
    let qA = 0;
    let qB = 0;
    if (chroma >= 0.012) {
        cIdx = Math.max(1, Math.min(cLevels, Math.round(chroma / cStep)));
        const qC = cIdx * cStep;
        const angle = Math.atan2(ob, a);
        const hBins = Math.max(12, colorCount * 2);
        const hStep = (Math.PI * 2) / hBins;
        hIdx = Math.round((angle + Math.PI) / hStep) % hBins;
        const qAngle = hIdx * hStep - Math.PI;
        qA = Math.cos(qAngle) * qC;
        qB = Math.sin(qAngle) * qC;
    }

    const [qr, qg, qb] = oklabToSrgbGamutSafe(qL, qA, qB);
    const rr = clamp(Math.round(qr));
    const gg = clamp(Math.round(qg));
    const bb = clamp(Math.round(qb));
    const key = (lIdx << 16) | (cIdx << 8) | hIdx;
    return { r: rr, g: gg, b: bb, key };
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
    const size = Math.max(2, Math.round((p.size ?? 3) * scale));
    const edgeSharpness = Math.max(0, Math.min(1, (p.edgeSharpness ?? 80) / 100));
    const cleanupBlend = Math.max(0, Math.min(1, (p.cleanup ?? 45) / 100));
    const colorCount = Math.max(2, Math.round(p.colors ?? 12));
    const dominantNorm = Math.max(0, Math.min(1, (p.dominant ?? 70) / 100));
    const contrastFactor = Math.max(0.2, 1 + (p.contrast ?? 12) / 100);
    const n = w * h;

    // 1. unfake.py: 2x2 morphological open/close pre-cleanup
    const cleaned = morphologicalCleanup(src, w, h, cleanupBlend);

    // 2. pixel-mosaic: Sobel 3x3 + 4-sector NMS edge map
    const edgeMap = calculateEdgeMap(cleaned, w, h, edgeSharpness);

    // 3. Pre-quantize pixels (unfake.py pipeline runs color quantization before dominant block downscaling)
    const quantR = new Uint8ClampedArray(n);
    const quantG = new Uint8ClampedArray(n);
    const quantB = new Uint8ClampedArray(n);
    const quantKey = new Int32Array(n);
    for (let q = 0; q < n; q++) {
        const i = q * 4;
        const pq = quantizePerceptualColor(cleaned[i], cleaned[i + 1], cleaned[i + 2], colorCount);
        quantR[q] = pq.r;
        quantG[q] = pq.g;
        quantB[q] = pq.b;
        quantKey[q] = (pq.r << 16) | (pq.g << 8) | pq.b;
    }

    // 4. Global grid coordinates (aligned to originX, originY for seamless tiled export)
    const pad = 2;
    const gx0 = Math.floor(originX / size) * size - pad * size;
    const gy0 = Math.floor(originY / size) * size - pad * size;
    const gridW = Math.ceil((originX + w - gx0) / size) + pad;
    const gridH = Math.ceil((originY + h - gy0) / size) + pad;
    const nCells = gridW * gridH;

    const cellR = new Uint8ClampedArray(nCells);
    const cellG = new Uint8ClampedArray(nCells);
    const cellB = new Uint8ClampedArray(nCells);

    // Reusable buffers for block median & dominant-color counting
    const maxBlockLen = size * size;
    const lumArr = new Float32Array(maxBlockLen);
    const idxArr = new Int32Array(maxBlockLen);
    const keyCounts = new Map<number, number>();
    const dominantThreshold = 0.05 + (1 - dominantNorm) * 0.55;

    for (let gy = 0; gy < gridH; gy++) {
        const sy = gy0 + gy * size - originY;
        const yStart = Math.max(0, Math.min(h - 1, sy));
        const yEnd = Math.max(yStart + 1, Math.min(h, sy + size));
        for (let gx = 0; gx < gridW; gx++) {
            const sx = gx0 + gx * size - originX;
            const xStart = Math.max(0, Math.min(w - 1, sx));
            const xEnd = Math.max(xStart + 1, Math.min(w, sx + size));

            let sumR = 0;
            let sumG = 0;
            let sumB = 0;
            let edgeStrength = 0;
            let cnt = 0;
            keyCounts.clear();

            for (let yy = yStart; yy < yEnd; yy++) {
                const row = yy * w;
                for (let xx = xStart; xx < xEnd; xx++) {
                    const q = row + xx;
                    const i = q * 4;
                    const r = cleaned[i];
                    const g = cleaned[i + 1];
                    const b = cleaned[i + 2];

                    sumR += r;
                    sumG += g;
                    sumB += b;

                    if (edgeMap[q] > edgeStrength) {
                        edgeStrength = edgeMap[q];
                    }

                    // pixel-mosaic luminance formula for median sorting
                    lumArr[cnt] = 0.299 * r + 0.587 * g + 0.114 * b;
                    idxArr[cnt] = q;
                    cnt++;

                    const k = quantKey[q];
                    keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
                }
            }

            const avgR = sumR / cnt;
            const avgG = sumG / cnt;
            const avgB = sumB / cnt;

            // unfake.py: downscale_by_dominant_color
            let bestKey = -1;
            let bestCount = 0;
            for (const [k, c] of keyCounts) {
                if (c > bestCount) {
                    bestCount = c;
                    bestKey = k;
                }
            }

            let domR = avgR;
            let domG = avgG;
            let domB = avgB;
            if (bestKey >= 0 && bestCount / cnt >= dominantThreshold && dominantNorm > 0.01) {
                const dr = (bestKey >> 16) & 0xff;
                const dg = (bestKey >> 8) & 0xff;
                const db = bestKey & 0xff;
                domR = avgR + (dr - avgR) * dominantNorm;
                domG = avgG + (dg - avgG) * dominantNorm;
                domB = avgB + (db - avgB) * dominantNorm;
            }

            let finalR = domR;
            let finalG = domG;
            let finalB = domB;

            // pixel-mosaic: renderEdgeAwarePixels blends average/dominant with luminance-sorted median on edges
            if (edgeStrength > 0 && edgeSharpness > 0) {
                // Find luminance-sorted median pixel index
                const subIdx = idxArr.subarray(0, cnt);
                // Simple insertion sort on small block (cnt <= 400, typically 25..36)
                for (let a = 1; a < cnt; a++) {
                    const keyL = lumArr[a];
                    const keyI = subIdx[a];
                    let b = a - 1;
                    while (b >= 0 && lumArr[b] > keyL) {
                        lumArr[b + 1] = lumArr[b];
                        subIdx[b + 1] = subIdx[b];
                        b--;
                    }
                    lumArr[b + 1] = keyL;
                    subIdx[b + 1] = keyI;
                }
                const medQ = subIdx[cnt >> 1];
                const medI = medQ * 4;
                const medR = cleaned[medI];
                const medG = cleaned[medI + 1];
                const medB = cleaned[medI + 2];

                const blend = edgeSharpness * edgeStrength;
                finalR = domR + (medR - domR) * blend;
                finalG = domG + (medG - domG) * blend;
                finalB = domB + (medB - domB) * blend;
            }

            // pixel-mosaic: adjustContrast + final quantization snap
            const cr = clamp(Math.round((finalR - 128) * contrastFactor + 128));
            const cg = clamp(Math.round((finalG - 128) * contrastFactor + 128));
            const cb = clamp(Math.round((finalB - 128) * contrastFactor + 128));
            const pq = quantizePerceptualColor(cr, cg, cb, colorCount);

            const mc = gy * gridW + gx;
            cellR[mc] = pq.r;
            cellG[mc] = pq.g;
            cellB[mc] = pq.b;
        }
    }

    // 5. unfake.py: post-downscale isolated speck / jaggy cleanup on the pixel grid
    const outCellR = new Uint8ClampedArray(cellR);
    const outCellG = new Uint8ClampedArray(cellG);
    const outCellB = new Uint8ClampedArray(cellB);

    if (cleanupBlend > 0.15) {
        for (let gy = 1; gy < gridH - 1; gy++) {
            for (let gx = 1; gx < gridW - 1; gx++) {
                const mc = gy * gridW + gx;
                const r0 = cellR[mc];
                const g0 = cellG[mc];
                const b0 = cellB[mc];

                // Check 4 orthogonal neighbors (unfake.py jaggy_cleaner style)
                const orth = [mc - gridW, mc + gridW, mc - 1, mc + 1];
                let orthMatch = 0;
                for (const nc of orth) {
                    if (cellR[nc] === r0 && cellG[nc] === g0 && cellB[nc] === b0) {
                        orthMatch++;
                    }
                }
                if (orthMatch === 0) {
                    // Find dominant neighbor color in 3x3 if strongly uniform
                    let bestN = -1;
                    let bestVotes = 0;
                    for (let oy = -1; oy <= 1; oy++) {
                        for (let ox = -1; ox <= 1; ox++) {
                            if (ox === 0 && oy === 0) continue;
                            const nc = (gy + oy) * gridW + (gx + ox);
                            const nr = cellR[nc];
                            const ng = cellG[nc];
                            const nb = cellB[nc];
                            let votes = 0;
                            for (let py = -1; py <= 1; py++) {
                                for (let px = -1; px <= 1; px++) {
                                    if (px === 0 && py === 0) continue;
                                    const pc = (gy + py) * gridW + (gx + px);
                                    if (cellR[pc] === nr && cellG[pc] === ng && cellB[pc] === nb) {
                                        votes++;
                                    }
                                }
                            }
                            if (votes > bestVotes) {
                                bestVotes = votes;
                                bestN = nc;
                            }
                        }
                    }
                    if (bestVotes >= 5 && bestN >= 0) {
                        outCellR[mc] = cellR[bestN];
                        outCellG[mc] = cellG[bestN];
                        outCellB[mc] = cellB[bestN];
                    }
                }
            }
        }
    }

    // 6. Write crisp rectangular pixel blocks aligned to global origin
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
        const gy = Math.floor((originY + y - gy0) / size);
        const mRow = gy * gridW;
        for (let x = 0; x < w; x++) {
            const gx = Math.floor((originX + x - gx0) / size);
            const mc = mRow + gx;
            const i = (y * w + x) * 4;
            out[i] = outCellR[mc];
            out[i + 1] = outCellG[mc];
            out[i + 2] = outCellB[mc];
            out[i + 3] = 255;
        }
    }

    return out;
}
