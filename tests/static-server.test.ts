import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticHandler } from '../server/static.mjs';

async function request(root: string, path: string, method = 'GET') {
    const res = { status: 200, body: '', headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value; },
        writeHead(status: number) { this.status = status; return this; },
        end(data?: Buffer | string) { this.body = data?.toString() ?? ''; },
    };
    await createStaticHandler({ root })({ url: path, method }, res);
    return res;
}
describe('local app static hosting', () => {
    it('serves the editor and rejects all former API endpoints without forwarding', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixel-static-'));
        const fetcher = vi.spyOn(globalThis, 'fetch');
        try {
            await writeFile(join(root, 'index.html'), '<title>Local editor</title>');
            const page = await request(root, '/'); expect(page.status).toBe(200); expect(page.body).toContain('Local editor');
            expect(page.headers['Content-Security-Policy']).toContain("connect-src 'self';");
            for (const path of ['/api/enhance/health', '/api/enhance/request', '/api/enhance/image']) {
                for (const method of ['GET', 'POST']) expect((await request(root, path, method)).status).toBe(404);
            }
            expect(fetcher).not.toHaveBeenCalled();
            expect((await request(root, '/index.html', 'POST')).status).toBe(405);
            expect((await request(root, '/%2e%2e%2fsecret')).status).toBe(404);
            expect((await request(root, '/index.html', 'HEAD')).body).toBe('');
        } finally { fetcher.mockRestore(); await rm(root, { recursive: true, force: true }); }
    });
});
