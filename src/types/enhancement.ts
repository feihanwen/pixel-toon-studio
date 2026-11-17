export type TaskStatus = 'idle' | 'preparing' | 'processing' | 'saving' | 'succeeded' | 'failed' | 'cancelled';
export type EnhancementBackendMode = 'auto' | 'wasm';
export interface EnhancementSelection {
    enabled: boolean;
    resultId: string | null;
    strength: number;
    sharpen?: number;
    clarity?: number;
    denoise?: number;
}
export const defaultEnhancement = (): EnhancementSelection => ({ enabled: false, resultId: null, strength: 70 });
export const enhancementSharpen = (selection?: EnhancementSelection): number =>
    Number.isFinite(selection?.sharpen) ? Math.max(0, Math.min(100, Math.round(selection!.sharpen!))) : 0;
export const enhancementClarity = (selection?: EnhancementSelection): number =>
    Number.isFinite(selection?.clarity) ? Math.max(-50, Math.min(100, Math.round(selection!.clarity!))) : 0;
export const enhancementDenoise = (selection?: EnhancementSelection): number =>
    Number.isFinite(selection?.denoise) ? Math.max(0, Math.min(100, Math.round(selection!.denoise!))) : 0;
export interface EnhancementResult {
    id: string; cacheKey: string; sourceDigest: string; providerId: string;
    modelId: string; modelVersion: string; scale: number; blob: Blob;
    width: number; height: number; createdAt: number; lastUsedAt: number; byteSize: number;
    // May contain a retired profile on an existing saved result.
    localProfile?: string; executionBackend?: 'webgpu' | 'wasm';
}
export interface EnhancementTask {
    tabId: string; id: string; status: TaskStatus; message: string;
    progress?: number; startedAt: number;
}
export const activeTask = (task?: EnhancementTask) => !!task && !['idle', 'succeeded', 'failed', 'cancelled'].includes(task.status);
