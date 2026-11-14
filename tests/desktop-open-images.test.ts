import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageArguments, OpenImageQueue } from '../desktop/open-images.mjs';

describe('external desktop images', () => {
    it('filters command-line options and accepts absolute image paths with spaces, Unicode and uppercase extensions', () => {
        expect(imageArguments(['/Applications/App.app', '--inspect', '--pixel-toon-profile=/tmp/profile', '/tmp/我的 照片.HEIC', '/tmp/image.JPEG', 'relative.png', '/tmp/private.txt']))
            .toEqual(['/tmp/我的 照片.HEIC', '/tmp/image.JPEG']);
    });

    it('queues startup files in order, deduplicates pending paths and allows deliberate reopening', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'pixel-open-images-'));
        try {
            const paths = [join(directory, '我的 照片.PNG'), join(directory, 'photo.heif')];
            await writeFile(paths[0], new Uint8Array([1, 2, 3]));
            await writeFile(paths[1], new Uint8Array([4, 5]));
            const queue = new OpenImageQueue();
            expect(queue.add(paths[0])).toBe(true);
            expect(queue.add(paths[0])).toBe(false);
            expect(queue.add(paths[1])).toBe(true);
            expect(queue.add('relative.png')).toBe(false);
            const first = await queue.next();
            expect(first.name).toBe('我的 照片.PNG');
            expect(first.type).toBe('image/png');
            expect([...first.bytes]).toEqual([1, 2, 3]);
            expect((await queue.next()).type).toBe('image/heif');
            expect(await queue.next()).toBeNull();
            expect(queue.add(paths[0])).toBe(true);
            expect((await queue.next()).name).toBe('我的 照片.PNG');
        } finally { await rm(directory, { recursive: true, force: true }); }
    });

    it('returns useful errors for missing, unsupported, directory and oversized inputs, then continues', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'pixel-open-errors-'));
        try {
            const queue = new OpenImageQueue();
            await mkdir(join(directory, 'folder.png'));
            const large = await open(join(directory, 'large.png'), 'w');
            await large.truncate(128 * 1024 * 1024 + 1); await large.close();
            for (const name of ['missing.jpg', 'private.txt', 'folder.png', 'large.png']) queue.add(join(directory, name));
            expect((await queue.next()).error).toContain('文件不存在');
            expect((await queue.next()).error).toContain('仅支持');
            expect((await queue.next()).error).toContain('请选择图片文件');
            expect((await queue.next()).error).toContain('128 MB');
            expect(await queue.next()).toBeNull();
        } finally { await rm(directory, { recursive: true, force: true }); }
    });
});
