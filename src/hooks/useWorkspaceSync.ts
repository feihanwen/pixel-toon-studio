import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoTab } from '../types/document';
import { deleteTab, loadWorkspace, saveWorkspace } from '../storage/db';
import { pruneRetiredModelCache } from '../enhancement/local/LocalEnhancerClient';

interface UseWorkspaceSyncOptions {
    tabs: PhotoTab[];
    activeId: string | null;
    onLoaded: (tabs: PhotoTab[], activeId: string | null) => void;
    onNotice: (message: string) => void;
    onDispose: () => void;
}

export function useWorkspaceSync({ tabs, activeId, onLoaded, onNotice, onDispose }: UseWorkspaceSyncOptions) {
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);

    const saveSequence = useRef(0);
    const saveChain = useRef(Promise.resolve());
    const saveTimer = useRef<ReturnType<typeof setTimeout>>();
    const dirtyIds = useRef(new Set<string>());
    const dirtyVersion = useRef(0);

    useEffect(() => {
        void pruneRetiredModelCache().catch(() => {});
        loadWorkspace()
            .then(ws => {
                onLoaded(
                    ws.tabs.map(t => ({ ...t, exifPrompted: t.exifPrompted ?? false })),
                    ws.activeId,
                );
            })
            .catch(() => onNotice('无法读取本地工作区，仍可继续导入图片'))
            .finally(() => setReady(true));
        return () => {
            onDispose();
        };
    }, []);

    useEffect(() => {
        if (!ready) return;
        const seq = ++saveSequence.current;
        const version = dirtyVersion.current;
        setSaving(true);
        const timer = setTimeout(() => {
            saveChain.current = saveChain.current
                .catch(() => {})
                .then(() => saveWorkspace(tabs, activeId))
                .then(() => {
                    if (seq === saveSequence.current) {
                        setSaving(false);
                        setSaveFailed(false);
                        if (version === dirtyVersion.current) {
                            dirtyIds.current.clear();
                        }
                    }
                })
                .catch(() => {
                    setSaving(false);
                    setSaveFailed(true);
                    onNotice('未保存到本机：浏览器存储空间可能不足。当前编辑仍可导出。');
                });
        }, 400);
        saveTimer.current = timer;
        return () => clearTimeout(timer);
    }, [tabs, activeId, ready]);

    function markDirty(id: string) {
        dirtyIds.current.add(id);
        dirtyVersion.current++;
    }

    function hasDirty(id: string): boolean {
        return dirtyIds.current.has(id);
    }

    function removeTabFromStorage(id: string) {
        dirtyIds.current.delete(id);
        saveChain.current = saveChain.current
            .catch(() => {})
            .then(() => deleteTab(id))
            .catch(() => onNotice('本地标签记录删除失败'));
    }

    async function flushWorkspace(latestTabs: PhotoTab[], latestActiveId: string | null) {
        clearTimeout(saveTimer.current);
        await saveChain.current.catch(() => {});
        await saveWorkspace(latestTabs, latestActiveId);
    }

    const status = useMemo(
        () => (saveFailed ? '未保存到本机' : saving ? '正在保存' : '已保存到本机'),
        [saveFailed, saving],
    );

    return {
        ready,
        saving,
        saveFailed,
        status,
        markDirty,
        hasDirty,
        removeTabFromStorage,
        flushWorkspace,
    };
}
