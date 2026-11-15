const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelToonDesktop', {
    platform: process.platform,
    nextImage: () => ipcRenderer.invoke('desktop:next-image'),
    onImagesAvailable: listener => {
        const handler = () => listener();
        ipcRenderer.on('desktop:images-available', handler);
        return () => ipcRenderer.removeListener('desktop:images-available', handler);
    },
    savePng: (bytes, name) => ipcRenderer.invoke('desktop:save-png', bytes, name),
    onCommand: listener => {
        const handler = (_event, command) => listener(command);
        ipcRenderer.on('desktop:command', handler);
        return () => ipcRenderer.removeListener('desktop:command', handler);
    },
    onBeforeClose: listener => {
        const handler = async (_event, token) => {
            try { await listener(); ipcRenderer.send('desktop:close-ready', token, null); }
            catch (error) { ipcRenderer.send('desktop:close-ready', token, error instanceof Error ? error.message : '工作区保存失败'); }
        };
        ipcRenderer.on('desktop:before-close', handler);
        return () => ipcRenderer.removeListener('desktop:before-close', handler);
    },
    setPreferences: prefs => ipcRenderer.invoke('desktop:set-preferences', prefs),
});
