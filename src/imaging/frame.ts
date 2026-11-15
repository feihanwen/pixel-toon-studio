import type { ExifFields } from '../types/document';
import { captionText } from '../config/captions';

export interface FrameContent {
    captionId: string;
    showExif: boolean;
    exif: ExifFields | null;
}

export function frameInfo(width: number, height: number, enabled: boolean) {
    if (!enabled) {
        return { width, height, x: 0, y: 0, photoWidth: width, photoHeight: height };
    }
    const short = Math.min(width, height);
    const side = Math.round(short * 0.04);
    const bottom = Math.round(short * 0.16);
    return {
        width: width + side * 2,
        height: height + side + bottom,
        x: side,
        y: side,
        photoWidth: width,
        photoHeight: height,
    };
}

export function frameLabel(content: FrameContent) {
    const e = content.showExif ? content.exif : null;
    if (e && Object.values(e).some(Boolean)) {
        return [e.model, e.exposure, e.aperture, e.iso, e.date].filter(Boolean).join(' · ');
    }
    return captionText(content.captionId);
}

export function frameKind(content: FrameContent) {
    return content.showExif && content.exif && Object.values(content.exif).some(Boolean) ? '拍摄信息' : '文案';
}

function wrapFrameLabel(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
    const words = /\p{Script=Han}/u.test(text) ? [...text] : text.split(/\s+/);
    const separator = /\p{Script=Han}/u.test(text) ? '' : ' ';
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const next = line ? line + separator + word : word;
        if (line && ctx.measureText(next).width > width) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    if (lines.length <= 2) return lines;
    let second = lines.slice(1).join(separator);
    while (second.length > 1 && ctx.measureText(second + '…').width > width) {
        second = second.slice(0, -1);
    }
    return [lines[0], second + '…'];
}

export function composeFrame(
    photo: CanvasImageSource,
    width: number,
    height: number,
    enabled: boolean,
    content: FrameContent,
) {
    const layout = frameInfo(width, height, enabled);
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('无法创建相框画布');
    }
    ctx.fillStyle = enabled ? '#f6f0e6' : '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photo, layout.x, layout.y, width, height);
    if (enabled) {
        const font = Math.max(7, Math.round(Math.min(width, height) * 0.019));
        const baseline = layout.y + height + Math.max(font * 1.8, (layout.height - layout.y - height) * 0.52);
        ctx.fillStyle = '#55514c';
        ctx.font = `600 ${font}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('PIXEL & TOON STUDIO', layout.x, baseline, Math.max(width * 0.28, 1));
        ctx.font = `${font}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        const label = frameLabel(content);
        const allowed = width * 0.59;
        const lines = wrapFrameLabel(ctx, label, allowed);
        for (let index = 0; index < lines.length; index++) {
            ctx.fillText(
                lines[index],
                layout.x + width,
                baseline + (index - (lines.length - 1) / 2) * font * 1.2,
                allowed,
            );
        }
    }
    return canvas;
}
