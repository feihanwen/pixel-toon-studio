import type { PhotoTab } from '../types/document';
import { normalizeHistory } from '../state/history';

const DB_NAME = 'pixel-toon-studio';
const VERSION = 5;
const storedBlobs = new Set<string>();

interface SavedTab extends Omit<PhotoTab, 'blob'> {}

export function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const name of ['providerConfigs', 'credentials', 'enhancementJobs']) {
                if (db.objectStoreNames.contains(name)) {
                    db.deleteObjectStore(name);
                }
            }
            if (!db.objectStoreNames.contains('enhancementResults')) {
                db.createObjectStore('enhancementResults', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('tabs')) {
                db.createObjectStore('tabs', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('blobs')) {
                db.createObjectStore('blobs');
            }
            if (!db.objectStoreNames.contains('workspace')) {
                db.createObjectStore('workspace');
            }
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

export function txDone(tx: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

function get<T>(store: IDBObjectStore, key: IDBValidKey) {
    return new Promise<T | undefined>((resolve, reject) => {
        const r = store.get(key);
        r.onsuccess = () => resolve(r.result as T | undefined);
        r.onerror = () => reject(r.error);
    });
}

export async function loadWorkspace(): Promise<{
    tabs: PhotoTab[];
    activeId: string | null;
}> {
    const db = await open();
    try {
        const tx = db.transaction(['tabs', 'blobs', 'workspace'], 'readonly');
        const meta = await get<{
            schemaVersion: number;
            tabOrder: string[];
            activeId: string | null;
        }>(tx.objectStore('workspace'), 'main');
        if (!meta) {
            return { tabs: [], activeId: null };
        }
        const tabs: PhotoTab[] = [];
        for (const id of meta.tabOrder) {
            const saved = await get<SavedTab>(tx.objectStore('tabs'), id);
            const blob = await get<Blob>(tx.objectStore('blobs'), id);
            if (saved && blob) {
                const firstWatercolor = saved.history?.entries?.[0]?.params?.watercolor;
                const alreadyNew =
                    firstWatercolor?.radius === 7 &&
                    firstWatercolor.smear === 78 &&
                    firstWatercolor.softness === 62 &&
                    firstWatercolor.detail === 55;
                tabs.push({
                    ...saved,
                    blob,
                    history: normalizeHistory(saved.history, (meta.schemaVersion ?? 1) < 2 && !alreadyNew),
                });
                storedBlobs.add(id);
            }
        }
        await txDone(tx);
        return {
            tabs,
            activeId: tabs.some(t => t.id === meta.activeId) ? meta.activeId : (tabs[0]?.id ?? null),
        };
    } finally {
        db.close();
    }
}

export async function saveWorkspace(tabs: PhotoTab[], activeId: string | null): Promise<void> {
    const db = await open();
    const newIds: string[] = [];
    try {
        const tx = db.transaction(['tabs', 'blobs', 'workspace'], 'readwrite');
        for (const tab of tabs) {
            const { blob, ...saved } = tab;
            tx.objectStore('tabs').put({ ...saved, savedAt: Date.now() });
            if (!storedBlobs.has(tab.id)) {
                tx.objectStore('blobs').put(blob, tab.id);
                newIds.push(tab.id);
            }
        }
        tx.objectStore('workspace').put(
            { schemaVersion: VERSION, tabOrder: tabs.map(t => t.id), activeId },
            'main',
        );
        await txDone(tx);
        for (const id of newIds) {
            storedBlobs.add(id);
        }
    } finally {
        db.close();
    }
}

export async function deleteTab(id: string): Promise<void> {
    const db = await open();
    try {
        const tx = db.transaction(['tabs', 'blobs'], 'readwrite');
        tx.objectStore('tabs').delete(id);
        tx.objectStore('blobs').delete(id);
        await txDone(tx);
        storedBlobs.delete(id);
    } finally {
        db.close();
    }
}
