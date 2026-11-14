import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { open, txDone, saveWorkspace, loadWorkspace } from '../src/storage/db';
import { initialSnapshot, normalizeHistory } from '../src/state/history';
import { storeResult, getResult, referencedResults, findCached } from '../src/storage/enhancementStore';
import type { EnhancementResult } from '../src/types/enhancement';
import type { PhotoTab } from '../src/types/document';

describe('v5 local-only workspace migration', () => {
    it('repairs every v3 history entry, preserving cursor and edits', () => {
        const old = JSON.parse(JSON.stringify({ entries: [initialSnapshot(), initialSnapshot()], cursor: 0 }));
        old.entries[1].params.film.grain = 77;
        for (const s of old.entries) delete s.enhancement;
        const migrated = normalizeHistory(old);
        expect(migrated.cursor).toBe(0); expect(migrated.entries[1].params.film.grain).toBe(77);
        expect(migrated.entries.every(s => s.enhancement.enabled === false && s.enhancement.resultId === null)).toBe(true);
        expect(normalizeHistory(migrated)).toEqual(migrated);
    });
    it('removes old cloud configuration and secrets while preserving photos and results', async () => {
        const request = indexedDB.open('pixel-toon-studio', 4);
        request.onupgradeneeded = () => {
            for (const name of ['tabs', 'enhancementResults', 'providerConfigs', 'credentials', 'enhancementJobs']) request.result.createObjectStore(name, { keyPath: 'id' });
            request.result.createObjectStore('blobs'); request.result.createObjectStore('workspace');
        };
        const old = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const tab: PhotoTab = { id: 'persist-test', name: 'test.png', blob: new Blob(['original'], { type: 'image/png' }), width: 20, height: 10, mimeType: 'image/png', createdAt: 1, savedAt: 0, exifContainerPresent: false, exifConsent: false, exifPrompted: false, history: { entries: [initialSnapshot()], cursor: 0 } };
        const { blob, ...saved } = tab;
        const tx = old.transaction([...old.objectStoreNames], 'readwrite');
        tx.objectStore('credentials').put({ id: 'old-provider', secret: 'fake-secret-test-only' });
        tx.objectStore('providerConfigs').put({ id: 'old-provider' });
        tx.objectStore('enhancementJobs').put({ id: 'old-job' });
        tx.objectStore('tabs').put(saved); tx.objectStore('blobs').put(blob, tab.id);
        tx.objectStore('workspace').put({ schemaVersion: 4, tabOrder: [tab.id], activeId: tab.id }, 'main');
        tx.objectStore('enhancementResults').put({ id: 'legacy-result', width: 40 });
        await txDone(tx); old.close();
        const db = await open(); expect(db.version).toBe(5);
        for (const name of ['credentials', 'providerConfigs', 'enhancementJobs']) expect([...db.objectStoreNames]).not.toContain(name);
        expect([...db.objectStoreNames]).toContain('enhancementResults'); db.close();
        expect((await getResult('legacy-result'))?.width).toBe(40);
        const workspace = await loadWorkspace(); expect(workspace.tabs).toHaveLength(1);
        expect(workspace.tabs[0].id).toBe(tab.id); expect(workspace.tabs[0].blob.size).toBe(8);
        expect(JSON.stringify(workspace)).not.toContain('fake-secret-test-only');
        await saveWorkspace(workspace.tabs, tab.id);
        expect((await loadWorkspace()).tabs[0].history).toEqual(tab.history);
    });
    it('stores result Blobs independently and history only references IDs', async () => {
        const result: EnhancementResult = { id: 'result', cacheKey: 'cache', sourceDigest: 'source', providerId: 'local', modelId: 'FSRCNN', modelVersion: '1', scale: 2, blob: new Blob(['pixels']), width: 40, height: 20, createdAt: 1, lastUsedAt: 1, byteSize: 6 };
        expect(await storeResult(result)).toBe(true);
        expect((await getResult('result'))?.width).toBe(40); expect((await findCached('cache'))?.id).toBe('result');
        const s = initialSnapshot(); s.enhancement = { enabled: true, resultId: 'result', strength: 70 };
        const tab = { history: { entries: [s], cursor: 0 } } as PhotoTab;
        expect([...referencedResults([tab])]).toEqual(['result']);
        expect(JSON.stringify(s)).not.toContain('pixels');
    });
});
