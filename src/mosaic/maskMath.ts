import type { MosaicStroke } from '../types/mosaic';
import { boxBlur } from '../worker/shared/blur';
import { luminance, smoothstep } from '../worker/shared/color';

export interface StrokeMasks {
    /** Final sequential paint-minus-erase mask [0..1] */
    combined: Float32Array;
    /** Paint-only coverage [0..1] for AI face overlap detection */
    paintOnly: Float32Array;
    /** Eraser coverage [0..1] applied after AI fitting */
    eraseOnly: Float32Array;
    /** Effective max brush radius in pixels */
    maxRadiusPx: number;
}

export interface CropBox {
    sx: number;
    sy: number;
    size: number;
}

function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq <= 1e-6) {
        const dx = px - ax;
        const dy = py - ay;
        return dx * dx + dy * dy;
    }
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
}

/** Rasterizes normalized strokes into pixel-space coverage masks [0..1]. */
export function rasterizeStrokes(strokes: readonly MosaicStroke[], w: number, h: number): StrokeMasks {
    const len = w * h;
    const combined = new Float32Array(len);
    const paintOnly = new Float32Array(len);
    const eraseOnly = new Float32Array(len);
    if (!strokes.length || w <= 0 || h <= 0) {
        return { combined, paintOnly, eraseOnly, maxRadiusPx: 0 };
    }

    const shortSide = Math.min(w, h);
    let maxRadiusPx = 0;

    for (const stroke of strokes) {
        if (!stroke.points.length) continue;
        const radiusPx = Math.max(4, stroke.radius * shortSide);
        if (stroke.mode === 'paint') {
            maxRadiusPx = Math.max(maxRadiusPx, radiusPx);
        }
        const rSq = radiusPx * radiusPx;
        const pts = stroke.points.map(p => ({ x: p.x * w, y: p.y * h }));

        let minX = w - 1;
        let minY = h - 1;
        let maxX = 0;
        let maxY = 0;
        for (const pt of pts) {
            minX = Math.min(minX, Math.floor(pt.x - radiusPx));
            minY = Math.min(minY, Math.floor(pt.y - radiusPx));
            maxX = Math.max(maxX, Math.ceil(pt.x + radiusPx));
            maxY = Math.max(maxY, Math.ceil(pt.y + radiusPx));
        }
        minX = Math.max(0, minX);
        minY = Math.max(0, minY);
        maxX = Math.min(w - 1, maxX);
        maxY = Math.min(h - 1, maxY);

        for (let y = minY; y <= maxY; y++) {
            const py = y + 0.5;
            const row = y * w;
            for (let x = minX; x <= maxX; x++) {
                const px = x + 0.5;
                let bestSq = Infinity;
                if (pts.length === 1) {
                    const dx = px - pts[0].x;
                    const dy = py - pts[0].y;
                    bestSq = dx * dx + dy * dy;
                } else {
                    for (let i = 0; i < pts.length - 1; i++) {
                        const d2 = distToSegmentSq(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
                        if (d2 < bestSq) bestSq = d2;
                    }
                }
                if (bestSq >= rSq) continue;
                const d = Math.sqrt(bestSq) / radiusPx;
                const alpha = 1 - smoothstep(0.62, 1.0, d);
                const q = row + x;
                if (stroke.mode === 'paint') {
                    combined[q] = Math.max(combined[q], alpha);
                    paintOnly[q] = Math.max(paintOnly[q], alpha);
                    eraseOnly[q] *= 1 - alpha;
                } else {
                    combined[q] *= 1 - alpha;
                    eraseOnly[q] = Math.max(eraseOnly[q], alpha);
                }
            }
        }
    }

    return { combined, paintOnly, eraseOnly, maxRadiusPx };
}

/** Clusters nearby paint strokes into square portrait crops for ONNX face parsing. */
export function computeFaceCropBoxes(strokes: readonly MosaicStroke[], w: number, h: number): CropBox[] {
    const paintStrokes = strokes.filter(s => s.mode === 'paint' && s.points.length > 0);
    if (!paintStrokes.length || w <= 0 || h <= 0) return [];

    const shortSide = Math.min(w, h);
    const rawBoxes = paintStrokes.map(s => {
        const r = Math.max(4, s.radius * shortSide);
        let minX = w;
        let minY = h;
        let maxX = 0;
        let maxY = 0;
        for (const p of s.points) {
            minX = Math.min(minX, p.x * w - r);
            minY = Math.min(minY, p.y * h - r);
            maxX = Math.max(maxX, p.x * w + r);
            maxY = Math.max(maxY, p.y * h + r);
        }
        return { minX, minY, maxX, maxY };
    });

    // Merge overlapping or nearby boxes (within 0.08 * shortSide)
    const mergeGap = shortSide * 0.08;
    const merged: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
    for (const box of rawBoxes) {
        let joined = false;
        for (const m of merged) {
            const overlapsX = box.minX - mergeGap <= m.maxX && box.maxX + mergeGap >= m.minX;
            const overlapsY = box.minY - mergeGap <= m.maxY && box.maxY + mergeGap >= m.minY;
            if (overlapsX && overlapsY) {
                m.minX = Math.min(m.minX, box.minX);
                m.minY = Math.min(m.minY, box.minY);
                m.maxX = Math.max(m.maxX, box.maxX);
                m.maxY = Math.max(m.maxY, box.maxY);
                joined = true;
                break;
            }
        }
        if (!joined) merged.push({ ...box });
    }

    const maxCrop = Math.min(w, h);
    return merged.map(m => {
        const bw = Math.max(1, m.maxX - m.minX);
        const bh = Math.max(1, m.maxY - m.minY);
        const cx = (m.minX + m.maxX) * 0.5;
        const cy = (m.minY + m.maxY) * 0.5;
        const size = Math.round(Math.min(maxCrop, Math.max(bw, bh) * 3.0, Math.max(shortSide * 0.34, Math.max(bw, bh) * 2.6)));
        const sx = Math.max(0, Math.min(w - size, Math.round(cx - size * 0.5)));
        const sy = Math.max(0, Math.min(h - size, Math.round(cy - size * 0.45)));
        return { sx, sy, size };
    });
}

/**
 * Connected-component AI face fitting inside a 256x256 crop:
 * Only keeps the face component touched by user paint strokes, fills small eye/brow dips,
 * and strictly excludes hair pixels.
 */
export function buildCropFaceMask(
    paintMaskCrop: Float32Array,
    faceProb: Float32Array,
    hairProb: Float32Array,
    side = 256,
): { matched: boolean; mask: Float32Array } {
    const n = side * side;
    // Slightly smooth faceProb to close tiny pupil/nostril dips, while subtracting hair
    const smoothedFace = boxBlur(faceProb, side, side, 2);
    const cleanFace = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        const face = Math.max(faceProb[q], smoothedFace[q]);
        cleanFace[q] = Math.max(0, face - hairProb[q] * 1.1);
    }

    // Flood-fill from painted seeds into cleanFace > 0.30
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    let seedCount = 0;

    for (let q = 0; q < n; q++) {
        if (paintMaskCrop[q] > 0.25 && cleanFace[q] > 0.32) {
            visited[q] = 1;
            queue[tail++] = q;
            seedCount++;
        }
    }

    if (seedCount < 8) {
        return { matched: false, mask: new Float32Array(n) };
    }

    while (head < tail) {
        const q = queue[head++];
        const x = q % side;
        const y = (q - x) / side;
        const neighbors = [
            x > 0 ? q - 1 : -1,
            x + 1 < side ? q + 1 : -1,
            y > 0 ? q - side : -1,
            y + 1 < side ? q + side : -1,
        ];
        for (const nq of neighbors) {
            if (nq >= 0 && !visited[nq] && cleanFace[nq] > 0.24) {
                visited[nq] = 1;
                queue[tail++] = nq;
            }
        }
    }

    const rawComponent = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        if (visited[q]) {
            rawComponent[q] = smoothstep(0.24, 0.58, cleanFace[q]);
        }
    }
    // Gentle 1.5px soft feather on face edge while clamping hair back out
    const feathered = boxBlur(rawComponent, side, side, 1);
    const mask = new Float32Array(n);
    for (let q = 0; q < n; q++) {
        const hairGuard = 1 - smoothstep(0.28, 0.62, hairProb[q]);
        mask[q] = Math.max(0, Math.min(1, Math.max(rawComponent[q], feathered[q]) * hairGuard));
    }
    return { matched: tail >= 24, mask };
}

/**
 * Local edge-aware mask refinement for non-face regions (or when AI face fit is off):
 * - Brush core (>= 0.78) is ALWAYS 100% preserved (never drops dark sunglasses/logos).
 * - Outer feather ring (< 0.78) locks to local region color & strong contour edges.
 */
export function refineMaskLocalEdgeAware(
    src: Uint8ClampedArray,
    w: number,
    h: number,
    rawMask: Float32Array,
): Float32Array {
    const len = w * h;
    const coreW = new Float32Array(len);
    const rCh = new Float32Array(len);
    const gCh = new Float32Array(len);
    const bCh = new Float32Array(len);
    const lum = new Float32Array(len);

    let hasMask = false;
    for (let q = 0; q < len; q++) {
        const i = q * 4;
        lum[q] = luminance(src[i], src[i + 1], src[i + 2]);
        const m = rawMask[q];
        if (m > 0.001) hasMask = true;
        const cw = m >= 0.72 ? m : 0;
        coreW[q] = cw;
        rCh[q] = src[i] * cw;
        gCh[q] = src[i + 1] * cw;
        bCh[q] = src[i + 2] * cw;
    }
    if (!hasMask) return rawMask;

    const refRadius = Math.max(8, Math.round(Math.min(w, h) * 0.035));
    const normW = boxBlur(coreW, w, h, refRadius);
    const refR = boxBlur(rCh, w, h, refRadius);
    const refG = boxBlur(gCh, w, h, refRadius);
    const refB = boxBlur(bCh, w, h, refRadius);

    const out = new Float32Array(len);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const q = y * w + x;
            const m = rawMask[q];
            if (m <= 0.001) continue;
            // Core is guaranteed 100% masked
            if (m >= 0.78) {
                out[q] = m;
                continue;
            }
            const nw = normW[q];
            let affinity = 1;
            if (nw > 0.02) {
                const i = q * 4;
                const dist = Math.hypot(
                    src[i] - refR[q] / nw,
                    src[i + 1] - refG[q] / nw,
                    src[i + 2] - refB[q] / nw,
                );
                affinity = 1 - smoothstep(65, 130, dist);
            }
            const xm = Math.max(0, x - 1);
            const xp = Math.min(w - 1, x + 1);
            const ym = Math.max(0, y - 1);
            const yp = Math.min(h - 1, y + 1);
            const grad = Math.hypot(lum[y * w + xp] - lum[y * w + xm], lum[yp * w + x] - lum[ym * w + x]);
            const contourLock = 1 - smoothstep(16, 42, grad) * (1 - smoothstep(0.3, 0.78, m));
            out[q] = m * affinity * contourLock;
        }
    }
    return out;
}
