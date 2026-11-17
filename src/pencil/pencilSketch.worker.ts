import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { digest } from '../enhancement/domain';
import { PENCIL_LINEART_MODEL, pencilLineartModelUrl } from './modelManifest';

interface PencilSketchRequest {
    id: number;
    width: number;
    height: number;
    buffer: ArrayBuffer;
    baseUrl: string;
}

let session: ort.InferenceSession | null = null;
let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function cachedAsset(url: string): Promise<ArrayBuffer> {
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
    if (!response.ok) throw new Error('彩铅线稿模型加载失败');
    const copy = response.clone();
    try {
        await cache?.put(absolute, copy);
    } catch {
        // Cache persistence is optional
    }
    return response.arrayBuffer();
}

async function ensureSession(baseUrl: string): Promise<ort.InferenceSession> {
    if (session) return session;
    if (sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
        const modelUrl = pencilLineartModelUrl(baseUrl);
        if (new URL(modelUrl).origin !== self.location.origin) {
            throw new Error('本地模型必须来自本站');
        }
        const [modelBytes, wasmBytes] = await Promise.all([cachedAsset(modelUrl), cachedAsset(wasmUrl)]);
        if (
            modelBytes.byteLength !== PENCIL_LINEART_MODEL.bytes ||
            (await digest(modelBytes)) !== PENCIL_LINEART_MODEL.sha256
        ) {
            throw new Error('彩铅线稿模型校验失败');
        }
        ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(2, navigator.hardwareConcurrency || 1) : 1;
        ort.env.wasm.wasmBinary = wasmBytes;
        const created = await ort.InferenceSession.create(modelBytes, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
        });
        session = created;
        return created;
    })();

    try {
        return await sessionPromise;
    } catch (error) {
        sessionPromise = null;
        throw error;
    }
}

async function computeSketch(
    req: PencilSketchRequest,
): Promise<{ width: number; height: number; sketchBytes: Uint8Array }> {
    const { width: w, height: h, baseUrl } = req;
    const src = new Uint8ClampedArray(req.buffer);

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
                inputData[c * ahw + q] = ((top * (1 - wy) + bot * wy) / 255);
            }
        }
    }

    const ortSession = await ensureSession(baseUrl);
    const tensor = new ort.Tensor('float32', inputData, [1, 3, ah, aw]);
    let outputs: Awaited<ReturnType<ort.InferenceSession['run']>> | undefined;
    try {
        outputs = await ortSession.run({ [PENCIL_LINEART_MODEL.inputName]: tensor });
        const raw = outputs[PENCIL_LINEART_MODEL.outputName].data as Float32Array;
        const sketchBytes = new Uint8Array(ahw);
        for (let q = 0; q < ahw; q++) {
            sketchBytes[q] = Math.round(Math.max(0, Math.min(1, raw[q])) * 255);
        }
        return { width: aw, height: ah, sketchBytes };
    } finally {
        tensor.dispose();
        if (outputs) for (const value of Object.values(outputs)) value.dispose();
    }
}

self.onmessage = (event: MessageEvent<PencilSketchRequest>) => {
    const req = event.data;
    computeSketch(req)
        .then(({ width, height, sketchBytes }) => {
            self.postMessage(
                {
                    kind: 'result',
                    id: req.id,
                    width,
                    height,
                    sketchBuffer: sketchBytes.buffer,
                },
                { transfer: [sketchBytes.buffer] },
            );
        })
        .catch(error => {
            self.postMessage({
                kind: 'error',
                id: req.id,
                message: error instanceof Error ? error.message : '彩铅线稿生成失败',
            });
        });
};
