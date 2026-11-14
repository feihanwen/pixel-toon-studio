import { open, txDone } from './db';
import type { EnhancementResult } from '../types/enhancement';
import type { PhotoTab } from '../types/document';

const memoryResults = new Map<string, EnhancementResult>();
async function read<T>(store: string, id?: string): Promise<T> {
    const db = await open();
    try {
        const tx = db.transaction(store, 'readonly');
        const request = id === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(id);
        return await new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    } finally { db.close(); }
}
async function write(store: string, value: { id: string } | null, id?: string) {
    const db = await open();
    try {
        const tx = db.transaction(store, 'readwrite');
        if (value) tx.objectStore(store).put(value); else if (id) tx.objectStore(store).delete(id); else tx.objectStore(store).clear();
        await txDone(tx);
    } finally { db.close(); }
}
export async function getResult(id: string): Promise<EnhancementResult | undefined> {
    const value = memoryResults.get(id) ?? await read<EnhancementResult | undefined>('enhancementResults', id);
    if (value && Date.now() - value.lastUsedAt > 60000) { value.lastUsedAt = Date.now(); if (!memoryResults.has(id)) await write('enhancementResults', value).catch(() => {}); }
    return value;
}
export async function findCached(key: string) {
    return [...memoryResults.values()].find(r => r.cacheKey === key) ?? (await read<EnhancementResult[]>('enhancementResults')).find(r => r.cacheKey === key);
}
export async function storeResult(value: EnhancementResult) {
    try { await write('enhancementResults', value); memoryResults.delete(value.id); return true; }
    catch { memoryResults.set(value.id, value); return false; }
}
export function referencedResults(tabs: PhotoTab[]) {
    return new Set(tabs.flatMap(t => t.history.entries.map(s => s.enhancement?.resultId).filter((id): id is string => !!id)));
}
export async function cleanResults(protectedIds: Set<string>, all = false) {
    const entries = await read<EnhancementResult[]>('enhancementResults');
    const estimate = await navigator.storage?.estimate?.().catch(() => ({} as StorageEstimate));
    const budget = Math.min(500 * 1048576, (estimate?.quota ? Math.max(0, estimate.quota - (estimate.usage ?? 0)) * .25 : 200 * 1048576));
    let total = entries.reduce((sum, r) => sum + r.byteSize, 0), removed = 0;
    for (const result of entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
        if (protectedIds.has(result.id) || (!all && total <= budget)) continue;
        await write('enhancementResults', null, result.id); memoryResults.delete(result.id);
        total -= result.byteSize; removed++;
    }
    return removed;
}
