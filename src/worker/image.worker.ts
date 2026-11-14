import type { RenderRequest, WorkerResponse } from '../types/worker';
import { render } from './pipeline';
self.onmessage = (event: MessageEvent<RenderRequest>) => { const req = event.data; try {
    const buffer = render(req);
    const result: WorkerResponse = { kind: 'result', id: req.id, tabId: req.tabId, revision: req.revision, width: req.width, height: req.height, buffer };
    self.postMessage(result, { transfer: [buffer] });
}
catch (error) {
    const result: WorkerResponse = { kind: 'error', id: req.id, tabId: req.tabId, revision: req.revision, message: error instanceof Error ? error.message : '图像处理失败' };
    self.postMessage(result);
} };
