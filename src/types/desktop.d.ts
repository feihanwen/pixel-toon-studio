export type DesktopCommand = 'import' | 'export' | 'undo' | 'redo';

export interface DesktopPreferencesPayload {
    language: 'zh' | 'en';
    themeMode: 'system' | 'light' | 'dark';
    themeColor: string;
    lightBg: string;
    darkBg: string;
}

declare global {
    interface Window {
        // Optional adapter: browser/iPhone builds do not depend on Electron.
        pixelToonDesktop?: {
            readonly platform: string;
            nextImage(): Promise<{ name: string; type: string; bytes: Uint8Array<ArrayBuffer> } | { error: string } | null>;
            onImagesAvailable(listener: () => void): () => void;
            savePng(bytes: Uint8Array, name: string): Promise<boolean>;
            onCommand(listener: (command: DesktopCommand) => void): () => void;
            onBeforeClose(listener: () => Promise<void>): () => void;
            setPreferences?(prefs: DesktopPreferencesPayload): Promise<void>;
        };
    }
}
