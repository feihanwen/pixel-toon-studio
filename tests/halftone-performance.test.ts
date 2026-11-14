import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { halftone } from '../src/worker/styles/halftone';
import { halftoneV2 } from '../src/worker/styles/halftoneV2';
import { defaultParams } from '../src/config/styles';
import { fixture } from './style-fixtures';

it('records relative pop renderer timings on the same fixture and device', () => {
    const measurements: Record<string, unknown> = {};
    for (const [w, h] of process.env.POP_BENCH_LARGE ? [[1200, 1600], [6000, 4000]] : [[1200, 1600]]) {
        const input = fixture(w, h), timings: Record<string, number[]> = { classic: [], fine: [] };
        const scale = Math.max(1, Math.max(w, h) / 1600);
        // Small warmup for both implementations.
        const warm = fixture(200, 200);
        halftone(warm, 200, 200, defaultParams().halftone, 0, 0, 1);
        halftoneV2(warm, 200, 200, defaultParams().halftone, { originX: 0, originY: 0, fullWidth: 200, fullHeight: 200, scale: 1 });
        for (let run = 0; run < 5; run++) for (const name of ['classic', 'fine']) {
            const start = performance.now();
            // Simulate the production tile working set, including halo, rather than full-frame tensors.
            for (let y = 0; y < h; y += 768) for (let x = 0; x < w; x += 768) {
                const sx = Math.max(0, x - 96), sy = Math.max(0, y - 96), ex = Math.min(w, x + 768 + 96), ey = Math.min(h, y + 768 + 96);
                const tw = ex - sx, th = ey - sy, data = new Uint8ClampedArray(tw * th * 4);
                for (let row = sy; row < ey; row++) data.set(input.subarray((row * w + sx) * 4, (row * w + ex) * 4), (row - sy) * tw * 4);
                const result = name === 'classic' ? halftone(data, tw, th, { dot: 6, density: 55, ink: 72, shift: 0 }, sx, sy, scale) : halftoneV2(data, tw, th, defaultParams().halftone, { originX: sx, originY: sy, fullWidth: w, fullHeight: h, scale });
                expect(result.length).toBe(data.length);
            }
            timings[name].push(performance.now() - start);
        }
        const median = (v: number[]) => [...v].sort((a, b) => a - b)[2];
        const classic = median(timings.classic), fine = median(timings.fine);
        measurements[`${w}x${h}`] = { timings, medianMs: { classic, fine }, ratio: fine / classic, within2xBudget: fine / classic <= 2, rssMB: process.memoryUsage().rss / 1048576 };
    }
    console.info(JSON.stringify(measurements));
    if (process.env.POP_BENCH_OUTPUT) { mkdirSync(process.env.POP_BENCH_OUTPUT, { recursive: true }); writeFileSync(`${process.env.POP_BENCH_OUTPUT}/performance.json`, JSON.stringify(measurements, null, 2)); }
}, process.env.POP_BENCH_LARGE ? 600000 : 30000);
