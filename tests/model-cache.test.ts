import { expect, it, vi } from 'vitest';
import { pruneRetiredModelCache } from '../src/enhancement/local/LocalEnhancerClient';
import { localModels, modelAssetUrl } from '../src/enhancement/local/modelManifest';

it('removes retired weight cache entries while keeping both active models and other resources', async () => {
    const base = 'https://example.test/app/';
    const active = localModels.map(model => modelAssetUrl(model, base));
    const retired = base + 'models/realesr-general-x4v3/model.onnx?sha256=old';
    const runtime = base + 'assets/ort-runtime.wasm';
    const image = base + 'results/previous-enhanced.png';
    const removed: string[] = [];
    const entries = new Map([
        ['pixel-toon-ai-v1', [...active, retired, runtime]],
        ['pixel-toon-app-current', [retired, image]],
        ['unrelated-cache', [retired]],
    ]);
    vi.stubGlobal('document', { baseURI: base });
    vi.stubGlobal('caches', {
        keys: async () => [...entries.keys()],
        open: async (name: string) => ({
            keys: async () => entries.get(name)!.map(url => new Request(url)),
            delete: async (request: Request) => { removed.push(`${name}:${request.url}`); return true; },
        }),
    });
    try {
        await pruneRetiredModelCache();
        expect(removed).toEqual([`pixel-toon-ai-v1:${retired}`, `pixel-toon-app-current:${retired}`]);
    } finally { vi.unstubAllGlobals(); }
});
