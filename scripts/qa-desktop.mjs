import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve(process.env.QA_OUTPUT || await mkdtemp(join(tmpdir(), 'pixel-toon-qa-')));
const profile = process.env.QA_PROFILE || await mkdtemp(join(tmpdir(), 'pixel-toon-desktop-'));
await mkdir(output, { recursive: true });
const packaged = !!process.env.DESKTOP_EXECUTABLE;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const report = [], errors = [];
let app, page;
const record = text => { report.push(text); console.log(`PASS ${text}`); };
const waitSaved = () => page.locator('.save-status').filter({ hasText: '已保存到本机' }).waitFor();
const launch = async () => {
    app = await electron.launch({ executablePath: process.env.DESKTOP_EXECUTABLE || electronPath, args: [...(packaged ? [] : ['.']), `--pixel-toon-profile=${profile}`], env, timeout: 45000 });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => document.querySelector('.save-status')?.textContent !== '正在读取工作区');
    await app.evaluate(({ dialog }) => {
        globalThis.__qaSave = { canceled: false, filePath: '', calls: 0 };
        dialog.showSaveDialog = async (_window, options) => {
            globalThis.__qaSave.calls++;
            globalThis.__qaSave.options = options;
            return { canceled: globalThis.__qaSave.canceled, filePath: globalThis.__qaSave.filePath };
        };
    });
};
const saveTo = path => app.evaluate((_electron, filePath) => { globalThis.__qaSave.filePath = filePath; globalThis.__qaSave.canceled = false; }, path);
const menu = id => app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu().getMenuItemById(itemId).click(), id);
const dimensions = async (file, width = 384, height = 384) => {
    const start = Date.now();
    while (Date.now() - start < 30000) {
        try { const data = await readFile(file); if (data.length > 24) { assert.equal(data.readUInt32BE(16), width); assert.equal(data.readUInt32BE(20), height); return; } }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`PNG not saved: ${file}`);
};
const generate = async () => {
    await page.getByRole('button', { name: /^(生成增强|重新生成)$/ }).click();
    await page.locator('.enhance-status[data-status=succeeded]').waitFor({ timeout: 180000 });
};
try {
    await launch();
    await page.getByRole('button', { name: '选择图片', exact: false }).waitFor();
    assert.equal(page.url(), 'pixel-toon://studio/index.html');
    const capabilities = await page.evaluate(() => ({ secure: isSecureContext, indexedDB: !!indexedDB, caches: !!window.caches, worker: !!window.Worker, node: typeof window.require, bridge: !!window.pixelToonDesktop }));
    assert.equal(capabilities.secure, true); assert.equal(capabilities.node, 'undefined'); assert.equal(capabilities.bridge, true);
    const preferences = await app.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration }; });
    assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
    record(`secure local origin, sandboxed renderer, isolated bridge: ${JSON.stringify(capabilities)}`);
    const appearance = await app.evaluate(({ nativeTheme, BrowserWindow }) => ({
        source: nativeTheme.themeSource,
        background: BrowserWindow.getAllWindows()[0].getBackgroundColor(),
    }));
    assert.equal(appearance.source, 'system');
    if (process.platform === 'darwin') {
        assert.equal(await page.locator('.app').evaluate(el => el.classList.contains('desktop-mac')), true);
        assert.equal(await page.locator('.topbar').evaluate(el => getComputedStyle(el).webkitAppRegion), 'drag');
        assert.equal(await page.locator('.top-import').evaluate(el => getComputedStyle(el).webkitAppRegion), 'no-drag');
    } else if (process.platform === 'win32') {
        assert.equal(await page.locator('.app').evaluate(el => el.classList.contains('desktop-win')), true);
    }
    await page.emulateMedia({ colorScheme: null });
    for (const theme of ['light', 'dark']) {
        await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, theme);
        await page.waitForFunction(value => matchMedia('(prefers-color-scheme: dark)').matches === (value === 'dark'), theme);
        const color = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor());
        assert.equal(color.toLowerCase(), theme === 'dark' ? '#182b43' : '#dce7f2');
        await page.screenshot({ path: join(output, `glass-${theme}.png`), animations: 'disabled' });
    }
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'system'; });
    record('native window and CSS follow appearance; Mac header is draggable and import button remains clickable');
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const chooser = page.waitForEvent('filechooser');
    await menu('import-image');
    await (await chooser).setFiles(resolve('tests/fixtures/local-v2/low/astronaut-bicubic.png'));
    await page.locator('.work-heading h1').filter({ hasText: 'astronaut-bicubic' }).waitFor();
    await page.locator('.stage-canvas').first().waitFor();
    record('native File menu imports a PNG into the shared editor');
    const colorPanel = page.locator('.auto-color-panel');
    assert.equal(await colorPanel.getAttribute('open'), null);
    assert.equal(await colorPanel.locator('.enhance-description, .enhance-help').count(), 0);
    await colorPanel.locator('summary').click();
    const colorToggle = colorPanel.getByRole('checkbox', { name: '优化底图光色', exact: true });
    await colorToggle.check();
    assert.equal(await page.getByRole('button', { name: '优化后底图', exact: true }).count(), 0);
    await colorPanel.locator('summary').click();
    assert.equal(await colorToggle.isVisible(), false);
    await colorPanel.locator('summary').click(); await colorToggle.uncheck(); await colorPanel.locator('summary').click();
    const controls = await page.locator('.stage-zoom-controls').boundingBox();
    const workArea = await page.locator('.work-area').boundingBox();
    assert.ok(Math.abs(controls.y - workArea.y) < 2, 'zoom controls stay at the top');
    record('packaged editor shares the compact glass toolbar and collapsible smart color panel');

    await page.locator('.style-card').nth(3).click();
    await menu('editor-undo');
    await page.waitForFunction(() => document.querySelector('.style-card')?.getAttribute('aria-pressed') === 'true');
    await menu('editor-redo');
    await page.waitForFunction(() => document.querySelectorAll('.style-card')[3]?.getAttribute('aria-pressed') === 'true');
    record('native Undo/Redo menu controls photo edit history');
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.locator('.style-card').nth(2).click();
    await page.keyboard.press(`${mod}+z`);
    await page.waitForFunction(() => document.querySelectorAll('.style-card')[3]?.getAttribute('aria-pressed') === 'true');
    await page.keyboard.press(`${mod}+Shift+z`);
    await page.waitForFunction(() => document.querySelectorAll('.style-card')[2]?.getAttribute('aria-pressed') === 'true');
    await page.locator('.style-card').nth(3).click();
    record('keyboard shortcuts apply exactly one Undo/Redo operation');

    await page.locator('.enhancement-panel > summary').click();
    await generate();
    await page.getByText('LiveAction · 384 × 384', { exact: true }).waitFor();
    await saveTo(join(output, 'liveaction.png'));
    await page.getByRole('button', { name: '下载底图 ↗', exact: true }).click();
    await dimensions(join(output, 'liveaction.png'));
    record('bundled LiveAction model runs on a fresh profile and exports a valid 384×384 PNG');

    await saveTo(join(output, 'styled.png'));
    await menu('export-png');
    await dimensions(join(output, 'styled.png'));
    await page.getByRole('button', { name: /导出高清 PNG/ }).waitFor();
    record('native Export menu saves the full styled PNG through the save-dialog adapter');
    await app.evaluate(() => { globalThis.__qaSave.canceled = true; });
    const dialogCalls = await app.evaluate(() => globalThis.__qaSave.calls);
    await menu('export-png');
    await page.waitForFunction(() => !document.querySelector('.export-button')?.disabled);
    assert.equal(await app.evaluate(() => globalThis.__qaSave.calls), dialogCalls + 1);
    record('canceling the native save dialog returns to the editor without an error');

    await page.getByRole('radio', { name: /颗粒降噪/ }).click();
    await generate();
    await page.getByText('FFDNet · 384 × 384', { exact: true }).waitFor();
    await saveTo(join(output, 'ffdnet.png'));
    await page.getByRole('button', { name: '下载底图 ↗', exact: true }).click();
    await dimensions(join(output, 'ffdnet.png'));
    record('bundled FFDNet model runs and exports through the native adapter');
    await page.screenshot({ path: join(output, 'editor.png') });
    await waitSaved();

    // Deliberately close during the 400ms autosave debounce. The close handshake
    // must save this final style, then restore it on a genuinely new process.
    await page.locator('.style-card').nth(4).click();
    const closing = page.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closing;
    await app.close(); app = null;
    await launch();
    await page.locator('.work-heading h1').filter({ hasText: 'astronaut-bicubic' }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.style-card')[4]?.getAttribute('aria-pressed') === 'true');
    await page.locator('.enhancement-panel > summary').click();
    await page.getByText('FFDNet · 384 × 384', { exact: true }).waitFor();
    record('closing immediately after an edit persists the final style, source and enhancement across process restart');

    // Purge runtime/model caches, then import another source. All bytes must
    // still come from the application bundle, even with the browser offline.
    await app.evaluate(({ session }) => session.defaultSession.enableNetworkEmulation({ offline: true }));
    await page.evaluate(async () => { for (const key of await caches.keys()) await caches.delete(key); });
    await page.locator('input[type=file]').setInputFiles(resolve('tests/fixtures/local-v2/low/chelsea-bicubic.png'));
    await page.locator('.enhancement-panel > summary').click();
    await generate();
    await page.locator('.enhance-status[data-status=succeeded]').waitFor();
    record('cold model/runtime load and a fresh enhancement succeed with network offline');
    await page.screenshot({ path: join(output, 'offline.png') });
    const remote = requests.filter(url => /^https?:/.test(url));
    assert.deepEqual(remote, []); assert.deepEqual(errors, []);
    record('no renderer exceptions or external HTTP requests');
    await writeFile(join(output, 'report.json'), JSON.stringify({ packaged, executable: process.env.DESKTOP_EXECUTABLE || electronPath, profile, report, errors }, null, 2));
} catch (error) {
    if (page && !page.isClosed()) {
        await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
        console.error(await page.locator('body').innerText().catch(() => 'No renderer'));
    }
    throw error;
} finally {
    if (app) await app.close();
    await writeFile(join(output, 'last-run.json'), JSON.stringify({ packaged, report, errors }, null, 2));
}
