import { useEffect } from 'react';

export const isEditable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        target.tagName === 'TEXTAREA' ||
        (target instanceof HTMLInputElement &&
            ['text', 'search', 'email', 'url', 'password', 'tel', 'number', 'date', 'time'].includes(target.type)));

interface UseEditorShortcutsOptions {
    onUndo: (delta: number) => void;
    onShowOriginalChange: (visible: boolean) => void;
    onImportFiles: (files: File[]) => Promise<void>;
    onDraggingChange: (dragging: boolean) => void;
    deps: readonly unknown[];
}

export function useEditorShortcuts({
    onUndo,
    onShowOriginalChange,
    onImportFiles,
    onDraggingChange,
    deps,
}: UseEditorShortcutsOptions) {
    useEffect(() => {
        const keydown = (e: KeyboardEvent) => {
            if (isEditable(e.target)) return;
            const key = e.key.toLowerCase();
            if ((e.metaKey || e.ctrlKey) && key === 'z') {
                e.preventDefault();
                onUndo(e.shiftKey ? 1 : -1);
            } else if (e.ctrlKey && !e.metaKey && !e.shiftKey && key === 'y') {
                // Windows standard Ctrl+Y Redo shortcut
                e.preventDefault();
                onUndo(1);
            } else if (
                e.code === 'Space' &&
                !e.repeat &&
                !(
                    e.target instanceof HTMLElement &&
                    ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(e.target.tagName)
                )
            ) {
                e.preventDefault();
                onShowOriginalChange(true);
            }
        };
        const keyup = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                onShowOriginalChange(false);
            }
        };
        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);
        return () => {
            window.removeEventListener('keydown', keydown);
            window.removeEventListener('keyup', keyup);
        };
    }, deps);

    useEffect(() => {
        const paste = (e: ClipboardEvent) => {
            if (isEditable(e.target)) return;
            const files = Array.from(e.clipboardData?.items ?? [])
                .filter(i => i.kind === 'file')
                .map(i => i.getAsFile())
                .filter((f): f is File => !!f);
            if (files.length) {
                e.preventDefault();
                void onImportFiles(files);
            }
        };
        window.addEventListener('paste', paste);
        return () => window.removeEventListener('paste', paste);
    }, []);

    useEffect(() => {
        const over = (e: DragEvent) => {
            if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
                e.preventDefault();
                onDraggingChange(true);
            }
        };
        const leave = (e: DragEvent) => {
            if (!e.relatedTarget) {
                onDraggingChange(false);
            }
        };
        const drop = (e: DragEvent) => {
            e.preventDefault();
            onDraggingChange(false);
            void onImportFiles(Array.from(e.dataTransfer?.files ?? []));
        };
        window.addEventListener('dragover', over);
        window.addEventListener('dragleave', leave);
        window.addEventListener('drop', drop);
        return () => {
            window.removeEventListener('dragover', over);
            window.removeEventListener('dragleave', leave);
            window.removeEventListener('drop', drop);
        };
    }, []);
}
