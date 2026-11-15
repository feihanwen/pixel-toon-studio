import { describe, it, expect } from 'vitest';
import { accumulateTile, finishRgb, rgbTilePlan, tileRgb } from '../src/enhancement/local/rgbTiles';
import { checkLocalResources, isLocalProfile, localCacheDescriptor, localModel, modelAssetUrl } from '../src/enhancement/local/modelManifest';
import { selectLocalBackend } from '../src/enhancement/local/backend';
import { readFileSync } from 'node:fs';
import { localModels } from '../src/enhancement/local/modelManifest';
import { applyAdaptiveUsm } from '../src/enhancement/usm';
import { enhancementSharpen } from '../src/types/enhancement';

describe('local model isolation and resource limits', () => {
    it('build-time registry matches the distributed manifests', () => {
        for (const model of localModels) {
            const json = JSON.parse(readFileSync(`public/${model.path.replace('model.onnx', 'model.json')}`, 'utf8'));
            for (const field of ['id', 'version', 'sha256', 'bytes', 'parameters', 'scale', 'tileSize', 'overlap', 'channels', 'license'] as const)
                expect(model[field]).toEqual(json[field]);
            if (model.channels === 'RGB') expect(model.blend).toBe(json.blend);
        }
    });
    it('ships all 4 specialized local models and isolates their caches', () => {
        expect(localModels.map(model => model.profile)).toEqual(['liveaction', 'omnisr', 'anime', 'denoise']);
        expect(localModel().profile).toBe('liveaction');
        expect(localCacheDescriptor()).toEqual({ adapter: 'local-onnx', id: 'liveaction-span-x2', version: '1.0.0', scale: 2, pipelineVersion: 3, profile: 'liveaction' });
        for (const profile of ['omnisr', 'anime', 'denoise'] as const) {
            expect(isLocalProfile(profile)).toBe(true);
            expect(localCacheDescriptor(profile)).not.toEqual(localCacheDescriptor());
            expect(localCacheDescriptor(profile).pipelineVersion).toBe(4);
        }
        const model = localModel(), base = 'https://example.com/app/';
        expect(modelAssetUrl(model, base)).not.toBe(modelAssetUrl({ ...model, sha256: 'new-version' }, base));
        for (const profile of ['fast', 'photo', 'detail', 'invalid']) expect(() => localModel(profile as never)).toThrow('已下架');
        expect(() => checkLocalResources(3000, 2100, model)).toThrow('6 MP');
        expect(checkLocalResources(1600, 1000, model)).toBeLessThan(768 * 1048576);
    });
});
describe('Adaptive Unsharp Mask (USM)', () => {
    it('suppresses low-amplitude noise in flat regions while sharpening mid-contrast edges without clipping halos', () => {
        const w = 16, h = 16;
        const flatNoisy = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            const v = 120 + (i % 2 === 0 ? 1 : -1); // ±1 micro-noise (< coring threshold)
            flatNoisy[i * 4] = v; flatNoisy[i * 4 + 1] = v; flatNoisy[i * 4 + 2] = v; flatNoisy[i * 4 + 3] = 255;
        }
        const beforeNoise = new Uint8ClampedArray(flatNoisy);
        applyAdaptiveUsm(flatNoisy, w, h, 60);
        expect([...flatNoisy]).toEqual([...beforeNoise]);

        // Mid-contrast texture edge (105 vs 135) gets sharpened cleanly
        const edgeImg = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const v = x < 8 ? 105 : 135;
                const idx = (y * w + x) * 4;
                edgeImg[idx] = v; edgeImg[idx + 1] = v; edgeImg[idx + 2] = v; edgeImg[idx + 3] = 255;
            }
        }
        applyAdaptiveUsm(edgeImg, w, h, 50);
        const leftEdge = edgeImg[(8 * w + 7) * 4];
        const rightEdge = edgeImg[(8 * w + 8) * 4];
        expect(leftEdge).toBeLessThan(105);
        expect(rightEdge).toBeGreaterThan(135);
        expect(rightEdge - leftEdge).toBeGreaterThan(30);
        expect(enhancementSharpen({ enabled: true, resultId: 'id', strength: 100, sharpen: 35.4 })).toBe(35);
        expect(enhancementSharpen({ enabled: true, resultId: 'id', strength: 100 })).toBe(0);
    });
});
describe('RGB tiles', () => {
    it('uses planar RGB and ignores hidden colors behind transparency', () => {
        const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]);
        const result = tileRgb(rgba, 2, 1, { x: 0, y: 0, width: 2, height: 1 }, 0);
        expect([...result.values]).toEqual([1, 1, 0, 1, 0, 1]);
        const reflected = tileRgb(rgba, 2, 1, { x: 0, y: 0, width: 2, height: 1 }, 1);
        expect(reflected.values.length).toBe(36);
    });
    for (const [width, height] of [[1, 1], [27, 19], [17, 1]]) it(`feathers ${width}×${height} without seams and is traversal independent`, () => {
        const scale = 4, halo = 2, blend = 2, tiles = rgbTilePlan(width, height, 12, blend);
        const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
        function stitch(reverse: boolean) {
            const sums = new Float32Array(width * height * scale ** 2 * 3), weights = new Float32Array(width * height * scale ** 2);
            for (const tile of reverse ? [...tiles].reverse() : tiles) {
                const tw = (tile.width + halo * 2) * scale, th = (tile.height + halo * 2) * scale, plane = tw * th;
                const data = new Float32Array(plane * 3);
                for (let c = 0; c < 3; c++) for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++)
                    data[c * plane + y * tw + x] = .2 + c * .2 + (tile.x + x / scale - halo) * .001;
                accumulateTile(sums, weights, data, width, height, tile, halo, scale, blend);
            }
            return finishRgb(sums, weights, rgba, width, height, scale);
        }
        const a = stitch(false), b = stitch(true);
        expect(a.length).toBe(width * height * 16);
        expect(Math.max(...a.map((value, i) => Math.abs(value - b[i])))).toBeLessThanOrEqual(1);
        expect(a[0]).toBeCloseTo(51, 0);
        expect(a[1]).toBeCloseTo(102, 0);
        expect(a[3]).toBe(255);
    });
    it('recovers alpha without exposing hidden black RGB and rejects invalid output', () => {
        const rgba = new Uint8ClampedArray([0, 0, 0, 0]);
        const sums = new Float32Array(4 * 4 * 3).fill(1), weights = new Float32Array(16).fill(1);
        expect([...finishRgb(sums, weights, rgba, 1, 1, 4)]).toEqual(new Array(16).fill(0));
        expect(() => finishRgb(new Float32Array(48), new Float32Array(16), rgba, 1, 1, 4)).toThrow('未覆盖');
        expect(() => rgbTilePlan(1, 1, 8, 4)).toThrow();
    });
});
describe('backend selection', () => {
    it('keeps WebGPU after successful creation and warmup', async () => {
        const calls: string[] = [];
        const result = await selectLocalBackend(true, async backend => { calls.push(backend); return { backend, release: async () => {} }; }, () => calls.push('fallback'));
        expect(result.backend).toBe('webgpu'); expect(calls).toEqual(['webgpu']);
    });
    it('falls back exactly once and propagates WASM failure', async () => {
        const calls: string[] = [];
        const result = await selectLocalBackend(true, async backend => {
            calls.push(backend); if (backend === 'webgpu') throw new Error('unsupported');
            return { backend, release: async () => {} };
        }, () => calls.push('fallback'));
        expect(result.backend).toBe('wasm'); expect(calls).toEqual(['webgpu', 'fallback', 'wasm']);
        await expect(selectLocalBackend(false, async () => { throw new Error('OOM'); }, () => {})).rejects.toThrow('OOM');
    });
});
