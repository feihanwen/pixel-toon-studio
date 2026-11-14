import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const APP_ORIGIN = 'pixel-toon://studio';
export const APP_URL = `${APP_ORIGIN}/index.html`;
export const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export function isAppUrl(value) {
    try { const url = new URL(value); return url.protocol === 'pixel-toon:' && url.host === 'studio' && !url.username && !url.password; }
    catch { return false; }
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.onnx': 'application/octet-stream', '.png': 'image/png' };

// A stable, secure origin gives WebGPU, module Workers and IndexedDB the same
// behavior as the web build, without opening a local HTTP server or file://.
export function createAssetHandler(root) {
    return async request => {
        const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer' };
        if (!isAppUrl(request.url)) return new Response('Not found', { status: 404, headers });
        if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
        try {
            const pathname = decodeURIComponent(new URL(request.url).pathname);
            if (pathname.includes('\\') || pathname.includes('\0') || pathname === '/api' || pathname.startsWith('/api/')) throw new Error('Invalid path');
            const realRoot = await realpath(root);
            const file = await realpath(resolve(realRoot, `.${pathname === '/' ? '/index.html' : pathname}`));
            if (!file.startsWith(realRoot + sep)) throw new Error('Invalid path');
            const data = await readFile(file);
            return new Response(request.method === 'HEAD' ? null : data, { headers: { ...headers, 'Content-Type': types[extname(file)] ?? 'application/octet-stream' } });
        } catch { return new Response('Not found', { status: 404, headers }); }
    };
}

export function pngPayload(bytes, name) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 24 || bytes.byteLength > 256 * 1024 * 1024) throw new Error('PNG 文件大小无效');
    const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('只能保存 PNG 图片');
    const base = String(name ?? 'image').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.png$/i, '').slice(0, 150) || 'image';
    return { data, filename: `${base}.png` };
}
