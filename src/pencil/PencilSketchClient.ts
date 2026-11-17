export interface PencilSketchResult {
    width: number;
    height: number;
    sketchBuffer: ArrayBuffer;
}

type Pending = {
    id: number;
    resolve: (res: PencilSketchResult) => void;
    reject: (err: Error) => void;
};

let nextRequestId = 1;

export class PencilSketchClient {
    private worker = new Worker(new URL('./pencilSketch.worker.ts', import.meta.url), { type: 'module' });
    private pending = new Map<number, Pending>();

    constructor() {
        this.worker.onmessage = (
            event: MessageEvent<
                | { kind: 'result'; id: number; width: number; height: number; sketchBuffer: ArrayBuffer }
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
                    sketchBuffer: event.data.sketchBuffer,
                });
            }
        };
        this.worker.onerror = event => {
            const err = new Error(event.message || '彩铅线稿 Worker 启动失败');
            for (const job of this.pending.values()) job.reject(err);
            this.pending.clear();
        };
    }

    computeSketch(width: number, height: number, rgba: Uint8ClampedArray): Promise<PencilSketchResult> {
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
                    baseUrl: typeof document !== 'undefined' ? document.baseURI : self.location.href,
                },
                [copy.buffer],
            );
        });
    }

    dispose() {
        this.worker.terminate();
        const err = new Error('彩铅线稿处理已取消');
        for (const job of this.pending.values()) job.reject(err);
        this.pending.clear();
    }
}
