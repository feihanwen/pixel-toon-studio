import type { AppLanguage } from './preferences';

export interface ParamDefinition {
    label: string;
    labelEn: string;
    min: number;
    max: number;
    default: number;
    unit: string;
    unitEn?: string;
}

export const STYLES = {
    cel: {
        name: '赛璐璐动漫风',
        nameEn: 'Cel Shaded Anime',
        short: '赛璐璐',
        shortEn: 'Cel Shade',
        en: 'CEL SHADE',
        icon: '✦',
        params: {
            levels: { label: '色阶', labelEn: 'Color Levels', min: 2, max: 12, default: 5, unit: '级', unitEn: '' },
            ink: { label: '墨线强度', labelEn: 'Ink Lines', min: 0, max: 100, default: 65, unit: '%', unitEn: '%' },
            sensitivity: { label: '边缘灵敏度', labelEn: 'Edge Sensitivity', min: 0, max: 100, default: 48, unit: '%', unitEn: '%' },
            background: { label: '背景保护', labelEn: 'BG Protection', min: 0, max: 100, default: 70, unit: '%', unitEn: '%' },
            blend: { label: '色阶融合', labelEn: 'Cel Blend', min: 0, max: 100, default: 75, unit: '%', unitEn: '%' },
            colorPop: { label: '色彩鲜明', labelEn: 'Color Pop', min: -50, max: 100, default: 0, unit: '%', unitEn: '%' },
        },
    },
    pixel: {
        name: '2D 线条像素插画风',
        nameEn: '2D Pixel Line Art',
        short: '像素线条',
        shortEn: 'Pixel Line',
        en: 'PIXEL LINE',
        icon: '▦',
        params: {
            size: { label: '像素尺寸', labelEn: 'Pixel Size', min: 2, max: 20, default: 3, unit: 'px', unitEn: 'px' },
            edgeSharpness: { label: '边缘锐度', labelEn: 'Edge Sharpness', min: 0, max: 100, default: 80, unit: '%', unitEn: '%' },
            cleanup: { label: '噪点清理', labelEn: 'Morph Cleanup', min: 0, max: 100, default: 45, unit: '%', unitEn: '%' },
            colors: { label: '色块数量', labelEn: 'Color Count', min: 2, max: 24, default: 12, unit: '色', unitEn: '' },
            dominant: { label: '主色锁定', labelEn: 'Dominant Mode', min: 0, max: 100, default: 70, unit: '%', unitEn: '%' },
            contrast: { label: '色彩对比', labelEn: 'Contrast', min: -50, max: 100, default: 12, unit: '%', unitEn: '%' },
        },
    },
    watercolor: {
        name: '水彩油画风',
        nameEn: 'Watercolor & Impasto',
        short: '水彩油画',
        shortEn: 'Watercolor',
        en: 'WATERCOLOR',
        icon: '◌',
        params: {
            radius: { label: '笔触尺寸', labelEn: 'Brush Size', min: 2, max: 18, default: 7, unit: 'px', unitEn: 'px' },
            smear: { label: '画意强度', labelEn: 'Paint Flow', min: 0, max: 100, default: 78, unit: '%', unitEn: '%' },
            softness: { label: '颜料融合', labelEn: 'Pigment Blend', min: 0, max: 100, default: 62, unit: '%', unitEn: '%' },
            detail: { label: '细节保留', labelEn: 'Detail Keep', min: 0, max: 100, default: 55, unit: '%', unitEn: '%' },
            vibrance: { label: '颜料浓艳', labelEn: 'Pigment Vivid', min: -50, max: 100, default: 13, unit: '%', unitEn: '%' },
            warmth: { label: '纸面暖调', labelEn: 'Paper Wash', min: -100, max: 100, default: 28, unit: '', unitEn: '' },
        },
    },
    halftone: {
        name: '美漫波普网点风',
        nameEn: 'Pop Art Halftone',
        short: '美漫波普',
        shortEn: 'Pop Art',
        en: 'POP ART',
        icon: '●',
        params: {
            dot: { label: '网点大小', labelEn: 'Dot Size', min: 2, max: 18, default: 6, unit: '', unitEn: '' },
            density: { label: '网点强度', labelEn: 'Dot Density', min: 0, max: 100, default: 45, unit: '%', unitEn: '%' },
            ink: { label: '墨线强度', labelEn: 'Ink Lines', min: 0, max: 100, default: 55, unit: '%', unitEn: '%' },
            shift: { label: 'RGB 错位', labelEn: 'RGB Shift', min: 0, max: 14, default: 0, unit: '', unitEn: '' },
            poster: { label: '色块强度', labelEn: 'Posterize', min: 0, max: 100, default: 90, unit: '%', unitEn: '%' },
            levels: { label: '色阶数', labelEn: 'Color Levels', min: 2, max: 10, default: 5, unit: '级', unitEn: '' },
        },
    },
    manga: {
        name: '黑白日漫',
        nameEn: 'Manga Screentone',
        short: '黑白日漫',
        shortEn: 'Manga Ink',
        en: 'MANGA INK',
        icon: '◩',
        params: {
            dot: { label: '网点尺寸', labelEn: 'Tone Size', min: 2, max: 16, default: 6, unit: 'px', unitEn: 'px' },
            ink: { label: '墨线强度', labelEn: 'Ink Lines', min: 0, max: 100, default: 76, unit: '%', unitEn: '%' },
            levels: { label: '阴影层次', labelEn: 'Shade Levels', min: 2, max: 10, default: 4, unit: '级', unitEn: '' },
            white: { label: '留白保护', labelEn: 'White Guard', min: 0, max: 100, default: 72, unit: '%', unitEn: '%' },
            contrast: { label: '黑白反差', labelEn: 'Ink Contrast', min: -50, max: 100, default: 0, unit: '%', unitEn: '%' },
            hatch: { label: '阴影排线', labelEn: 'Cross-Hatch', min: 0, max: 100, default: 65, unit: '%', unitEn: '%' },
        },
    },
    pencil: {
        name: '彩铅手绘',
        nameEn: 'Colored Pencil Sketch',
        short: '彩铅手绘',
        shortEn: 'Color Pencil',
        en: 'COLOR PENCIL',
        icon: '✎',
        params: {
            stroke: { label: '笔触尺寸', labelEn: 'Stroke Size', min: 1, max: 12, default: 3, unit: 'px', unitEn: 'px' },
            line: { label: '线稿强度', labelEn: 'Sketch Line', min: 0, max: 100, default: 62, unit: '%', unitEn: '%' },
            pigment: { label: '彩铅浓度', labelEn: 'Pigment Richness', min: 0, max: 100, default: 68, unit: '%', unitEn: '%' },
            paper: { label: '纸张质感', labelEn: 'Paper Grain', min: 0, max: 100, default: 24, unit: '%', unitEn: '%' },
            hatch: { label: '交叉排线', labelEn: 'Cross-Hatch', min: 0, max: 100, default: 36, unit: '%', unitEn: '%' },
            warmPaper: { label: '纸色冷暖', labelEn: 'Paper Tone', min: -100, max: 100, default: 40, unit: '', unitEn: '' },
        },
    },
    duotone: {
        name: '双色海报',
        nameEn: 'Duotone Poster',
        short: '双色海报',
        shortEn: 'Duotone',
        en: 'DUOTONE',
        icon: '◐',
        params: {
            shadowHue: { label: '暗部色相', labelEn: 'Shadow Hue', min: 0, max: 359, default: 225, unit: '°', unitEn: '°' },
            highlightHue: { label: '亮部色相', labelEn: 'Highlight Hue', min: 0, max: 359, default: 35, unit: '°', unitEn: '°' },
            split: { label: '分色位置', labelEn: 'Tone Split', min: 0, max: 100, default: 52, unit: '%', unitEn: '%' },
            detail: { label: '层次保留', labelEn: 'Detail Keep', min: 0, max: 100, default: 42, unit: '%', unitEn: '%' },
            saturation: { label: '色彩浓烈', labelEn: 'Color Richness', min: 0, max: 100, default: 75, unit: '%', unitEn: '%' },
            contrast: { label: '明暗反差', labelEn: 'Poster Contrast', min: -50, max: 100, default: 15, unit: '%', unitEn: '%' },
        },
    },
    film: {
        name: '复古胶片',
        nameEn: 'Vintage Film',
        short: '复古胶片',
        shortEn: 'Vintage Film',
        en: 'VINTAGE FILM',
        icon: '▤',
        params: {
            fade: { label: '褪色强度', labelEn: 'Film Fade', min: 0, max: 100, default: 48, unit: '%', unitEn: '%' },
            grain: { label: '颗粒强度', labelEn: 'Film Grain', min: 0, max: 100, default: 64, unit: '%', unitEn: '%' },
            smear: { label: '柔化涂抹', labelEn: 'Soft Diffusion', min: 0, max: 100, default: 45, unit: '%', unitEn: '%' },
            warmth: { label: '色温', labelEn: 'Warmth', min: -100, max: 100, default: 24, unit: '', unitEn: '' },
            halation: { label: '高光晕染', labelEn: 'Halation', min: 0, max: 100, default: 38, unit: '%', unitEn: '%' },
            tint: { label: '绿品偏色', labelEn: 'Tint', min: -100, max: 100, default: 0, unit: '', unitEn: '' },
            vignette: { label: '胶片暗角', labelEn: 'Vignette', min: 0, max: 100, default: 0, unit: '%', unitEn: '%' },
        },
    },
} as const;

export type StyleId = keyof typeof STYLES;
export type ParamsByStyle = Record<StyleId, Record<string, number>>;

export const GLOBAL = {
    brightness: { label: '亮度', labelEn: 'Brightness', min: -100, max: 100, default: 0, unit: '', unitEn: '' },
    contrast: { label: '对比度', labelEn: 'Contrast', min: -100, max: 100, default: 0, unit: '', unitEn: '' },
    saturation: { label: '饱和度', labelEn: 'Saturation', min: -100, max: 100, default: 0, unit: '', unitEn: '' },
    highlights: { label: '高光', labelEn: 'Highlights', min: -100, max: 100, default: 0, unit: '', unitEn: '' },
    shadows: { label: '阴影', labelEn: 'Shadows', min: -100, max: 100, default: 0, unit: '', unitEn: '' },
    temperature: { label: '色温', labelEn: 'Temperature', min: -100, max: 100, default: 0, unit: '', unitEn: '' },
} as const;

export type GlobalKey = keyof typeof GLOBAL;

export function defaultParams(): ParamsByStyle {
    return Object.fromEntries(
        Object.entries(STYLES).map(([id, s]) => [
            id,
            Object.fromEntries(Object.entries(s.params).map(([key, p]) => [key, p.default])),
        ]),
    ) as ParamsByStyle;
}

export function styleParams(styleId: StyleId): Record<string, ParamDefinition> {
    return STYLES[styleId].params;
}

export function styleShortName(styleId: StyleId, lang: AppLanguage = 'zh'): string {
    return lang === 'en' ? STYLES[styleId].shortEn : STYLES[styleId].short;
}
