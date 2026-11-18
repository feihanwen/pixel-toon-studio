import { currentMsg } from '../config/errors';
import { getLanguage } from '../config/preferences';
import type { MosaicStroke } from '../types/mosaic';

export interface FaceMaskResult {
    width: number;
    height: number;
    matchedFaces: number;
    maskBuffer: ArrayBuffer;
}

type Pending = {
    id: number;
    resolve: (res: FaceMaskResult) => void;
    reject: (err: Error) => void;
};

let nextRequestId = 1;

export class FaceSegClient {
    private worker = new Worker(new URL('./faceSeg.worker.ts', import.meta.url), { type: 'module' });
    private pending = new Map<number, Pending>();

    constructor() {
        this.worker.onmessage = (
            event: MessageEvent<
                | { kind: 'result'; id: number; width: number; height: number; matchedFaces: number; maskBuffer: ArrayBuffer }
                | { kind: 'error'; id: number; message: string }
            >,
        ) => {
            const job = this.pending.get(event.data.id);
            if (!job) return;
            this.pending.delete(event.data.id);
            if (event.data.kind === 'error') {
                job.reject(new Error(event.data.message));
            } else {
                job.resolve({
                    width: event.data.width,
                    height: event.data.height,
                    matchedFaces: event.data.matchedFaces,
                    maskBuffer: event.data.maskBuffer,
                });
            }
        };
        this.worker.onerror = event => {
            const err = new Error(event.message || currentMsg('人脸识别 Worker 启动失败', 'Face segmentation worker failed to start'));
            for (const job of this.pending.values()) job.reject(err);
            this.pending.clear();
        };
    }

    computeMask(
        width: number,
        height: number,
        rgba: Uint8ClampedArray,
        strokes: MosaicStroke[],
        aiFaceFit: boolean,
    ): Promise<FaceMaskResult> {
        const id = nextRequestId++;
        const copy = rgba.slice();
        return new Promise((resolve, reject) => {
            this.pending.set(id, { id, resolve, reject });
            this.worker.postMessage(
                {
                    id,
                    width,
                    height,
                    buffer: copy.buffer,
                    strokes,
                    aiFaceFit,
                    baseUrl: typeof document !== 'undefined' ? document.baseURI : self.location.href,
                    language: getLanguage(),
                },
                [copy.buffer],
            );
        });
    }

    dispose() {
        this.worker.terminate();
        const err = new Error(currentMsg('人脸识别已取消', 'Face segmentation cancelled'));
        for (const job of this.pending.values()) job.reject(err);
        this.pending.clear();
    }
}
