import { open } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';

const imageTypes = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif',
};
const MAX_FILE_BYTES = 128 * 1024 * 1024;

export function imageArguments(argv) {
    return argv.filter(value => typeof value === 'string' && isAbsolute(value) && imageTypes[extname(value).toLowerCase()]);
}

// Only paths received from the OS enter this queue. The renderer cannot supply
// arbitrary paths; it can only consume the next user-selected image.
export class OpenImageQueue {
    paths = [];
    pending = new Set();

    add(path) {
        if (typeof path !== 'string' || !isAbsolute(path) || this.pending.has(path)) return false;
        this.pending.add(path);
        this.paths.push(path);
        return true;
    }

    async next() {
        const path = this.paths.shift();
        if (!path) return null;
        const name = basename(path), type = imageTypes[extname(path).toLowerCase()];
        let handle;
        try {
            if (!type) throw new Error('仅支持 HEIC、HEIF、PNG、JPEG 和 WebP 图片');
            handle = await open(path, 'r');
            const info = await handle.stat();
            if (!info.isFile()) throw new Error('请选择图片文件');
            if (info.size > MAX_FILE_BYTES) throw new Error('图片文件超过 128 MB，请缩小后导入');
            const bytes = await handle.readFile();
            if (bytes.length > MAX_FILE_BYTES) throw new Error('图片文件超过 128 MB，请缩小后导入');
            return { name, type, bytes };
        } catch (error) {
            return { error: `${name}：${error.code === 'ENOENT' ? '文件不存在或已被移动' : error.code === 'EACCES' || error.code === 'EPERM' ? '没有读取权限，请检查文件权限后重试' : error.message}` };
        } finally {
            this.pending.delete(path);
            await handle?.close();
        }
    }
}
