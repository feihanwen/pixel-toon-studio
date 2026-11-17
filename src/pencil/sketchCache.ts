export interface CachedPencilSketch {
    key: string;
    tabId: string;
    width: number;
    height: number;
    sketchBuffer: ArrayBuffer;
}

/**
 * Bounded LRU cache for per-photo neural pencil line-art maps.
 * Keeps results across style and tab switches, and drops entries immediately when a tab is closed.
 */
export class PencilSketchCache {
    private entries = new Map<string, CachedPencilSketch>();

    constructor(private readonly maxEntries = 10) {}

    get size(): number {
        return this.entries.size;
    }

    get(key: string): CachedPencilSketch | null {
        const hit = this.entries.get(key);
        if (!hit) return null;
        // Refresh MRU order
        this.entries.delete(key);
        this.entries.set(key, hit);
        return hit;
    }

    set(entry: CachedPencilSketch): void {
        if (this.entries.has(entry.key)) {
            this.entries.delete(entry.key);
        }
        this.entries.set(entry.key, entry);
        while (this.entries.size > this.maxEntries) {
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey === undefined) break;
            this.entries.delete(oldestKey);
        }
    }

    evictTab(tabId: string): void {
        for (const [key, entry] of this.entries) {
            if (entry.tabId === tabId) {
                this.entries.delete(key);
            }
        }
    }

    pruneTabs(activeTabIds: ReadonlySet<string>): void {
        for (const [key, entry] of this.entries) {
            if (!activeTabIds.has(entry.tabId)) {
                this.entries.delete(key);
            }
        }
    }

    clear(): void {
        this.entries.clear();
    }
}
