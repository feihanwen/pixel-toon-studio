import type { EnhancementResult, EnhancementTask, TaskStatus } from '../types/enhancement';
import type { PhotoTab } from '../types/document';
import { AI_TIMEOUT, cacheKey, digest, transition } from './domain';
import { disposeLocalEngines, enhanceLocal } from './local/LocalEnhancerClient';
import { cleanResults, findCached, storeResult } from '../storage/enhancementStore';
import { localCacheDescriptor, localModel, type LocalProfile } from './local/modelManifest';
import { getLanguage } from '../config/preferences';

const running = new Map<string, AbortController>();
export const cancelEnhancement = (tabId: string) => running.get(tabId)?.abort();
export const cancelAllEnhancements = () => { for (const controller of running.values()) controller.abort(); disposeLocalEngines(); };
export interface EnhancementRequest { force: boolean; localProfile?: LocalProfile }
export async function runEnhancement(tab: PhotoTab, request: EnhancementRequest, update: (task: EnhancementTask) => void,
    complete: (result: EnhancementResult, persisted: boolean) => void, protectedIds: Set<string>) {
    if (running.has(tab.id)) return;
    const en = getLanguage() === 'en';
    if (running.size) throw new Error(en ? 'Another local enhancement is running; please wait for it to finish' : '已有本地增强任务，请等待完成后再运行另一张照片');
    const controller = new AbortController(), signal = controller.signal;
    running.set(tab.id, controller);
    const timer = setTimeout(() => controller.abort(new DOMException(en ? 'Timed out' : '处理超时', 'TimeoutError')), AI_TIMEOUT);
    let task: EnhancementTask = { id: crypto.randomUUID(), tabId: tab.id, status: 'idle', message: '', startedAt: Date.now() };
    const emit = (status: TaskStatus, message: string, progress?: number) => { task = { ...task, status: transition(task.status, status), message, progress }; update(task); };
    try {
        emit('preparing', en ? 'Checking source photo & enhancement cache…' : '正在检查原图与增强缓存…');
        const sourceDigest = await digest(await tab.blob.arrayBuffer());
        const profile = request.localProfile ?? 'liveaction', model = localModel(profile);
        const hash = await cacheKey(sourceDigest, localCacheDescriptor(profile));
        const cached = request.force ? undefined : await findCached(hash);
        signal.throwIfAborted();
        if (cached) { emit('succeeded', en ? 'Restored from local enhancement cache' : '已复用本机增强缓存', 100); complete(cached, true); return; }
        emit('processing', en ? `Preparing ${model.label}…` : `正在准备${model.label}…`, 0);
        const output = await enhanceLocal(tab.blob, signal, (progress, message) => emit('processing', message, progress), profile);
        signal.throwIfAborted();
        emit('saving', en ? 'Saving local enhancement result…' : '正在保存本地增强结果…', 100);
        const result: EnhancementResult = { ...output, id: crypto.randomUUID(), cacheKey: hash, sourceDigest,
            providerId: 'local-onnx', modelId: `${model.label} ×2`, modelVersion: model.version, scale: 2,
            localProfile: profile, executionBackend: output.backend,
            byteSize: output.blob.size, createdAt: Date.now(), lastUsedAt: Date.now() };
        protectedIds.add(result.id);
        await cleanResults(protectedIds).catch(() => {});
        signal.throwIfAborted();
        const persisted = await storeResult(result);
        signal.throwIfAborted();
        emit('succeeded', persisted ? (en ? 'Enhancement complete and saved on device' : '清晰化已完成并保存到本机') : (en ? 'Enhancement complete, but disk storage is full — export soon' : '清晰化完成，但本机存储不足，请及时导出'), 100);
        complete(result, persisted);
    } catch (error) {
        const cancelled = signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
        const message = signal.reason?.name === 'TimeoutError'
            ? (en ? 'Processing exceeded 5 minutes and was stopped' : '处理超过 5 分钟，已停止等待')
            : cancelled
              ? (en ? 'Enhancement cancelled or timed out' : '处理已取消或超时')
              : error instanceof Error
                ? error.message
                : (en ? 'Local enhancement failed' : '本地增强失败');
        emit(cancelled ? 'cancelled' : 'failed', message);
    } finally { clearTimeout(timer); running.delete(tab.id); }
}
