import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ORIGIN, createAssetHandler, isAppUrl, pngPayload } from '../desktop/local-assets.mjs';

describe('desktop local origin', () => {
    it('serves bundled modules, model query URLs and WASM, but rejects traversal, symlinks and old APIs', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'pixel-desktop-assets-'));
        const root = join(directory, 'dist');
        await mkdir(join(root, 'models'), { recursive: true });
        try {
            await writeFile(join(root, 'index.html'), '<title>Desktop</title>');
            await writeFile(join(root, 'runtime.wasm'), 'wasm');
            await writeFile(join(root, 'models', 'model.onnx'), 'weights');
            await writeFile(join(directory, 'private.txt'), 'secret');
            await symlink(join(directory, 'private.txt'), join(root, 'escape.txt'));
            const handle = createAssetHandler(root);
            const request = (path: string, method = 'GET') => handle({ url: `${APP_ORIGIN}${path}`, method });
            const page = await request('/');
            expect(await page.text()).toContain('Desktop');
            expect(page.headers.get('Content-Security-Policy')).toContain("connect-src 'self'");
            expect((await request('/runtime.wasm')).headers.get('Content-Type')).toBe('application/wasm');
            expect(await (await request('/models/model.onnx?sha256=abc')).text()).toBe('weights');
            for (const path of ['/escape.txt', '/%2e%2e%2fprivate.txt', '/..%5cprivate.txt', '/api/enhance/health', '/missing.js']) expect((await request(path)).status).toBe(404);
            expect((await request('/index.html', 'POST')).status).toBe(405);
            expect(await (await request('/index.html', 'HEAD')).text()).toBe('');
            expect((await handle({ url: 'pixel-toon://other/index.html', method: 'GET' })).status).toBe(404);
        } finally { await rm(directory, { recursive: true, force: true }); }
    });

    it('accepts only the local origin and valid PNG payloads', () => {
        expect(isAppUrl(`${APP_ORIGIN}/index.html`)).toBe(true);
        for (const url of ['https://studio/index.html', 'pixel-toon://studio.evil/index.html', 'pixel-toon://attacker@studio/', 'file:///etc/passwd']) expect(isAppUrl(url)).toBe(false);
        expect(() => pngPayload(new Uint8Array([1, 2]), 'test')).toThrow();
        expect(() => pngPayload(new Uint8Array(30), 'test')).toThrow();
        const bytes = new Uint8Array(30); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
        const png = pngPayload(bytes, '../../test.png');
        expect(png.filename).toBe('.._.._test.png');
        expect(png.data.length).toBe(30);
    });
});
