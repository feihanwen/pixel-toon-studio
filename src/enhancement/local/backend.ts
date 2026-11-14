import type { LocalBackend } from './modelManifest';

export interface LocalEngine { backend: LocalBackend; release(): Promise<void> }
export async function selectLocalBackend<T extends LocalEngine>(canUseGpu: boolean, create: (backend: LocalBackend) => Promise<T>, onFallback: () => void) {
    if (canUseGpu) {
        try { return await create('webgpu'); }
        catch { onFallback(); }
    }
    return create('wasm');
}
