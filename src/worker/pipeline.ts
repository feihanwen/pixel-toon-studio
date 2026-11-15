import { popArt } from './styles/popArt';
import { applyAutoColor } from '../imaging/autoColor';
import type { RenderRequest } from '../types/worker';
import { adjust } from './shared/color';
import { cel } from './styles/cel';
import { pixel } from './styles/pixel';
import { watercolor } from './styles/watercolor';
import { manga } from './styles/manga';
import { pencil } from './styles/pencil';
import { duotone } from './styles/duotone';
import { film } from './styles/film';

export function render(req: RenderRequest): ArrayBuffer {
    const src = new Uint8ClampedArray(req.buffer);
    let out: Uint8ClampedArray;
    applyAutoColor(src, req.autoColor);
    if (req.output === 'base') {
        return src.buffer as ArrayBuffer;
    }
    switch (req.styleId) {
        case 'cel':
            out = cel(src, req.width, req.height, req.params);
            break;
        case 'pixel':
            out = pixel(src, req.width, req.height, req.params, req.originX, req.originY, req.scale);
            break;
        case 'watercolor':
            out = watercolor(src, req.width, req.height, req.params, req.originX, req.originY, req.fullWidth, req.fullHeight);
            break;
        case 'halftone':
            out = popArt(src, req.width, req.height, req.params, req);
            break;
        case 'manga':
            out = manga(src, req.width, req.height, req.params, req);
            break;
        case 'pencil':
            out = pencil(src, req.width, req.height, req.params, req);
            break;
        case 'duotone':
            out = duotone(src, req.width, req.height, req.params, req);
            break;
        case 'film':
            out = film(src, req.width, req.height, req.params, req);
            break;
        default: {
            const unknown: never = req.styleId;
            throw new Error(`未知视觉风格：${unknown}`);
        }
    }
    adjust(out, req.global);
    return out.buffer as ArrayBuffer;
}
