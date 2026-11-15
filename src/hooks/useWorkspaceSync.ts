import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoTab } from '../types/document';
import { deleteTab, loadWorkspace, saveWorkspace } from '../storage/db';
import { pruneRetiredModelCache } from '../enhancement/local/LocalEnhancerClient';
import { getLanguage, type AppLanguage } from '../config/preferences';
import { uiText } from '../config/i18n';

interface UseWorkspaceSyncOptions {
    tabs: PhotoTab[];
    activeId: string | null;
    language?: AppLanguage;
    onLoaded: (tabs: PhotoTab[], activeId: string | null) => void;
    onNotice: (message: string) => void;
    onDispose: () => void;
}

export function useWorkspaceSync({
    tabs,
    activeId,
    language,
    onLoaded,
    onNotice,
    onDispose,
}: UseWorkspaceSyncOptions) {
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
            .catch(() => onNotice(uiText(getLanguage()).workspaceLoadFailed))
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
                    onNotice(uiText(getLanguage()).workspaceSaveQuotaFailed);
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
            .catch(() => onNotice(uiText(getLanguage()).deleteTabFailed));
    }

    async function flushWorkspace(latestTabs: PhotoTab[], latestActiveId: string | null) {
        clearTimeout(saveTimer.current);
        await saveChain.current.catch(() => {});
        await saveWorkspace(latestTabs, latestActiveId);
    }

    const activeLang = language ?? getLanguage();
    const status = useMemo(() => {
        const t = uiText(activeLang);
        return saveFailed ? t.saveFailedStatus : saving ? t.savingStatus : t.savedStatus;
    }, [saveFailed, saving, activeLang]);

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
