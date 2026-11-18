// Exercise the same production editor in Chrome and the packaged Mac app.
import assert from 'node:assert/strict';
import { chromium, _electron as electron } from 'playwright';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const desktop = !!process.env.DESKTOP_EXECUTABLE;
const output = resolve(process.env.QA_OUTPUT || await mkdtemp(join(tmpdir(), 'pixel-toon-qa-')));
await mkdir(output, { recursive: true });
const errors = [], requests = [], report = [];
const record = value => { report.push(value); console.log(`PASS ${value}`); };
let app, browser, context, page;
const fixture = resolve('tests/fixtures/heic/example.heic');
const bytes = await readFile(fixture);
const payload = bytes.toString('base64');
const idle = async () => {
    await page.waitForFunction(() => document.querySelector('.stage-canvas')?.width > 0 && !document.querySelector('.stage-processing') && !document.querySelector('.loading-stage'));
};
const saved = () => page.getByText('已保存到本机', { exact: true }).waitFor();
try {
    if (desktop) {
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        const profile = await mkdtemp(join(tmpdir(), 'pixel-toon-update-'));
        app = await electron.launch({ executablePath: process.env.DESKTOP_EXECUTABLE, args: [`--pixel-toon-profile=${profile}`], env });
        page = await app.firstWindow();
        await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: globalThis.__qaOutput }); });
        await app.evaluate((_electron, output) => { globalThis.__qaOutput = output; }, join(output, 'heic-export.png'));
    } else {
        const chromePath = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
        browser = await chromium.launch({ ...(chromePath ? { executablePath: chromePath } : {}), headless: true });
        context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
        page = await context.newPage();
        await page.goto(process.env.QA_URL || 'http://127.0.0.1:8787');
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    const fileInput = page.locator('input[type=file]');
    assert.match(await fileInput.getAttribute('accept'), /\.heic/);
    await fileInput.setInputFiles(fixture);
    await page.locator('.work-heading h1').filter({ hasText: 'example' }).waitFor(); await idle();
    assert.match(await page.locator('.work-heading p').innerText(), /1280 × 854/);
    record('real HEIC file imports at 1280 × 854 using the locally bundled CSP-compatible decoder');
    const sections = page.locator('.controls > .control-section');
    assert.match(await sections.first().innerText(), /^视觉风格/);
    assert.equal(await sections.first().evaluate(element => element.tagName), 'SECTION');
    assert.equal(await page.locator('.controls > details.control-section').count(), 5);
    assert.equal(await page.locator('.controls > details.control-section[open]').count(), 0);
    assert.equal(await page.locator('.stage-view-controls').count(), 0);
    assert.equal(await page.locator('.stage-view-actions button').count(), 2);
    assert.equal(await page.getByRole('button', { name: '优化后底图', exact: true }).count(), 0);
    for (const summary of await page.locator('.controls > details.control-section > summary').all()) {
        await summary.focus(); await summary.press('Space');
        assert.equal(await summary.evaluate(element => element.parentElement.open), true);
        await summary.press('Space');
        assert.equal(await summary.evaluate(element => element.parentElement.open), false);
    }
    record('visual style stays first and expanded; all five adjustment panels collapse with keyboard; two bottom-left view buttons replace old switcher');
    await page.locator('.global-adjustments > summary').click();
    const brightness = page.getByRole('slider', { name: '亮度', exact: true });
    await brightness.focus(); await brightness.press('ArrowRight'); await brightness.press('Tab');
    await page.locator('.global-adjustments > summary').click(); await page.locator('.global-adjustments > summary').click();
    assert.equal(await brightness.inputValue(), '1');
    await page.getByRole('button', { name: '↶ 撤销', exact: true }).click(); assert.equal(await brightness.inputValue(), '0');
    await page.getByRole('button', { name: '↷ 重做', exact: true }).click(); assert.equal(await brightness.inputValue(), '1');
    await page.locator('.global-adjustments > summary').click();
    await page.locator('.auto-color-panel > summary').click();
    await page.getByRole('checkbox', { name: '优化底图光色', exact: true }).check(); await idle();
    assert.equal(await page.locator('.stage-view-actions button').count(), 2);
    await page.locator('.auto-color-panel > summary').click();
    record('collapsed settings preserve values, undo/redo works, smart color does not restore the deleted preview');
    await page.locator('.frame-panel > summary').click();
    await page.getByRole('checkbox', { name: /添加相纸边框/ }).check();
    await page.getByRole('button', { name: '浏览并选择文案', exact: true }).click();
    assert.equal(await page.getByRole('option').count(), 48);
    assert.equal(await page.getByRole('option').filter({ hasText: '这一天，刚好有光' }).count(), 0);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    assert.equal(await page.getByRole('option').count(), 16);
    await page.getByRole('option').filter({ hasText: 'Life lately.' }).click();
    await page.getByRole('button', { name: '使用这句', exact: true }).click();
    assert.equal(await page.locator('.caption-box > p').innerText(), 'Life lately.');
    await page.getByRole('checkbox', { name: /添加相纸边框/ }).uncheck();
    await page.locator('.frame-panel > summary').click(); await idle();
    record('48 sourced social captions replace the old library; bilingual filters and frame selection work');
    if (desktop) {
        await page.getByRole('button', { name: /导出高清 PNG/ }).click();
        await page.getByText('PNG 已保存到所选位置', { exact: true }).waitFor();
    } else {
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /导出高清 PNG/ }).click()]);
        await download.saveAs(join(output, 'heic-export.png'));
    }
    const png = await readFile(join(output, 'heic-export.png'));
    assert.equal(png.readUInt32BE(16), 1280); assert.equal(png.readUInt32BE(20), 854);
    await saved(); await page.reload(); await idle();
    if (desktop) await app.evaluate(({ session }) => session.defaultSession.enableNetworkEmulation({ offline: true }));
    else { await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller); await context.setOffline(true); }
    await page.reload(); await idle();
    // File chooser with missing MIME, then drag and paste via actual DOM events.
    await fileInput.setInputFiles({ name: 'UPPERCASE.HEIC', mimeType: '', buffer: bytes });
    await page.locator('.work-heading h1').filter({ hasText: 'UPPERCASE' }).waitFor(); await idle();
    const eventImport = async (kind, name) => page.evaluate(({ kind, name, payload }) => {
        const file = new File([Uint8Array.from(atob(payload), char => char.charCodeAt(0))], name, { type: 'application/octet-stream' });
        const data = new DataTransfer(); data.items.add(file);
        if (kind === 'drop') window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
        else window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, { kind, name, payload });
    await eventImport('drop', 'dropped.heif');
    await page.locator('.work-heading h1').filter({ hasText: 'dropped' }).waitFor(); await idle();
    await eventImport('paste', 'pasted.heic');
    await page.locator('.work-heading h1').filter({ hasText: 'pasted' }).waitFor(); await idle();
    assert.equal(await page.locator('.tab-main').count(), 4);
    record('HEIC PNG export, persisted reload, and offline imports via extension-only chooser, drag and paste all succeed');
    await fileInput.setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: Buffer.from('not a real HEIC') });
    await page.getByRole('status').filter({ hasText: '无法读取 HEIC' }).waitFor();
    assert.equal(await page.locator('.tab-main').count(), 4);
    assert.match(await page.locator('.work-heading h1').innerText(), /pasted/);
    await page.screenshot({ path: join(output, 'editor.png') });
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter(url => /^https?:/.test(url) && (desktop || !url.startsWith(process.env.QA_URL || 'http://127.0.0.1:8787'))), []);
    record('corrupt HEIC produces a readable error without losing the current photo; no renderer errors or external requests');
} catch (error) {
    await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await writeFile(join(output, 'report.json'), JSON.stringify({ desktop, report, errors }, null, 2));
    if (app) await app.close(); if (browser) await browser.close();
}
