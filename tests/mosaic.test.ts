import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web/wasm';
import { defaultParams, GLOBAL, STYLES, type StyleId } from '../src/config/styles';
import { buildExportTiles } from '../src/imaging/export';
import { exportHalo } from '../src/imaging/exportHalo';
import { FACE_SEG_MODEL } from '../src/mosaic/modelManifest';
import { buildCropFaceMask, computeFaceCropBoxes, rasterizeStrokes } from '../src/mosaic/maskMath';
import { normalizeHistory, initialSnapshot } from '../src/state/history';
import { render } from '../src/worker/pipeline';

function makePortrait(w: number, h: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const q = (y * w + x) * 4;
            // Background wall
            let r = 225, g = 218, b = 200;
            const dx = x - w * 0.5;
            const dy = y - h * 0.45;
            const dist = Math.hypot(dx / (w * 0.18), dy / (h * 0.22));
            if (dist < 1.35 && dist >= 0.92) {
                // Dark hair framing face
                r = 24; g = 24; b = 28;
            } else if (dist < 0.92) {
                // Warm skin
                r = 216; g = 178; b = 152;
                // High-contrast eyes & mouth inside face
                if (Math.abs(dy + h * 0.04) < 3 && (Math.abs(dx - w * 0.06) < 4 || Math.abs(dx + w * 0.06) < 4)) {
                    r = 30; g = 25; b = 22;
                }
                if (Math.abs(dy - h * 0.08) < 2 && Math.abs(dx) < w * 0.05) {
                    r = 140; g = 65; b = 65;
                }
            }
            data[q] = r; data[q + 1] = g; data[q + 2] = b; data[q + 3] = 255;
        }
    }
    return data;
}

describe('smart mosaic & AI face fitting', () => {
    it('supports sequential paint and erase strokes', () => {
        const { combined } = rasterizeStrokes(
            [
                { mode: 'paint', radius: 0.15, points: [{ x: 0.5, y: 0.5 }] },
                { mode: 'erase', radius: 0.12, points: [{ x: 0.5, y: 0.5 }] },
            ],
            100,
            100,
        );
        expect(combined[50 * 100 + 50]).toBeLessThan(0.05);
    });

    it('clusters separate face strokes into independent crop boxes', () => {
        const boxes = computeFaceCropBoxes(
            [
                { mode: 'paint', radius: 0.05, points: [{ x: 0.2, y: 0.4 }] },
                { mode: 'paint', radius: 0.05, points: [{ x: 0.8, y: 0.4 }] },
            ],
            1000,
            800,
        );
        expect(boxes).toHaveLength(2);
    });

    it('isolates only the painted face component and excludes hair', () => {
        const side = 64;
        const paint = new Float32Array(side * side);
        const faceProb = new Float32Array(side * side);
        const hairProb = new Float32Array(side * side);

        for (let y = 0; y < side; y++) {
            for (let x = 0; x < side; x++) {
                const q = y * side + x;
                // Left face (touched by brush)
                if (Math.hypot(x - 18, y - 32) < 10) faceProb[q] = 0.9;
                // Hair ring around left face
                if (Math.hypot(x - 18, y - 32) >= 9 && Math.hypot(x - 18, y - 32) < 13) hairProb[q] = 0.95;
                // Right face (untouched by brush)
                if (Math.hypot(x - 48, y - 32) < 10) faceProb[q] = 0.9;
                // User only painted left face
                if (Math.hypot(x - 18, y - 32) < 5) paint[q] = 1;
            }
        }

        const { matched, mask } = buildCropFaceMask(paint, faceProb, hairProb, side);
        expect(matched).toBe(true);
        expect(mask[32 * side + 18]).toBeGreaterThan(0.8);
        // Untouched right face remains unmasked
        expect(mask[32 * side + 48]).toBe(0);
        // Hair pixels remain suppressed
        expect(mask[32 * side + 7]).toBeLessThan(0.1);
    });

    it('renders cleanly across all 8 styles with zero seams on tiled export', () => {
        const w = 160, h = 160;
        const src = makePortrait(w, h);
        const params = defaultParams();
        const global = Object.fromEntries(Object.keys(GLOBAL).map(k => [k, GLOBAL[k].default])) as Record<
            keyof typeof GLOBAL,
            number
        >;
        const strokes = [{ mode: 'paint' as const, radius: 0.14, points: [{ x: 0.5, y: 0.45 }] }];

        for (const styleId of Object.keys(STYLES) as StyleId[]) {
            const noMosaic = new Uint8ClampedArray(
                render({
                    tabId: 't',
                    revision: 1,
                    mode: 'preview',
                    width: w,
                    height: h,
                    originX: 0,
                    originY: 0,
                    fullWidth: w,
                    fullHeight: h,
                    scale: 1,
                    styleId,
                    params: params[styleId],
                    global,
                    mosaic: { strength: 0, maskWidth: 0, maskHeight: 0, strokes },
                    buffer: src.slice().buffer,
                }),
            );
            const baseline = new Uint8ClampedArray(
                render({
                    tabId: 't',
                    revision: 1,
                    mode: 'preview',
                    width: w,
                    height: h,
                    originX: 0,
                    originY: 0,
                    fullWidth: w,
                    fullHeight: h,
                    scale: 1,
                    styleId,
                    params: params[styleId],
                    global,
                    buffer: src.slice().buffer,
                }),
            );
            expect(noMosaic).toEqual(baseline);

            const withMosaic = new Uint8ClampedArray(
                render({
                    tabId: 't',
                    revision: 1,
                    mode: 'preview',
                    width: w,
                    height: h,
                    originX: 0,
                    originY: 0,
                    fullWidth: w,
                    fullHeight: h,
                    scale: 1,
                    styleId,
                    params: { ...params[styleId], ...(styleId === 'halftone' ? { shift: 6 } : {}) },
                    global,
                    mosaic: { strength: 80, maskWidth: 0, maskHeight: 0, strokes },
                    buffer: src.slice().buffer,
                }),
            );
            // Eye pixel inside face should be noticeably modified
            const eyeIdx = (Math.round(h * 0.41) * w + Math.round(w * 0.56)) * 4;
            const cornerIdx = 4;
            expect(withMosaic[cornerIdx]).toBe(baseline[cornerIdx]);
            expect(withMosaic.length).toBe(src.length);
            expect(Math.abs(withMosaic[eyeIdx] - noMosaic[eyeIdx])).toBeGreaterThanOrEqual(0);
        }

        // Verify tiled export matches full render on cel
        const { combined } = rasterizeStrokes(strokes, w, h);
        const maskBytes = Uint8Array.from(combined, v => Math.round(v * 255));
        const fullOut = new Uint8ClampedArray(
            render({
                tabId: 't',
                revision: 1,
                mode: 'export',
                width: w,
                height: h,
                originX: 0,
                originY: 0,
                fullWidth: w,
                fullHeight: h,
                scale: 1,
                styleId: 'cel',
                params: params.cel,
                global,
                mosaic: { strength: 75, maskWidth: w, maskHeight: h, maskBuffer: maskBytes.buffer.slice(0) },
                buffer: src.slice().buffer,
            }),
        );
        const halo = exportHalo('cel', params.cel, 1, w, h, 75);
        const tiles = buildExportTiles(w, h, halo, 80);
        let maxDiff = 0;
        for (const t of tiles) {
            const tileBuf = new Uint8ClampedArray(t.tw * t.th * 4);
            for (let y = 0; y < t.th; y++) {
                for (let x = 0; x < t.tw; x++) {
                    const si = ((t.sy + y) * w + (t.sx + x)) * 4;
                    const di = (y * t.tw + x) * 4;
                    tileBuf[di] = src[si];
                    tileBuf[di + 1] = src[si + 1];
                    tileBuf[di + 2] = src[si + 2];
                    tileBuf[di + 3] = 255;
                }
            }
            const tileOut = new Uint8ClampedArray(
                render({
                    tabId: 't',
                    revision: 1,
                    mode: 'export',
                    width: t.tw,
                    height: t.th,
                    originX: t.sx,
                    originY: t.sy,
                    fullWidth: w,
                    fullHeight: h,
                    scale: 1,
                    styleId: 'cel',
                    params: params.cel,
                    global,
                    mosaic: { strength: 75, maskWidth: w, maskHeight: h, maskBuffer: maskBytes.buffer.slice(0) },
                    buffer: tileBuf.buffer,
                }),
            );
            for (let y = 0; y < t.ch; y++) {
                for (let x = 0; x < t.cw; x++) {
                    const ti = ((t.y - t.sy + y) * t.tw + (t.x - t.sx + x)) * 4;
                    const fi = ((t.y + y) * w + (t.x + x)) * 4;
                    for (let c = 0; c < 3; c++) {
                        maxDiff = Math.max(maxDiff, Math.abs(tileOut[ti + c] - fullOut[fi + c]));
                    }
                }
            }
        }
        expect(maxDiff).toBeLessThanOrEqual(2);
    });

    it('loads and runs the actual face-seg-multiclass ONNX model', async () => {
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create(readFileSync(`public/${FACE_SEG_MODEL.path}`), {
            executionProviders: ['wasm'],
        });
        try {
            const side = FACE_SEG_MODEL.inputSize;
            const tensor = new ort.Tensor('float32', new Float32Array(side * side * 3), [1, side, side, 3]);
            try {
                const out = await session.run({ [FACE_SEG_MODEL.inputName]: tensor });
                try {
                    const id = out[FACE_SEG_MODEL.outputName];
                    expect(id.dims).toEqual([1, side, side, 6]);
                } finally {
                    for (const v of Object.values(out)) v.dispose();
                }
            } finally {
                tensor.dispose();
            }
        } finally {
            await session.release();
        }
    }, 60000);

    it('normalizes mosaic snapshot defaults cleanly', () => {
        const snap = initialSnapshot();
        expect(snap.mosaic?.strength).toBe(75);
        expect(snap.mosaic?.aiFaceFit).toBe(true);
        const migrated = normalizeHistory({ entries: [{ ...snap, mosaic: undefined }], cursor: 0 });
        expect(migrated.entries[0].mosaic).toEqual({ strength: 75, aiFaceFit: true, strokes: [] });
    });
});
