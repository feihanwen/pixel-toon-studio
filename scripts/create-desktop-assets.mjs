// Optional regeneration tool. The generated PNG, ICNS and ICO are checked in, so
// normal desktop builds need neither Chrome nor an image-generation service.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

export function buildIcoFromPngs(entries) {
    const count = entries.length;
    const headerSize = 6 + count * 16;
    let offset = headerSize;
    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(count, 4);
    const buffers = [header];

    entries.forEach(({ size, bytes }, idx) => {
        const entryOffset = 6 + idx * 16;
        header.writeUInt8(size >= 256 ? 0 : size, entryOffset);
        header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
        header.writeUInt8(0, entryOffset + 2);
        header.writeUInt8(0, entryOffset + 3);
        header.writeUInt16LE(1, entryOffset + 4);
        header.writeUInt16LE(32, entryOffset + 6);
        header.writeUInt32LE(bytes.length, entryOffset + 8);
        header.writeUInt32LE(offset, entryOffset + 12);
        offset += bytes.length;
        buffers.push(bytes);
    });

    return Buffer.concat(buffers);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const assets = resolve('desktop/assets');
    const iconset = join(assets, 'icon.iconset');
    await mkdir(iconset, { recursive: true });
    const browser = await chromium.launch({
        executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
        headless: true,
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
        const svgContent = await readFile(join(assets, 'icon.svg'), 'utf8');
        await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100vw;height:100vh;display:block}</style>${svgContent}`);
        await page.screenshot({ path: join(assets, 'icon.png'), omitBackground: true });

        const icoSizes = [16, 32, 48, 64, 128, 256];
        const icoEntries = [];
        for (const size of icoSizes) {
            await page.setViewportSize({ width: size, height: size });
            const bytes = await page.screenshot({ omitBackground: true });
            icoEntries.push({ size, bytes });
        }
        await writeFile(join(assets, 'icon.ico'), buildIcoFromPngs(icoEntries));

        if (process.platform === 'darwin') {
            for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
                execFileSync('sips', ['-z', String(size * scale), String(size * scale), join(assets, 'icon.png'), '--out', join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], { stdio: 'ignore' });
            }
            execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(assets, 'icon.icns')]);
        }

        await page.setViewportSize({ width: 660, height: 420 });
        await page.setContent(`<style>
            *{box-sizing:border-box}body{margin:0;width:660px;height:420px;background:radial-gradient(ellipse at 50% 20%,#2a2c31,#151719 75%);color:#f2eee8;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding-top:42px}
            h1{font-size:24px;font-weight:600;letter-spacing:1px;margin:0 0 9px}p{font-size:12px;color:#c1b2a0;margin:0}.arrow{position:absolute;top:177px;left:303px;font-size:40px;color:#dba871;font-weight:200}.note{position:absolute;bottom:34px;width:100%;left:0;font-size:11px;letter-spacing:2px;color:#8f9492}.line{position:absolute;bottom:68px;left:250px;width:160px;height:1px;background:#dba87144}
            </style><h1>Pixel &amp; Toon Studio</h1><p>将左侧图标拖入右侧「应用程序」，即可安装</p><div class="arrow">⟶</div><div class="line"></div><div class="note">本机创作 · 照片留在你的设备</div>`);
        await page.screenshot({ path: join(assets, 'dmg-background.png') });
    } finally {
        await browser.close();
        await rm(iconset, { recursive: true, force: true });
    }
    console.log('Created desktop icon (.png, .icns, .ico) and DMG background.');
}
