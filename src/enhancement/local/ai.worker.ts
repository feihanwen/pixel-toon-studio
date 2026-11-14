import { checkLocalResources, localModel, modelAssetUrl, type LocalBackend, type LocalProfile, type LocalModelManifest } from './modelManifest';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import gpuWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { checkDimensions, digest } from '../domain';
import { accumulateTile, finishRgb, rgbTilePlan, tileRgb } from './rgbTiles';
import { selectLocalBackend } from './backend';
import type { InferenceSession } from 'onnxruntime-web';

let session: InferenceSession | null = null, loadedId = '', backend: LocalBackend = 'wasm';
let busy = false, gpuDisabled = false;
async function cachedAsset(url: string) {
    const absolute = new URL(url, self.location.href).href;
    let cache: Cache | undefined;
    try { cache = await caches.open('pixel-toon-ai-v1'); const hit = await cache.match(absolute); if (hit) return hit.arrayBuffer(); } catch { /* private browsing: normal HTTP cache */ }
    const response = await fetch(absolute); if (!response.ok) throw new Error('本地模型资源下载失败，请检查网络或重新打开应用');
    const copy = response.clone();
    try { await cache?.put(absolute, copy); } catch { /* inference still works without persistence */ }
    return response.arrayBuffer();
}
async function run(id: number, width: number, height: number, buffer: ArrayBuffer, profile: LocalProfile, baseUrl: string, skipGpu = false): Promise<void> {
    const manifest = localModel(profile);
    checkDimensions(width, height, 2);
    checkLocalResources(width, height, manifest);
    if (buffer.byteLength !== width * height * 4) throw new Error('本地模型输入像素长度异常');
    const modelUrl = modelAssetUrl(manifest, baseUrl);
    if (new URL(modelUrl).origin !== self.location.origin) throw new Error('本地模型必须来自本站');
    if (loadedId !== manifest.id && session) { await session.release(); session = null; }
    self.postMessage({ kind: 'progress', id, progress: 0, message: session ? '本地模型已就绪，正在准备分块…' : '正在加载本地模型与推理运行时…' });
    const useGpuRuntime = !skipGpu && !gpuDisabled && 'gpu' in navigator;
    // ORT 1.24's /webgpu entry selects the new native EP; /all retains the mature
    // JS WebGPU (JSEP) kernels. Only WebGPU is requested; WebGL/WebNN are never selected.
    const ort = useGpuRuntime ? await import('onnxruntime-web/all') : await import('onnxruntime-web/wasm');
    if (!session) {
        const [model, wasm] = await Promise.all([cachedAsset(modelUrl), cachedAsset(useGpuRuntime ? gpuWasmUrl : wasmUrl)]);
        if (model.byteLength !== manifest.bytes || await digest(model) !== manifest.sha256) throw new Error('本地模型校验失败，请清除模型缓存后重试');
        ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(2, navigator.hardwareConcurrency || 1) : 1;
        ort.env.wasm.wasmBinary = wasm;
        const engine = await selectLocalBackend(!skipGpu && !gpuDisabled && 'gpu' in navigator, async selected => {
            const candidate = await ort.InferenceSession.create(model, { executionProviders: [selected], graphOptimizationLevel: 'all' });
            try {
                const channels = 3;
                const warmup = new ort.Tensor('float32', new Float32Array(channels * 8 * 8), [1, channels, 8, 8]);
                try { const output = await candidate.run({ input: warmup }); for (const value of Object.values(output)) value.dispose(); }
                finally { warmup.dispose(); }
                return { backend: selected, release: () => candidate.release(), session: candidate };
            } catch (error) { await candidate.release().catch(() => {}); throw error; }
        }, () => { gpuDisabled = true; self.postMessage({ kind: 'fallback', id }); });
        session = engine.session; backend = engine.backend; loadedId = manifest.id;
    }
    self.postMessage({ kind: 'backend', id, backend, gpuDisabled });
    try { await runRgb(id, width, height, new Uint8ClampedArray(buffer), manifest, ort); }
    catch (error) {
        if (backend !== 'webgpu') throw error;
        await session?.release().catch(() => {}); session = null; gpuDisabled = true;
        self.postMessage({ kind: 'fallback', id });
        return run(id, width, height, buffer, profile, baseUrl, true);
    }
}

async function runRgb(id: number, width: number, height: number, source: Uint8ClampedArray, model: LocalModelManifest, ort: typeof import('onnxruntime-web')) {
    const pixels = width * height * model.scale ** 2;
    const sums = new Float32Array(pixels * 3), weights = new Float32Array(pixels);
    const tiles = rgbTilePlan(width, height, model.tileSize, model.blend);
    for (let index = 0; index < tiles.length; index++) {
        const tile = tiles[index], input = tileRgb(source, width, height, tile, model.overlap);
        const tensor = new ort.Tensor('float32', input.values, [1, 3, input.height, input.width]);
        let result: Awaited<ReturnType<InferenceSession['run']>> | undefined;
        try {
            result = await session!.run({ input: tensor });
            const value = result.output;
            if (value.type !== 'float32' || value.dims.join(',') !== [1, 3, input.height * model.scale, input.width * model.scale].join(',')) throw new Error('模型 RGB 输出尺寸异常');
            accumulateTile(sums, weights, value.data as Float32Array, width, height, tile, model.overlap, model.scale, model.blend);
        } finally { tensor.dispose(); if (result) for (const value of Object.values(result)) value.dispose(); }
        self.postMessage({ kind: 'progress', id, progress: Math.round((index + 1) / tiles.length * 90), message: `${model.label} · ${backend.toUpperCase()} · ${index + 1}/${tiles.length} 块` });
    }
    self.postMessage({ kind: 'progress', id, progress: 95, message: '正在融合分块并生成 ×2 图片…' });
    const rgba = finishRgb(sums, weights, source, width, height, model.scale);
    const output = new OffscreenCanvas(width * 2, height * 2);
    try {
        output.getContext('2d')!.putImageData(new ImageData(rgba, width * 2, height * 2), 0, 0);
        const blob = await output.convertToBlob({ type: 'image/png' });
        self.postMessage({ kind: 'result', id, blob, width: width * 2, height: height * 2, backend, modelId: model.id });
    } finally { output.width = 1; }
}
self.onmessage = (event: MessageEvent<{ id: number; width: number; height: number; buffer: ArrayBuffer; profile: LocalProfile; baseUrl: string; skipGpu?: boolean }>) => {
    if (busy) return;
    busy = true;
    const request = event.data;
    run(request.id, request.width, request.height, request.buffer, request.profile, request.baseUrl, request.skipGpu)
        .catch(error => self.postMessage({ kind: 'error', id: request.id, retryWasm: !request.skipGpu, message: error instanceof Error ? error.message : '本地推理失败，请重试' }))
        .finally(() => { busy = false; });
};
