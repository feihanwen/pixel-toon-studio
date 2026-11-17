import { EXPORT_HALO, PENCIL_STYLE_SIDE, PREVIEW_SIDE, WATERCOLOR_STYLE_SIDE } from '../config/limits';
import type { StyleId } from '../config/styles';
import { mosaicHalo } from '../mosaic/mosaicEngine';
import { filmRadius, filmSmearRadius } from '../worker/styles/film';

export function exportHalo(
    styleId: StyleId,
    params: Record<string, number>,
    scale: number,
    fullWidth: number,
    fullHeight: number,
    mosaicStrength = 0,
): number {
    const mHalo = mosaicStrength > 0 ? mosaicHalo(mosaicStrength, fullWidth, fullHeight) : 0;
    let styleHalo: number;
    switch (styleId) {
        case 'watercolor':
            styleHalo = Math.max(EXPORT_HALO, Math.ceil((Math.min(18, Math.max(2, params.radius ?? 7)) * 1.55 + 7) * Math.max(1, Math.max(fullWidth, fullHeight) / WATERCOLOR_STYLE_SIDE)));
            break;
        case 'pixel':
            styleHalo = Math.max(EXPORT_HALO, Math.ceil((Math.max(2, params.size ?? 6) * 6 + 8) * scale));
            break;
        case 'pencil':
            styleHalo = Math.max(EXPORT_HALO, Math.ceil(28 * Math.max(1, Math.max(fullWidth, fullHeight) / PENCIL_STYLE_SIDE)));
            break;
        case 'halftone':
            styleHalo = Math.max(EXPORT_HALO, Math.ceil(Math.max(16, (params.shift ?? 0) + 4) * scale) + 4);
            break;
        case 'cel':
            styleHalo = Math.max(EXPORT_HALO, Math.ceil(16 * Math.max(1, Math.max(fullWidth, fullHeight) / PREVIEW_SIDE)));
            break;
        case 'manga':
        case 'duotone':
            styleHalo = Math.max(EXPORT_HALO, Math.ceil(12 * Math.max(1, Math.max(fullWidth, fullHeight) / PREVIEW_SIDE)));
            break;
        case 'film':
            styleHalo = Math.max(EXPORT_HALO, filmRadius(params.halation, scale) + 2, filmSmearRadius(params.smear ?? 0, scale) + 2);
            break;
        default:
            styleHalo = Math.max(EXPORT_HALO, Math.ceil(16 * scale) + 4);
            break;
    }
    return Math.max(styleHalo, mHalo);
}
