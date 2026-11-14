import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, screen, nativeTheme } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { APP_URL, createAssetHandler, isAppUrl, pngPayload } from './local-assets.mjs';
import { OpenImageQueue, imageArguments } from './open-images.mjs';

const here = dirname(fileURLToPath(import.meta.url));
app.setName('Pixel & Toon Studio');
// Keep native menus, dialogs and CSS media queries aligned with macOS appearance.
nativeTheme.themeSource = 'system';
const windowBackground = () => nativeTheme.shouldUseDarkColors ? '#182b43' : '#dce7f2';
// A separate profile is also useful for a portable local test installation.
// Normal Finder launches always use the standard Application Support location.
const profileArg = process.argv.find(arg => arg.startsWith('--pixel-toon-profile='));
if (profileArg) app.setPath('userData', profileArg.slice('--pixel-toon-profile='.length));

protocol.registerSchemesAsPrivileged([{ scheme: 'pixel-toon', privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true,
} }]);

let mainWindow, quitting = false, saveDialogOpen = false;
let creatingWindow;
let desktopReady = false;
const openImages = new OpenImageQueue();

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
        void ensureWindow().catch(error => dialog.showErrorBox('无法打开图片', error.message));
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

async function closeFailure(win, message) {
    if (win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
        type: 'warning', title: '工作区尚未保存', message,
        detail: '返回编辑器后可以重试保存或导出图片。直接关闭可能丢失最新编辑。',
        buttons: ['返回编辑器', '直接关闭'], defaultId: 0, cancelId: 0,
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

ipcMain.handle('desktop:save-png', async (event, bytes, name) => {
    if (!trustedSender(event)) throw new Error('无效的保存请求');
    if (saveDialogOpen) throw new Error('请先完成当前图片的保存');
    const { data, filename } = pngPayload(bytes, name);
    saveDialogOpen = true;
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: '保存 PNG 图片', defaultPath: join(app.getPath('downloads'), filename),
            filters: [{ name: 'PNG 图片', extensions: ['png'] }],
            properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (canceled || !filePath) return false;
        await writeFile(filePath, data);
        return true;
    } finally { saveDialogOpen = false; }
});

function installMenu() {
    const command = name => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:command', name); };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label: app.name, submenu: [
            { label: '关于 Pixel & Toon Studio', click: () => dialog.showMessageBox(mainWindow, {
                type: 'info', title: app.name, message: app.name,
                detail: `版本 ${app.getVersion()} · Apple Silicon\n本机照片清晰化与艺术风格编辑器\n照片、模型与工作区均保存在本机。`,
            }) },
            { type: 'separator' }, { role: 'services', label: '服务' }, { type: 'separator' },
            { role: 'hide', label: '隐藏 Pixel & Toon Studio' }, { role: 'hideOthers', label: '隐藏其他' },
            { role: 'unhide', label: '显示全部' }, { type: 'separator' }, { role: 'quit', label: '退出 Pixel & Toon Studio' },
        ] },
        { label: '文件', submenu: [
            { id: 'import-image', label: '导入图片…', accelerator: 'CmdOrCtrl+O', click: () => command('import') },
            { id: 'export-png', label: '导出高清 PNG…', accelerator: 'CmdOrCtrl+Shift+S', click: () => command('export') },
            { type: 'separator' }, { role: 'close', label: '关闭窗口' },
        ] },
        { label: '编辑', submenu: [
            { id: 'editor-undo', label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => command('undo') },
            { id: 'editor-redo', label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => command('redo') },
            { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
            { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
        ] },
        { label: '显示', submenu: [
            { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大界面' },
            { role: 'zoomOut', label: '缩小界面' }, { type: 'separator' }, { role: 'togglefullscreen', label: '进入全屏' },
            ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools', label: '开发者工具' }] : []),
        ] },
        { role: 'windowMenu', label: '窗口' },
    ]));
}

async function createWindow() {
    let saved = {};
    try { saved = JSON.parse(await readFile(windowStateFile(), 'utf8')); } catch { /* First launch. */ }
    const area = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.max(900, Math.min(Number(saved.width) || 1320, area.width));
    const height = Math.max(650, Math.min(Number(saved.height) || 900, area.height));
    const win = new BrowserWindow({
        width, height, minWidth: 900, minHeight: 650, show: false,
        title: app.name, backgroundColor: windowBackground(), autoHideMenuBar: false,
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
        void dialog.showMessageBox(win, { type: 'error', message: '编辑器意外停止', detail: '请重新打开软件。已保存的工作区会自动恢复。' });
    });
    win.once('ready-to-show', () => { if (saved.maximized) win.maximize(); win.show(); });
    win.on('close', event => {
        if (win.closeAllowed || win.webContents.isCrashed() || win.webContents.isLoadingMainFrame()) return;
        event.preventDefault();
        if (saveDialogOpen || [...closeRequests.values()].some(item => item.win === win)) return;
        const token = randomUUID();
        const timer = setTimeout(() => {
            closeRequests.delete(token);
            void closeFailure(win, '编辑器暂时无法完成保存。');
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
