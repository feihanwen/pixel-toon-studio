// Static local app hosting only. There is no remote-model API or forwarding path.
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export function createStaticHandler({ root = resolve('dist') } = {}) {
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        try {
            const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            // Removed APIs stay unavailable for all methods, including health checks.
            if (path === '/api' || path.startsWith('/api/')) { res.writeHead(404).end('Not found'); return; }
            if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
            const realRoot = await realpath(root), file = await realpath(resolve(realRoot, `.${path === '/' ? '/index.html' : path}`));
            if (!file.startsWith(realRoot + sep)) throw new Error('Invalid path');
            const data = await readFile(file);
            const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.onnx': 'application/octet-stream', '.png': 'image/png' };
            res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
            if (/\.[\w-]{8,}\.(?:js|mjs|css|wasm)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.end(req.method === 'HEAD' ? undefined : data);
        } catch { res.writeHead(404).end('Not found'); }
    };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 8787);
    http.createServer(createStaticHandler()).listen(port, host, () => console.log(`Pixel & Toon: http://${host}:${port}`));
}
