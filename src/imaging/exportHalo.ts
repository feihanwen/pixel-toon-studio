import { EXPORT_HALO, PENCIL_STYLE_SIDE, PREVIEW_SIDE, WATERCOLOR_STYLE_SIDE } from '../config/limits';
import type { StyleId } from '../config/styles';
import { filmRadius, filmSmearRadius } from '../worker/styles/film';

export function exportHalo(styleId: StyleId, params: Record<string, number>, scale: number, fullWidth: number, fullHeight: number): number {
    switch (styleId) {
        case 'watercolor':
            return Math.max(EXPORT_HALO, Math.ceil((Math.min(12, Math.max(2, params.radius ?? 7)) * 1.55 + 7) * Math.max(1, Math.max(fullWidth, fullHeight) / WATERCOLOR_STYLE_SIDE)));
        case 'pixel':
            return Math.max(EXPORT_HALO, Math.ceil((Math.max(2, params.size ?? 6) * 6 + 8) * scale));
        case 'pencil':
            return Math.max(EXPORT_HALO, Math.ceil(20 * Math.max(1, Math.max(fullWidth, fullHeight) / PENCIL_STYLE_SIDE)));
        case 'manga':
        case 'duotone':
            return Math.max(EXPORT_HALO, Math.ceil(12 * Math.max(1, Math.max(fullWidth, fullHeight) / PREVIEW_SIDE)));
        case 'film':
            return Math.max(EXPORT_HALO, filmRadius(params.halation, scale) + 2, filmSmearRadius(params.smear ?? 0, scale) + 2);
        default:
            return Math.max(EXPORT_HALO, Math.ceil(16 * scale) + 4);
    }
}
