import type { InferenceSession } from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import gpuWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { bMsg } from '../config/errors';
import type { AppLanguage } from '../config/preferences';
import { digest } from '../enhancement/domain';
import { selectLocalBackend } from '../enhancement/local/backend';
import type { LocalBackend } from '../enhancement/local/modelManifest';
import { PENCIL_LINEART_MODEL, pencilLineartModelUrl } from './modelManifest';

type PencilWorkerRequest =
    | {
          kind?: 'sketch';
          id: number;
          width: number;
          height: number;
          buffer: ArrayBuffer;
          baseUrl: string;
          language?: AppLanguage;
      }
    | {
          kind: 'warmup';
          id: number;
          baseUrl: string;
          language?: AppLanguage;
      };

let session: InferenceSession | null = null;
let sessionPromise: Promise<{ session: InferenceSession; backend: LocalBackend; ort: typeof import('onnxruntime-web') }> | null = null;
let loadedOrt: typeof import('onnxruntime-web') | null = null;
let activeBackend: LocalBackend = 'wasm';
let gpuDisabled = false;
let runQueue: Promise<unknown> = Promise.resolve();

async function cachedAsset(url: string, language?: AppLanguage): Promise<ArrayBuffer> {
    const absolute = new URL(url, self.location.href).href;
    let cache: Cache | undefined;
    try {
        cache = await caches.open('pixel-toon-ai-v1');
        const hit = await cache.match(absolute);
        if (hit) return hit.arrayBuffer();
    } catch {
        // Private browsing or sandboxed context: fall back to direct fetch
    }
    const response = await fetch(absolute);
    if (!response.ok) throw new Error(bMsg(language, '彩铅线稿模型加载失败', 'Failed to load pencil line-art model'));
    const copy = response.clone();
    try {
        await cache?.put(absolute, copy);
    } catch {
        // Cache persistence is optional
    }
    return response.arrayBuffer();
}

async function ensureSession(
    baseUrl: string,
    skipGpu = false,
    language?: AppLanguage,
): Promise<{ session: InferenceSession; backend: LocalBackend; ort: typeof import('onnxruntime-web') }> {
    if (session && loadedOrt && (!skipGpu || activeBackend === 'wasm')) {
        return { session, backend: activeBackend, ort: loadedOrt };
    }
    if (sessionPromise && !skipGpu) return sessionPromise;

    const currentPromise = (async () => {
        const modelUrl = pencilLineartModelUrl(baseUrl);
        if (new URL(modelUrl).origin !== self.location.origin) {
            throw new Error(bMsg(language, '本地模型必须来自本站', 'On-device model must be served from same origin'));
        }
        const canUseGpu = !skipGpu && !gpuDisabled && 'gpu' in navigator;
        const ort = canUseGpu ? await import('onnxruntime-web/all') : await import('onnxruntime-web/wasm');
        const [modelBytes, wasmBytes] = await Promise.all([
            cachedAsset(modelUrl, language),
            cachedAsset(canUseGpu ? gpuWasmUrl : wasmUrl, language),
        ]);
        if (
            modelBytes.byteLength !== PENCIL_LINEART_MODEL.bytes ||
            (await digest(modelBytes)) !== PENCIL_LINEART_MODEL.sha256
        ) {
            throw new Error(bMsg(language, '彩铅线稿模型校验失败', 'Pencil line-art model verification failed'));
        }
        ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
        ort.env.wasm.wasmBinary = wasmBytes;

        const engine = await selectLocalBackend(
            canUseGpu,
            async selected => {
                const candidate = await ort.InferenceSession.create(modelBytes, {
                    executionProviders: [selected],
                    graphOptimizationLevel: 'all',
                });
                try {
                    // Warm up and verify the selected execution provider can actually run the graph
                    const warmup = new ort.Tensor('float32', new Float32Array(3 * 16 * 16), [1, 3, 16, 16]);
                    try {
                        const out = await candidate.run({ [PENCIL_LINEART_MODEL.inputName]: warmup });
                        for (const value of Object.values(out)) value.dispose();
                    } finally {
                        warmup.dispose();
                    }
                    return { backend: selected, release: () => candidate.release(), session: candidate };
                } catch (error) {
                    await candidate.release().catch(() => {});
                    throw error;
                }
            },
            () => {
                gpuDisabled = true;
            },
        );

        session = engine.session;
        activeBackend = engine.backend;
        loadedOrt = ort;
        return { session: engine.session, backend: engine.backend, ort };
    })();

    sessionPromise = currentPromise;
    try {
        return await currentPromise;
    } catch (error) {
        if (sessionPromise === currentPromise) {
            sessionPromise = null;
        }
        throw error;
    }
}

function prepareInput(
    src: Uint8ClampedArray,
    w: number,
    h: number,
): { aw: number; ah: number; inputData: Float32Array } {
    const scale = Math.min(1, PENCIL_LINEART_MODEL.maxSide / Math.max(w, h));
    const aw = Math.max(8, Math.round((w * scale) / 8) * 8);
    const ah = Math.max(8, Math.round((h * scale) / 8) * 8);
    const ahw = aw * ah;

    const inputData = new Float32Array(3 * ahw);
    for (let y = 0; y < ah; y++) {
        const py = ((y + 0.5) / ah) * h - 0.5;
        const y0 = Math.max(0, Math.min(h - 1, Math.floor(py)));
        const y1 = Math.max(0, Math.min(h - 1, y0 + 1));
        const wy = Math.max(0, Math.min(1, py - y0));
        for (let x = 0; x < aw; x++) {
            const px = ((x + 0.5) / aw) * w - 0.5;
            const x0 = Math.max(0, Math.min(w - 1, Math.floor(px)));
            const x1 = Math.max(0, Math.min(w - 1, x0 + 1));
            const wx = Math.max(0, Math.min(1, px - x0));
            const i00 = (y0 * w + x0) * 4;
            const i10 = (y0 * w + x1) * 4;
            const i01 = (y1 * w + x0) * 4;
            const i11 = (y1 * w + x1) * 4;
            const q = y * aw + x;
            for (let c = 0; c < 3; c++) {
                const top = src[i00 + c] * (1 - wx) + src[i10 + c] * wx;
                const bot = src[i01 + c] * (1 - wx) + src[i11 + c] * wx;
                inputData[c * ahw + q] = (top * (1 - wy) + bot * wy) / 255;
            }
        }
    }
    return { aw, ah, inputData };
}

async function runInference(
    inputData: Float32Array,
    aw: number,
    ah: number,
    baseUrl: string,
    skipGpu = false,
    language?: AppLanguage,
): Promise<Uint8Array> {
    const ahw = aw * ah;
    const engine = await ensureSession(baseUrl, skipGpu, language);
    const tensor = new engine.ort.Tensor('float32', inputData, [1, 3, ah, aw]);
    let outputs: Awaited<ReturnType<InferenceSession['run']>> | undefined;
    try {
        outputs = await engine.session.run({ [PENCIL_LINEART_MODEL.inputName]: tensor });
        const raw = outputs[PENCIL_LINEART_MODEL.outputName].data as Float32Array;
        const sketchBytes = new Uint8Array(ahw);
        for (let q = 0; q < ahw; q++) {
            sketchBytes[q] = Math.round(Math.max(0, Math.min(1, raw[q])) * 255);
        }
        return sketchBytes;
    } catch (error) {
        if (engine.backend === 'webgpu' && !skipGpu) {
            await session?.release().catch(() => {});
            session = null;
            sessionPromise = null;
            gpuDisabled = true;
            return runInference(inputData, aw, ah, baseUrl, true, language);
        }
        throw error;
    } finally {
        tensor.dispose();
        if (outputs) for (const value of Object.values(outputs)) value.dispose();
    }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = runQueue.then(task, task);
    runQueue = next.catch(() => {});
    return next;
}

self.onmessage = (event: MessageEvent<PencilWorkerRequest>) => {
    const req = event.data;
    if (req.kind === 'warmup') {
        enqueue(() => ensureSession(req.baseUrl, false, req.language))
            .then(({ backend }) => {
                self.postMessage({ kind: 'warmed', id: req.id, backend });
            })
            .catch(error => {
                self.postMessage({
                    kind: 'error',
                    id: req.id,
                    message: error instanceof Error ? error.message : bMsg(req.language, '彩铅线稿模型预热失败', 'Pencil line-art warmup failed'),
                });
            });
        return;
    }

    const src = new Uint8ClampedArray(req.buffer);
    const { aw, ah, inputData } = prepareInput(src, req.width, req.height);
    enqueue(() => runInference(inputData, aw, ah, req.baseUrl, false, req.language))
        .then(sketchBytes => {
            self.postMessage(
                {
                    kind: 'result',
                    id: req.id,
                    width: aw,
                    height: ah,
                    sketchBuffer: sketchBytes.buffer,
                },
                { transfer: [sketchBytes.buffer] },
            );
        })
        .catch(error => {
            self.postMessage({
                kind: 'error',
                id: req.id,
                message: error instanceof Error ? error.message : bMsg(req.language, '彩铅线稿生成失败', 'Pencil line-art generation failed'),
            });
        });
};
