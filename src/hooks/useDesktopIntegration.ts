import { useEffect } from 'react';
import { isEditable } from './useEditorShortcuts';

interface UseDesktopIntegrationOptions {
    ready: boolean;
    importing: boolean;
    exporting: boolean;
    onImportTrigger: () => void;
    onImportFiles: (files: File[]) => Promise<void>;
    onExport: () => Promise<void>;
    onUndo: (delta: number) => void;
    onNotice: (message: string) => void;
    onBeforeCloseFlush: () => Promise<void>;
    commandDeps: readonly unknown[];
    closeDeps: readonly unknown[];
}

export function useDesktopIntegration({
    ready,
    importing,
    exporting,
    onImportTrigger,
    onImportFiles,
    onExport,
    onUndo,
    onNotice,
    onBeforeCloseFlush,
    commandDeps,
    closeDeps,
}: UseDesktopIntegrationOptions) {
    useEffect(() => {
        const desktop = window.pixelToonDesktop;
        if (!ready || !desktop) return;
        let cancelled = false;
        let draining = false;
        let requested = false;

        const drain = async () => {
            requested = true;
            if (draining) return;
            draining = true;
            try {
                do {
                    requested = false;
                    while (!cancelled) {
                        const image = await desktop.nextImage();
                        if (!image || cancelled) break;
                        if ('error' in image) {
                            onNotice(image.error);
                        } else {
                            await onImportFiles([new File([image.bytes], image.name, { type: image.type })]);
                        }
                    }
                } while (requested && !cancelled);
            } catch (error) {
                if (!cancelled) {
                    onNotice(`图片导入失败：${error instanceof Error ? error.message : '无法读取文件'}`);
                }
            } finally {
                draining = false;
            }
        };

        const unsubscribe = desktop.onImagesAvailable(() => {
            void drain();
        });
        // Wait for restoration so saved tabs cannot overwrite startup imports.
        // The initial pull also covers OS events received before React mounted.
        void drain();
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [ready]);

    useEffect(
        () =>
            window.pixelToonDesktop?.onCommand(command => {
                if (command === 'import') {
                    onImportTrigger();
                } else if (command === 'export') {
                    void onExport();
                } else if (isEditable(document.activeElement)) {
                    document.execCommand(command === 'undo' ? 'undo' : 'redo');
                } else {
                    onUndo(command === 'undo' ? -1 : 1);
                }
            }),
        commandDeps,
    );

    useEffect(
        () =>
            window.pixelToonDesktop?.onBeforeClose(async () => {
                if (!ready || importing || exporting) {
                    throw new Error('图片正在读取、导入或导出，请稍后关闭。');
                }
                await onBeforeCloseFlush();
            }),
        closeDeps,
    );
}
