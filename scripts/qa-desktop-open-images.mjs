import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const directory = await mkdtemp(join(tmpdir(), 'pixel-open-qa-'));
const profile = join(directory, 'profile');
const first = join(directory, '我的 照片.PNG');
const second = resolve('tests/fixtures/local-v2/low/chelsea-bicubic.png');
await copyFile(resolve('tests/fixtures/local-v2/low/astronaut-bicubic.png'), first);
await writeFile(join(directory, 'broken.png'), 'not an image');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DESKTOP_EXECUTABLE || electronPath;
let app, page;
const errors = [], report = [];
const record = message => { report.push(message); console.log(`PASS ${message}`); };
const launch = async files => {
    app = await electron.launch({ executablePath, args: [...(process.env.DESKTOP_EXECUTABLE ? [] : ['.']), `--pixel-toon-profile=${profile}`, ...files], env, timeout: 45000 });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
};
const countTabs = count => page.waitForFunction(expected => document.querySelectorAll('.tab').length === expected, count);
const openFiles = paths => app.evaluate(({ app }, files) => {
    for (const file of files) app.emit('open-file', { preventDefault() {} }, file);
}, paths);
const saved = () => page.locator('.save-status').filter({ hasText: '已保存到本机' }).waitFor();

try {
    await launch([first]);
    await countTabs(1);
    await page.locator('.stage-canvas').first().waitFor();
    assert.equal(await page.locator('.tab-name').innerText(), '我的 照片.PNG');
    await page.locator('.style-card').nth(3).click();
    await saved();
    record('cold startup consumes queued image with spaces, Unicode and uppercase extension');
    await app.close(); app = null;

    await launch([second]);
    await countTabs(2);
    assert.deepEqual(await page.locator('.tab-name').allTextContents(), ['我的 照片.PNG', 'chelsea-bicubic.png']);
    await page.locator('.tab-main').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.style-card')[3]?.getAttribute('aria-pressed') === 'true');
    record('restoration preserves prior tabs and edits before importing the startup image');

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    await openFiles([resolve('tests/fixtures/local-v2/low/camera-bicubic.png'), resolve('tests/fixtures/heic/example.heic')]);
    await countTabs(4);
    await page.locator('.stage-canvas').first().waitFor();
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), false);
    assert.equal(await page.locator('.tab-name').last().innerText(), 'example.heic');
    record('live open-file events restore the window and import multiple PNG/HEIC images');

    await openFiles([join(directory, 'missing.jpg')]);
    await page.getByRole('status').filter({ hasText: '文件不存在' }).waitFor();
    await openFiles([join(directory, 'broken.png')]);
    await page.getByRole('status').filter({ hasText: '无法解码' }).waitFor();
    await countTabs(4);
    await openFiles([first]);
    await countTabs(5);
    record('missing and corrupt files show errors; subsequent valid files still import');
    await saved();

    const closed = page.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closed;
    const reopened = app.waitForEvent('window');
    await openFiles([second, resolve('tests/fixtures/local-v2/low/camera-bicubic.png')]);
    page = await reopened;
    page.on('pageerror', error => errors.push(error.message));
    await countTabs(7);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    record('opening files after closing the window creates one window and preserves all tabs');
    if (process.env.DESKTOP_EXECUTABLE) {
        const bundle = resolve(executablePath, '../../..');
        await promisify(execFile)('/usr/bin/open', ['-a', bundle, first]);
        await countTabs(8);
        assert.equal(await page.locator('.tab-name').last().innerText(), '我的 照片.PNG');
        record('macOS Launch Services delivers a real Open With request to the packaged app');
    }
    assert.deepEqual(errors, []);
    await saved();
} finally {
    if (app) await app.close();
    await writeFile(join(directory, 'report.json'), JSON.stringify({ report, errors }, null, 2));
    console.log(`QA report: ${join(directory, 'report.json')}`);
}
