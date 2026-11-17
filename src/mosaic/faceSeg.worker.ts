import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { digest } from '../enhancement/domain';
import type { MosaicStroke } from '../types/mosaic';
import { buildCropFaceMask, computeFaceCropBoxes, rasterizeStrokes, refineMaskLocalEdgeAware } from './maskMath';
import { FACE_SEG_MODEL, faceSegModelUrl } from './modelManifest';

interface FaceMaskRequest {
    id: number;
    width: number;
    height: number;
    buffer: ArrayBuffer;
    strokes: MosaicStroke[];
    aiFaceFit: boolean;
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
    if (!response.ok) throw new Error('人脸贴合模型加载失败');
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
        const modelUrl = faceSegModelUrl(baseUrl);
        if (new URL(modelUrl).origin !== self.location.origin) {
            throw new Error('本地模型必须来自本站');
        }
        const [modelBytes, wasmBytes] = await Promise.all([cachedAsset(modelUrl), cachedAsset(wasmUrl)]);
        if (modelBytes.byteLength !== FACE_SEG_MODEL.bytes || (await digest(modelBytes)) !== FACE_SEG_MODEL.sha256) {
            throw new Error('人脸贴合模型校验失败');
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

function sampleCropBilinear(
    src: Float32Array,
    w: number,
    h: number,
    sx: number,
    sy: number,
    size: number,
    side: number,
): Float32Array {
    const out = new Float32Array(side * side);
    for (let dy = 0; dy < side; dy++) {
        const py = sy + ((dy + 0.5) / side) * size - 0.5;
        const y0 = Math.max(0, Math.min(h - 1, Math.floor(py)));
        const y1 = Math.max(0, Math.min(h - 1, y0 + 1));
        const wy = Math.max(0, Math.min(1, py - y0));
        for (let dx = 0; dx < side; dx++) {
            const px = sx + ((dx + 0.5) / side) * size - 0.5;
            const x0 = Math.max(0, Math.min(w - 1, Math.floor(px)));
            const x1 = Math.max(0, Math.min(w - 1, x0 + 1));
            const wx = Math.max(0, Math.min(1, px - x0));
            const v00 = src[y0 * w + x0];
            const v10 = src[y0 * w + x1];
            const v01 = src[y1 * w + x0];
            const v11 = src[y1 * w + x1];
            out[dy * side + dx] = (v00 * (1 - wx) + v10 * wx) * (1 - wy) + (v01 * (1 - wx) + v11 * wx) * wy;
        }
    }
    return out;
}

async function computeMask(req: FaceMaskRequest): Promise<{ maskBytes: Uint8Array; matchedFaces: number }> {
    const { width: w, height: h, strokes, aiFaceFit, baseUrl } = req;
    const src = new Uint8ClampedArray(req.buffer);
    const { combined, paintOnly, eraseOnly } = rasterizeStrokes(strokes, w, h);

    if (!aiFaceFit || !strokes.some(s => s.mode === 'paint')) {
        const refined = refineMaskLocalEdgeAware(src, w, h, combined);
        const bytes = new Uint8Array(w * h);
        for (let q = 0; q < bytes.length; q++) bytes[q] = Math.round(Math.max(0, Math.min(1, refined[q])) * 255);
        return { maskBytes: bytes, matchedFaces: 0 };
    }

    const crops = computeFaceCropBoxes(strokes, w, h);
    const ortSession = await ensureSession(baseUrl);
    const side = FACE_SEG_MODEL.inputSize;
    const aiMask = new Float32Array(w * h);
    const fallbackPaintMask = paintOnly.slice();
    let matchedFaces = 0;

    for (const crop of crops) {
        const { sx, sy, size } = crop;
        const tensorData = new Float32Array(side * side * 3);
        for (let dy = 0; dy < side; dy++) {
            const py = sy + ((dy + 0.5) / side) * size - 0.5;
            const y0 = Math.max(0, Math.min(h - 1, Math.floor(py)));
            const y1 = Math.max(0, Math.min(h - 1, y0 + 1));
            const wy = Math.max(0, Math.min(1, py - y0));
            for (let dx = 0; dx < side; dx++) {
                const px = sx + ((dx + 0.5) / side) * size - 0.5;
                const x0 = Math.max(0, Math.min(w - 1, Math.floor(px)));
                const x1 = Math.max(0, Math.min(w - 1, x0 + 1));
                const wx = Math.max(0, Math.min(1, px - x0));
                const di = (dy * side + dx) * 3;
                const i00 = (y0 * w + x0) * 4;
                const i10 = (y0 * w + x1) * 4;
                const i01 = (y1 * w + x0) * 4;
                const i11 = (y1 * w + x1) * 4;
                for (let c = 0; c < 3; c++) {
                    const top = src[i00 + c] * (1 - wx) + src[i10 + c] * wx;
                    const bot = src[i01 + c] * (1 - wx) + src[i11 + c] * wx;
                    tensorData[di + c] = (top * (1 - wy) + bot * wy) / 255;
                }
            }
        }

        const tensor = new ort.Tensor('float32', tensorData, [1, side, side, 3]);
        let outputs: Awaited<ReturnType<ort.InferenceSession['run']>> | undefined;
        try {
            outputs = await ortSession.run({ [FACE_SEG_MODEL.inputName]: tensor });
            const probs = outputs[FACE_SEG_MODEL.outputName].data as Float32Array;
            const faceProb = new Float32Array(side * side);
            const hairProb = new Float32Array(side * side);
            for (let q = 0; q < side * side; q++) {
                hairProb[q] = probs[q * 6 + 1];
                faceProb[q] = probs[q * 6 + 3];
            }

            const paintCrop = sampleCropBilinear(paintOnly, w, h, sx, sy, size, side);
            const { matched, mask: cropFaceMask } = buildCropFaceMask(paintCrop, faceProb, hairProb, side);

            if (matched) {
                matchedFaces++;
                const ex = Math.min(w, sx + size);
                const ey = Math.min(h, sy + size);
                for (let y = sy; y < ey; y++) {
                    const fy = ((y - sy + 0.5) / size) * side - 0.5;
                    const y0 = Math.max(0, Math.min(side - 1, Math.floor(fy)));
                    const y1 = Math.max(0, Math.min(side - 1, y0 + 1));
                    const wy = Math.max(0, Math.min(1, fy - y0));
                    for (let x = sx; x < ex; x++) {
                        const fx = ((x - sx + 0.5) / size) * side - 0.5;
                        const x0 = Math.max(0, Math.min(side - 1, Math.floor(fx)));
                        const x1 = Math.max(0, Math.min(side - 1, x0 + 1));
                        const wx = Math.max(0, Math.min(1, fx - x0));
                        const v =
                            (cropFaceMask[y0 * side + x0] * (1 - wx) + cropFaceMask[y0 * side + x1] * wx) * (1 - wy) +
                            (cropFaceMask[y1 * side + x0] * (1 - wx) + cropFaceMask[y1 * side + x1] * wx) * wy;
                        const q = y * w + x;
                        aiMask[q] = Math.max(aiMask[q], v);
                        // Suppress raw paint fallback inside matched face/hair crop so brushed hair isn't re-blurred
                        fallbackPaintMask[q] = 0;
                    }
                }
            }
        } finally {
            tensor.dispose();
            if (outputs) for (const value of Object.values(outputs)) value.dispose();
        }
    }

    const fallbackRefined = refineMaskLocalEdgeAware(src, w, h, fallbackPaintMask);
    const bytes = new Uint8Array(w * h);
    for (let q = 0; q < w * h; q++) {
        const merged = Math.max(aiMask[q], fallbackRefined[q]) * (1 - eraseOnly[q]);
        bytes[q] = Math.round(Math.max(0, Math.min(1, merged)) * 255);
    }
    return { maskBytes: bytes, matchedFaces };
}

self.onmessage = (event: MessageEvent<FaceMaskRequest>) => {
    const req = event.data;
    computeMask(req)
        .then(({ maskBytes, matchedFaces }) => {
            self.postMessage(
                {
                    kind: 'result',
                    id: req.id,
                    width: req.width,
                    height: req.height,
                    matchedFaces,
                    maskBuffer: maskBytes.buffer,
                },
                { transfer: [maskBytes.buffer] },
            );
        })
        .catch(error => {
            self.postMessage({
                kind: 'error',
                id: req.id,
                message: error instanceof Error ? error.message : '人脸贴合处理失败',
            });
        });
};
