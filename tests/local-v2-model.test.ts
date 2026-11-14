import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web/wasm';
import { localModels } from '../src/enhancement/local/modelManifest';
import { rgbTilePlan, tileRgb, accumulateTile, finishRgb } from '../src/enhancement/local/rgbTiles';

for (const model of localModels.filter(model => model.channels === 'RGB')) {
    it(`${model.id}: actual ONNX matches independent framework golden and irregular tiles match full inference`, async () => {
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create(readFileSync(`public/${model.path}`), { executionProviders: ['wasm'] });
        const infer = async (values: Float32Array, w: number, h: number) => {
            const tensor = new ort.Tensor('float32', values, [1, 3, h, w]);
            try {
                const result = await session.run({ input: tensor });
                try { return Float32Array.from(result.output.data as Float32Array); }
                finally { for (const value of Object.values(result)) value.dispose(); }
            } finally { tensor.dispose(); }
        };
        try {
            const values = Float32Array.from({ length: 3 * 9 * 7 }, (_, i) => i / (3 * 9 * 7 - 1));
            const actual = await infer(values, 7, 9);
            const goldenBytes = readFileSync(`tests/fixtures/models/${model.id}-golden.f32`);
            const golden = new Float32Array(goldenBytes.buffer, goldenBytes.byteOffset, goldenBytes.length / 4);
            expect(actual.length).toBe(3 * 9 * 7 * model.scale ** 2);
            let max = 0;
            for (let i = 0; i < actual.length; i++) max = Math.max(max, Math.abs(actual[i] - golden[i]));
            expect(max).toBeLessThan(.0001);
            const w = 23, h = 17, rgba = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 70 + i % 90; rgba[i + 1] = 120; rgba[i + 2] = 180; rgba[i + 3] = 255; }
            const render = async (tiled: boolean) => {
                const sums = new Float32Array(w * h * model.scale ** 2 * 3), weights = new Float32Array(w * h * model.scale ** 2);
                for (const tile of tiled ? rgbTilePlan(w, h, 16, 3) : [{ x: 0, y: 0, width: w, height: h }]) {
                    const input = tileRgb(rgba, w, h, tile, model.overlap);
                    const result = await infer(input.values, input.width, input.height);
                    accumulateTile(sums, weights, result, w, h, tile, model.overlap, model.scale, 3);
                }
                return finishRgb(sums, weights, rgba, w, h, model.scale);
            };
            const full = await render(false), tiled = await render(true);
            expect(Math.max(...full.map((v, i) => Math.abs(v - tiled[i])))).toBeLessThanOrEqual(1);
            console.log(`${model.id}: PyTorch max error ${max}; tiled output matches within 1/255`);
        } finally { await session.release(); }
    }, 120000);
}
