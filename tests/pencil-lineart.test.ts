import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-web';
import { defaultParams } from '../src/config/styles';
import { exportHalo } from '../src/imaging/exportHalo';
import { PENCIL_LINEART_MODEL } from '../src/pencil/modelManifest';
import { render } from '../src/worker/pipeline';
import { fixture, metrics } from './style-fixtures';

describe('pencil-lineart ONNX integration', () => {
    it('loads and runs the actual pencil-lineart ONNX model', async () => {
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create(readFileSync(`public/${PENCIL_LINEART_MODEL.path}`), {
            executionProviders: ['wasm'],
        });
        try {
            const w = 128, h = 96;
            const src = fixture(w, h);
            const hw = w * h;
            const inputData = new Float32Array(3 * hw);
            for (let q = 0; q < hw; q++) {
                inputData[q] = src[q * 4] / 255;
                inputData[hw + q] = src[q * 4 + 1] / 255;
                inputData[2 * hw + q] = src[q * 4 + 2] / 255;
            }
            const tensor = new ort.Tensor('float32', inputData, [1, 3, h, w]);
            try {
                const out = await session.run({ [PENCIL_LINEART_MODEL.inputName]: tensor });
                try {
                    const outTensor = out[PENCIL_LINEART_MODEL.outputName];
                    expect(outTensor.dims).toEqual([1, 1, h, w]);
                    const raw = outTensor.data as Float32Array;
                    let min = Infinity, max = -Infinity;
                    for (let q = 0; q < hw; q++) {
                        if (raw[q] < min) min = raw[q];
                        if (raw[q] > max) max = raw[q];
                    }
                    expect(min).toBeGreaterThanOrEqual(0);
                    expect(max).toBeLessThanOrEqual(1);
                    expect(max - min).toBeGreaterThan(0.1);
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

    it('renders seamlessly across irregular export tiles when pencilSketch is supplied', () => {
        const w = 387, h = 259, tileSide = 137;
        const src = fixture(w, h);
        const aw = 192, ah = 128;
        const sketchBytes = new Uint8Array(aw * ah);
        for (let y = 0; y < ah; y++) {
            for (let x = 0; x < aw; x++) {
                const edge = Math.abs(y - ah * 0.42 - x * 0.1) < 2.2 ? 35 : 248;
                sketchBytes[y * aw + x] = edge;
            }
        }

        const params = { ...defaultParams().pencil, stroke: 8 };
        const scale = Math.max(1, Math.max(w, h) / 1600);
        const halo = exportHalo('pencil', params, scale, w, h);

        const full = new Uint8ClampedArray(
            render({
                kind: 'render',
                id: 1,
                tabId: 'test',
                revision: 1,
                mode: 'export',
                styleId: 'pencil',
                params,
                width: w,
                height: h,
                originX: 0,
                originY: 0,
                fullWidth: w,
                fullHeight: h,
                scale,
                global: { brightness: 0, contrast: 0, saturation: 0 },
                pencilSketch: { width: aw, height: ah, sketchBuffer: sketchBytes.buffer.slice(0) },
                buffer: src.slice().buffer,
            }),
        );

        const stitched = new Uint8ClampedArray(src.length);
        for (let top = 0; top < h; top += tileSide) {
            for (let left = 0; left < w; left += tileSide) {
                const right = Math.min(w, left + tileSide);
                const bottom = Math.min(h, top + tileSide);
                const sx = Math.max(0, left - halo);
                const sy = Math.max(0, top - halo);
                const ex = Math.min(w, right + halo);
                const ey = Math.min(h, bottom + halo);
                const tw = ex - sx;
                const th = ey - sy;
                const tile = new Uint8ClampedArray(tw * th * 4);
                for (let y = sy; y < ey; y++) {
                    tile.set(src.subarray((y * w + sx) * 4, (y * w + ex) * 4), (y - sy) * tw * 4);
                }
                const painted = new Uint8ClampedArray(
                    render({
                        kind: 'render',
                        id: 2,
                        tabId: 'test',
                        revision: 1,
                        mode: 'export',
                        styleId: 'pencil',
                        params,
                        width: tw,
                        height: th,
                        originX: sx,
                        originY: sy,
                        fullWidth: w,
                        fullHeight: h,
                        scale,
                        global: { brightness: 0, contrast: 0, saturation: 0 },
                        pencilSketch: { width: aw, height: ah, sketchBuffer: sketchBytes.buffer.slice(0) },
                        buffer: tile.buffer,
                    }),
                );
                for (let y = top; y < bottom; y++) {
                    stitched.set(
                        painted.subarray(((y - sy) * tw + left - sx) * 4, ((y - sy) * tw + right - sx) * 4),
                        (y * w + left) * 4,
                    );
                }
            }
        }

        const diff = metrics(full, stitched);
        expect(diff.mad).toBeLessThan(0.05);
        expect(diff.max).toBeLessThanOrEqual(2);
    });
});
