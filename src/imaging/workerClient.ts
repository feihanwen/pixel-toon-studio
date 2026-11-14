import type { RenderRequest, WorkerResponse } from '../types/worker';
let nextId = 1;
type Job = {
    request: RenderRequest;
    resolve: (value: WorkerResponse) => void;
    reject: (error: Error) => void;
};
export class WorkerClient {
    private worker = new Worker(new URL('../worker/image.worker.ts', import.meta.url), { type: 'module' });
    private active: Job | null = null;
    private queued: Job | null = null;
    constructor() { this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => { const job = this.active; if (job && job.request.id === event.data.id) {
        this.active = null;
        job.resolve(event.data);
        this.startQueued();
    } }; this.worker.onerror = (event) => { const error = new Error(event.message || 'Worker 运行失败'); this.active?.reject(error); this.queued?.reject(error); this.active = null; this.queued = null; }; }
    private start(job: Job) { this.active = job; this.worker.postMessage(job.request, [job.request.buffer]); }
    private startQueued() { if (this.queued) {
        const job = this.queued;
        this.queued = null;
        this.start(job);
    } }
    render(input: Omit<RenderRequest, 'kind' | 'id'>) { const request: RenderRequest = { ...input, kind: 'render', id: nextId++ }; return new Promise<WorkerResponse>((resolve, reject) => { const job = { request, resolve, reject }; if (!this.active)
        this.start(job);
    else if (input.mode === 'preview') {
        if (this.queued)
            this.queued.resolve({ kind: 'error', id: this.queued.request.id, tabId: this.queued.request.tabId, revision: this.queued.request.revision, message: '已被更新的预览替代' });
        this.queued = job;
    }
    else
        this.queued = job; }); }
    dispose() { this.worker.terminate(); const error = new Error('处理已取消'); this.active?.reject(error); this.queued?.reject(error); this.active = null; this.queued = null; }
}
