import { decode } from '../../imaging/decode';
import { checkDimensions } from '../domain';
import { checkLocalResources, localModel, localModels, modelAssetUrl, type LocalProfile, type LocalBackend } from './modelManifest';

const idle = new Map<Worker, { timer: ReturnType<typeof setTimeout>; profile: LocalProfile }>();
const failedGpu = new Set<LocalProfile>();
export function disposeLocalEngines() { for (const [worker, { timer }] of idle) { clearTimeout(timer); worker.terminate(); } idle.clear(); }
export async function clearLocalModelCache() {
    disposeLocalEngines();
    failedGpu.clear();
    if (!('caches' in globalThis)) return;
    for (const name of await caches.keys()) {
        if (name === 'pixel-toon-ai-v1') { await caches.delete(name); continue; }
        if (!name.startsWith('pixel-toon-app-')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) if (/\/models\/|\/ort[.-]|\/ai\.worker-/.test(new URL(request.url).pathname)) await cache.delete(request);
    }
}
function acquireWorker(profile: LocalProfile) {
    const item = [...idle.entries()].find(([, value]) => value.profile === profile);
    if (item) { const [worker, { timer }] = item; clearTimeout(timer); idle.delete(worker); return worker; }
    disposeLocalEngines();
    return new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
}
function releaseWorker(worker: Worker, profile: LocalProfile) {
    worker.onmessage = null; worker.onerror = null;
    idle.set(worker, { profile, timer: setTimeout(() => { idle.delete(worker); worker.terminate(); }, 60000) });
}

export async function isLocalModelCached(profile: LocalProfile) {
    if (!('caches' in globalThis)) return false;
    return !!await caches.match(modelAssetUrl(localModel(profile), document.baseURI));
}
export interface LocalOutput { blob: Blob; width: number; height: number; backend: LocalBackend; modelId: string }
class RetryWasmError extends Error {}
export async function enhanceLocal(blob: Blob, signal: AbortSignal, onProgress: (progress: number, message: string) => void, profile: LocalProfile = 'liveaction', forceWasm = false): Promise<LocalOutput> {
    signal.throwIfAborted();
    const model = localModel(profile);
    const image = await decode(blob);
    let pixels: ImageData;
    try {
        checkDimensions(image.width, image.height, 2); checkLocalResources(image.width, image.height, model);
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        try { const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, 0, 0); pixels = ctx.getImageData(0, 0, image.width, image.height); }
        finally { canvas.width = 1; }
    } finally { image.close(); }
    signal.throwIfAborted();
    const worker = acquireWorker(profile);
    let succeeded = false;
    try {
        return await new Promise<LocalOutput>((resolve, reject) => {
            const abort = () => { finish(); worker.terminate(); reject(new DOMException('处理已取消', 'AbortError')); };
            signal.addEventListener('abort', abort, { once: true });
            const finish = () => signal.removeEventListener('abort', abort);
            worker.onmessage = event => {
                if (event.data.id !== 1) return;
                if (event.data.kind === 'progress') onProgress(event.data.progress, event.data.message);
                if (event.data.kind === 'fallback' || event.data.gpuDisabled) failedGpu.add(profile);
                if (event.data.kind === 'fallback') onProgress(0, '设备加速不可用，正在切换本机兼容模式，可能较慢…');
                if (event.data.kind === 'result') { finish(); succeeded = true; resolve(event.data); }
                if (event.data.kind === 'error') { finish(); reject(event.data.retryWasm ? new RetryWasmError(event.data.message) : new Error(event.data.message)); }
            };
            worker.onerror = () => { finish(); reject(new Error('本地推理 Worker 运行失败，请重试')); };
            worker.postMessage({ id: 1, width: pixels.width, height: pixels.height, buffer: pixels.data.buffer, profile, baseUrl: document.baseURI, skipGpu: forceWasm || failedGpu.has(profile) }, [pixels.data.buffer]);
        });
    } catch (error) {
        if (!(error instanceof RetryWasmError)) throw error;
        worker.terminate(); failedGpu.add(profile);
        onProgress(0, '设备加速失败，正在重新启动本机兼容模式，可能较慢…');
        signal.throwIfAborted();
        // A fresh Worker also recovers from unrecoverable ORT init/device state.
        return await enhanceLocal(blob, signal, onProgress, profile, true);
    } finally { if (succeeded) releaseWorker(worker, profile); else worker.terminate(); }
}

// Remove retired weight files, preserving all generated result images and active weights.
export async function pruneRetiredModelCache() {
    if (!('caches' in globalThis)) return;
    const allowed = new Set(localModels.map(model => modelAssetUrl(model, document.baseURI)));
    for (const name of await caches.keys()) {
        if (name !== 'pixel-toon-ai-v1' && !name.startsWith('pixel-toon-app-')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
            if (new URL(request.url).pathname.includes('/models/') && !allowed.has(request.url)) await cache.delete(request);
        }
    }
}
