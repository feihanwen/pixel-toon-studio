import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, screen, nativeTheme } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { APP_URL, createAssetHandler, imagePayload, isAppUrl } from './local-assets.mjs';
import { OpenImageQueue, imageArguments } from './open-images.mjs';

const here = dirname(fileURLToPath(import.meta.url));
app.setName('Pixel & Toon Studio');
if (process.platform === 'win32') {
    app.setAppUserModelId('studio.pixeltoon.desktop');
}

// Keep native menus, dialogs and CSS media queries aligned with system or chosen appearance.
nativeTheme.themeSource = 'system';

const currentPrefs = {
    language: 'zh',
    themeMode: 'system',
    lightBg: '#dce7f2',
    darkBg: '#182b43',
};

const windowBackground = () => (nativeTheme.shouldUseDarkColors ? currentPrefs.darkBg : currentPrefs.lightBg);

// A separate profile is also useful for a portable local test installation.
// Normal Finder/Explorer launches always use the standard userData location.
const profileArg = process.argv.find(arg => arg.startsWith('--pixel-toon-profile='));
if (profileArg) app.setPath('userData', profileArg.slice('--pixel-toon-profile='.length));

protocol.registerSchemesAsPrivileged([{ scheme: 'pixel-toon', privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true,
} }]);

let mainWindow, quitting = false, saveDialogOpen = false;
let activeExportDir = null;
let creatingWindow;
let desktopReady = false;
const openImages = new OpenImageQueue();

function platformLabel() {
    if (process.platform === 'darwin') {
        return process.arch === 'arm64' ? 'macOS · Apple Silicon' : `macOS · ${process.arch}`;
    }
    if (process.platform === 'win32') {
        return `Windows · ${process.arch}`;
    }
    return `${process.platform} · ${process.arch}`;
}

function focusWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function queueImage(path) {
    if (!openImages.add(path)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop:images-available');
        focusWindow();
    } else if (desktopReady) {
        const title = currentPrefs.language === 'en' ? 'Cannot Open Photo' : '无法打开图片';
        void ensureWindow().catch(error => dialog.showErrorBox(title, error.message));
    }
}

// Finder may send open-file before Electron is ready, including cold launches.
app.on('open-file', (event, path) => { event.preventDefault(); queueImage(path); });
for (const path of imageArguments(process.argv.slice(app.isPackaged ? 1 : 2))) queueImage(path);

const closeRequests = new Map();
const windowStateFile = () => join(app.getPath('userData'), 'window-state.json');
const trustedSender = event => mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && isAppUrl(event.senderFrame.url);

ipcMain.handle('desktop:next-image', event => {
    if (!trustedSender(event)) throw new Error('无效的图片导入请求');
    return openImages.next();
});

ipcMain.handle('desktop:set-preferences', (event, prefs) => {
    if (!trustedSender(event) || !prefs || typeof prefs !== 'object') return;
    const nextLang = prefs.language === 'en' ? 'en' : 'zh';
    const langChanged = nextLang !== currentPrefs.language;
    currentPrefs.language = nextLang;
    if (typeof prefs.lightBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(prefs.lightBg)) {
        currentPrefs.lightBg = prefs.lightBg;
    }
    if (typeof prefs.darkBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(prefs.darkBg)) {
        currentPrefs.darkBg = prefs.darkBg;
    }
    if (['system', 'light', 'dark'].includes(prefs.themeMode) && prefs.themeMode !== currentPrefs.themeMode) {
        currentPrefs.themeMode = prefs.themeMode;
        nativeTheme.themeSource = prefs.themeMode;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBackgroundColor(windowBackground());
    }
    if (langChanged) {
        installMenu();
    }
});

async function closeFailure(win, message) {
    if (win.isDestroyed()) return;
    const en = currentPrefs.language === 'en';
    const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: en ? 'Workspace Not Saved' : '工作区尚未保存',
        message,
        detail: en
            ? 'Return to the editor to retry saving or export your photos. Closing directly may lose recent edits.'
            : '返回编辑器后可以重试保存或导出图片。直接关闭可能丢失最新编辑。',
        buttons: en ? ['Return to Editor', 'Close Anyway'] : ['返回编辑器', '直接关闭'],
        defaultId: 0,
        cancelId: 0,
    });
    if (response === 1 && !win.isDestroyed()) { win.closeAllowed = true; win.close(); }
    else quitting = false;
}

ipcMain.on('desktop:close-ready', (event, token, error) => {
    if (!trustedSender(event)) return;
    const pending = closeRequests.get(token);
    if (!pending) return;
    clearTimeout(pending.timer); closeRequests.delete(token);
    if (error) { void closeFailure(pending.win, String(error)); return; }
    pending.win.closeAllowed = true;
    pending.win.close();
});

async function handleSaveImage(event, bytes, name, format = 'png') {
    const en = currentPrefs.language === 'en';
    if (!trustedSender(event)) throw new Error(en ? 'Invalid save request' : '无效的保存请求');
    if (saveDialogOpen) throw new Error(en ? 'Please complete the current save first' : '请先完成当前图片的保存');
    const resolvedFormat = format === 'jpeg' ? 'jpeg' : 'png';
    const { data, filename } = imagePayload(bytes, name, resolvedFormat);
    saveDialogOpen = true;
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: en
                ? (resolvedFormat === 'jpeg' ? 'Save JPEG Image' : 'Save PNG Image')
                : (resolvedFormat === 'jpeg' ? '保存 JPEG 图片' : '保存 PNG 图片'),
            defaultPath: join(app.getPath('downloads'), filename),
            filters: [
                resolvedFormat === 'jpeg'
                    ? { name: en ? 'JPEG Image' : 'JPEG 图片', extensions: ['jpg', 'jpeg'] }
                    : { name: en ? 'PNG Image' : 'PNG 图片', extensions: ['png'] },
            ],
            properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (canceled || !filePath) return false;
        await writeFile(filePath, data);
        return true;
    } finally { saveDialogOpen = false; }
}

ipcMain.handle('desktop:save-png', (event, bytes, name) => handleSaveImage(event, bytes, name, 'png'));
ipcMain.handle('desktop:save-image', (event, bytes, name, format) => handleSaveImage(event, bytes, name, format));

ipcMain.handle('desktop:pick-export-dir', async event => {
    const en = currentPrefs.language === 'en';
    if (!trustedSender(event)) throw new Error(en ? 'Invalid export request' : '无效的导出请求');
    if (saveDialogOpen) throw new Error(en ? 'Please complete the current save first' : '请先完成当前图片的保存');
    saveDialogOpen = true;
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: en ? 'Choose Export Folder' : '选择批量导出文件夹',
            defaultPath: app.getPath('downloads'),
            properties: ['openDirectory', 'createDirectory'],
        });
        if (canceled || !filePaths.length) {
            activeExportDir = null;
            return false;
        }
        activeExportDir = filePaths[0];
        return true;
    } finally { saveDialogOpen = false; }
});

ipcMain.handle('desktop:save-batch-image', async (event, bytes, name, format = 'png') => {
    const en = currentPrefs.language === 'en';
    if (!trustedSender(event) || !activeExportDir) throw new Error(en ? 'No export folder selected' : '未选择导出文件夹');
    const resolvedFormat = format === 'jpeg' ? 'jpeg' : 'png';
    const { data, filename } = imagePayload(bytes, name, resolvedFormat);
    await writeFile(join(activeExportDir, filename), data);
    return true;
});

ipcMain.handle('desktop:end-batch-export', event => {
    if (!trustedSender(event)) return;
    activeExportDir = null;
});

function showAboutDialog() {
    const en = currentPrefs.language === 'en';
    void dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: app.name,
        message: app.name,
        detail: en
            ? `Version ${app.getVersion()} · ${platformLabel()}\nOn-device Photo Enhancement & Art Style Studio\nPhotos, AI models, and workspace stay on your device.`
            : `版本 ${app.getVersion()} · ${platformLabel()}\n本机照片清晰化与艺术风格编辑器\n照片、模型与工作区均保存在本机。`,
    });
}

function installMenu() {
    const en = currentPrefs.language === 'en';
    const isMac = process.platform === 'darwin';
    const command = name => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:command', name); };

    const appMenu = {
        label: app.name,
        submenu: [
            { label: en ? `About ${app.name}` : `关于 ${app.name}`, click: showAboutDialog },
            { type: 'separator' },
            { role: 'services', label: en ? 'Services' : '服务' },
            { type: 'separator' },
            { role: 'hide', label: en ? `Hide ${app.name}` : `隐藏 ${app.name}` },
            { role: 'hideOthers', label: en ? 'Hide Others' : '隐藏其他' },
            { role: 'unhide', label: en ? 'Show All' : '显示全部' },
            { type: 'separator' },
            { role: 'quit', label: en ? `Quit ${app.name}` : `退出 ${app.name}` },
        ],
    };

    const fileMenu = {
        label: en ? 'File' : '文件',
        submenu: [
            { id: 'import-image', label: en ? 'Import Photo…' : '导入图片…', accelerator: 'CmdOrCtrl+O', click: () => command('import') },
            { id: 'export-png', label: en ? 'Export HD PNG…' : '导出高清 PNG…', accelerator: 'CmdOrCtrl+Shift+S', click: () => command('export') },
            { type: 'separator' },
            isMac
                ? { role: 'close', label: en ? 'Close Window' : '关闭窗口' }
                : { role: 'quit', label: en ? 'Exit' : '退出' },
        ],
    };

    const editMenu = {
        label: en ? 'Edit' : '编辑',
        submenu: [
            { id: 'editor-undo', label: en ? 'Undo' : '撤销', accelerator: 'CmdOrCtrl+Z', click: () => command('undo') },
            { id: 'editor-redo', label: en ? 'Redo' : '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => command('redo') },
            { type: 'separator' },
            { role: 'cut', label: en ? 'Cut' : '剪切' },
            { role: 'copy', label: en ? 'Copy' : '复制' },
            { role: 'paste', label: en ? 'Paste' : '粘贴' },
            { role: 'selectAll', label: en ? 'Select All' : '全选' },
        ],
    };

    const viewMenu = {
        label: en ? 'View' : '显示',
        submenu: [
            { role: 'resetZoom', label: en ? 'Actual Size' : '实际大小' },
            { role: 'zoomIn', label: en ? 'Zoom In' : '放大界面' },
            { role: 'zoomOut', label: en ? 'Zoom Out' : '缩小界面' },
            { type: 'separator' },
            { role: 'togglefullscreen', label: en ? 'Toggle Full Screen' : '进入全屏' },
            ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools', label: en ? 'Developer Tools' : '开发者工具' }] : []),
        ],
    };

    const windowMenu = { role: 'windowMenu', label: en ? 'Window' : '窗口' };

    const helpMenu = {
        label: en ? 'Help' : '帮助',
        submenu: [
            { label: en ? `About ${app.name}` : `关于 ${app.name}`, click: showAboutDialog },
        ],
    };

    Menu.setApplicationMenu(
        Menu.buildFromTemplate(
            isMac
                ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu]
                : [fileMenu, editMenu, viewMenu, windowMenu, helpMenu],
        ),
    );
}

async function createWindow() {
    let saved = {};
    try { saved = JSON.parse(await readFile(windowStateFile(), 'utf8')); } catch { /* First launch. */ }
    const area = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.max(900, Math.min(Number(saved.width) || 1320, area.width));
    const height = Math.max(650, Math.min(Number(saved.height) || 900, area.height));
    const winIcon = process.platform === 'win32'
        ? join(here, 'assets', 'icon.ico')
        : process.platform !== 'darwin'
          ? join(here, 'assets', 'icon.png')
          : undefined;
    const win = new BrowserWindow({
        width, height, minWidth: 900, minHeight: 650, show: false,
        title: app.name, backgroundColor: windowBackground(), autoHideMenuBar: false,
        ...(winIcon ? { icon: winIcon } : {}),
        ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 35 } } : {}),
        webPreferences: {
            preload: join(here, 'preload.cjs'), nodeIntegration: false,
            contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
            spellcheck: false, navigateOnDragDrop: false,
        },
    });
    mainWindow = win;
    const syncAppearance = () => { if (!win.isDestroyed()) win.setBackgroundColor(windowBackground()); };
    nativeTheme.on('updated', syncAppearance);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit') return;
        const en = currentPrefs.language === 'en';
        void dialog.showMessageBox(win, {
            type: 'error',
            message: en ? 'Editor Stopped Unexpectedly' : '编辑器意外停止',
            detail: en ? 'Please reopen the application. Your saved workspace will be restored automatically.' : '请重新打开软件。已保存的工作区会自动恢复。',
        });
    });
    win.once('ready-to-show', () => { if (saved.maximized) win.maximize(); win.show(); });
    win.on('close', event => {
        if (win.closeAllowed || win.webContents.isCrashed() || win.webContents.isLoadingMainFrame()) return;
        event.preventDefault();
        if (saveDialogOpen || [...closeRequests.values()].some(item => item.win === win)) return;
        const token = randomUUID();
        const timer = setTimeout(() => {
            closeRequests.delete(token);
            void closeFailure(win, currentPrefs.language === 'en' ? 'Editor timed out while saving workspace.' : '编辑器暂时无法完成保存。');
        }, 15000);
        closeRequests.set(token, { win, timer });
        win.webContents.send('desktop:before-close', token);
    });
    win.on('closed', () => {
        nativeTheme.removeListener('updated', syncAppearance);
        for (const [token, pending] of closeRequests) if (pending.win === win) { clearTimeout(pending.timer); closeRequests.delete(token); }
        if (mainWindow === win) mainWindow = null;
        if (quitting) app.quit();
    });
    let stateTimer;
    const saveState = () => {
        clearTimeout(stateTimer);
        const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
        stateTimer = setTimeout(() => { void writeFile(windowStateFile(), JSON.stringify(state)).catch(() => {}); }, 200);
    };
    win.on('resize', saveState);
    win.on('maximize', saveState);
    win.on('unmaximize', saveState);
    await win.loadURL(APP_URL);
}

function ensureWindow() {
    if (creatingWindow) return creatingWindow;
    if (mainWindow && !mainWindow.isDestroyed()) { focusWindow(); return Promise.resolve(); }
    creatingWindow = createWindow().finally(() => { creatingWindow = null; });
    return creatingWindow;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', (_event, argv) => {
        for (const path of imageArguments(argv.slice(app.isPackaged ? 1 : 2))) queueImage(path);
        if (desktopReady) void ensureWindow().catch(error => dialog.showErrorBox('无法打开编辑器', error.message));
    });
    app.on('before-quit', () => { quitting = true; });
    app.on('window-all-closed', () => { if (process.platform !== 'darwin' || quitting) app.quit(); });
    app.whenReady().then(async () => {
        await mkdir(app.getPath('userData'), { recursive: true });
        protocol.handle('pixel-toon', createAssetHandler(join(here, '..', 'dist')));
        session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        session.defaultSession.setPermissionCheckHandler(() => false);
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            const local = isAppUrl(details.url) || details.url.startsWith('blob:pixel-toon://studio/') || details.url.startsWith('data:');
            callback({ cancel: !local });
        });
        installMenu();
        desktopReady = true;
        await ensureWindow();
        app.on('activate', () => { void ensureWindow().catch(error => dialog.showErrorBox('无法打开编辑器', error.message)); });
    }).catch(error => { dialog.showErrorBox('Pixel & Toon Studio 启动失败', error.message); app.exit(1); });
}
