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

export const CORE_PARAM_KEYS: Record<StyleId, readonly [string, string, string]> = {
    cel: ['levels', 'ink', 'colorPop'],
    pixel: ['size', 'colors', 'edgeSharpness'],
    watercolor: ['radius', 'smear', 'vibrance'],
    halftone: ['dot', 'density', 'ink'],
    manga: ['ink', 'dot', 'contrast'],
    pencil: ['line', 'pigment', 'stroke'],
    duotone: ['shadowHue', 'highlightHue', 'split'],
    film: ['fade', 'grain', 'warmth'],
};

export interface StylePreset {
    id: string;
    label: string;
    labelEn: string;
    params: Record<string, number>;
}

export const STYLE_PRESETS: Record<StyleId, readonly [StylePreset, StylePreset, StylePreset]> = {
    cel: [
        {
            id: 'cel-classic',
            label: '经典赛璐璐',
            labelEn: 'Classic Cel',
            params: { levels: 5, ink: 65, sensitivity: 48, background: 70, blend: 75, colorPop: 0 },
        },
        {
            id: 'cel-bright',
            label: '清透新海',
            labelEn: 'Bright Anime',
            params: { levels: 7, ink: 42, sensitivity: 42, background: 82, blend: 85, colorPop: 42 },
        },
        {
            id: 'cel-ova',
            label: '浓郁复古',
            labelEn: 'Bold OVA',
            params: { levels: 4, ink: 88, sensitivity: 62, background: 55, blend: 62, colorPop: 25 },
        },
    ],
    pixel: [
        {
            id: 'pixel-crisp',
            label: '精致像素',
            labelEn: 'Crisp Pixel',
            params: { size: 3, edgeSharpness: 80, cleanup: 45, colors: 12, dominant: 70, contrast: 12 },
        },
        {
            id: 'pixel-retro',
            label: '8-bit 复古',
            labelEn: 'Retro 8-bit',
            params: { size: 7, edgeSharpness: 90, cleanup: 65, colors: 6, dominant: 85, contrast: 35 },
        },
        {
            id: 'pixel-soft',
            label: '柔和物语',
            labelEn: 'Soft Story',
            params: { size: 4, edgeSharpness: 45, cleanup: 35, colors: 18, dominant: 50, contrast: 5 },
        },
    ],
    watercolor: [
        {
            id: 'watercolor-wet',
            label: '湿画晕染',
            labelEn: 'Wet Wash',
            params: { radius: 7, smear: 78, softness: 62, detail: 55, vibrance: 13, warmth: 28 },
        },
        {
            id: 'watercolor-pastel',
            label: '清新淡彩',
            labelEn: 'Light Pastel',
            params: { radius: 5, smear: 55, softness: 75, detail: 72, vibrance: -10, warmth: 10 },
        },
        {
            id: 'watercolor-impasto',
            label: '厚涂油画',
            labelEn: 'Rich Impasto',
            params: { radius: 12, smear: 92, softness: 40, detail: 38, vibrance: 45, warmth: 38 },
        },
    ],
    halftone: [
        {
            id: 'halftone-classic',
            label: '黄金美漫',
            labelEn: 'Classic Pop',
            params: { dot: 6, density: 45, ink: 55, shift: 0, poster: 90, levels: 5 },
        },
        {
            id: 'halftone-misprint',
            label: '错版海报',
            labelEn: 'Misprint',
            params: { dot: 8, density: 68, ink: 72, shift: 7, poster: 95, levels: 4 },
        },
        {
            id: 'halftone-light',
            label: '轻网点印刷',
            labelEn: 'Light Print',
            params: { dot: 4, density: 28, ink: 35, shift: 2, poster: 65, levels: 7 },
        },
    ],
    manga: [
        {
            id: 'manga-weekly',
            label: '连载原稿',
            labelEn: 'Weekly Ink',
            params: { dot: 6, ink: 76, levels: 4, white: 72, contrast: 0, hatch: 65 },
        },
        {
            id: 'manga-shonen',
            label: '热血强对比',
            labelEn: 'High Contrast',
            params: { dot: 5, ink: 92, levels: 3, white: 82, contrast: 42, hatch: 85 },
        },
        {
            id: 'manga-seinen',
            label: '细腻网点',
            labelEn: 'Fine Tone',
            params: { dot: 3, ink: 58, levels: 7, white: 60, contrast: -10, hatch: 45 },
        },
    ],
    pencil: [
        {
            id: 'pencil-warm',
            label: '暖纸彩铅',
            labelEn: 'Warm Sketch',
            params: { stroke: 3, line: 62, pigment: 68, paper: 24, hatch: 36, warmPaper: 40 },
        },
        {
            id: 'pencil-inked',
            label: '素描重线',
            labelEn: 'Inked Sketch',
            params: { stroke: 2, line: 88, pigment: 30, paper: 38, hatch: 68, warmPaper: 12 },
        },
        {
            id: 'pencil-storybook',
            label: '柔彩绘本',
            labelEn: 'Storybook',
            params: { stroke: 5, line: 42, pigment: 88, paper: 18, hatch: 22, warmPaper: 55 },
        },
    ],
    duotone: [
        {
            id: 'duotone-sunset',
            label: '靛蓝暖橙',
            labelEn: 'Indigo Sunset',
            params: { shadowHue: 225, highlightHue: 35, split: 52, detail: 42, saturation: 75, contrast: 15 },
        },
        {
            id: 'duotone-cyber',
            label: '赛博粉青',
            labelEn: 'Neon Cyber',
            params: { shadowHue: 270, highlightHue: 175, split: 48, detail: 55, saturation: 92, contrast: 32 },
        },
        {
            id: 'duotone-emerald',
            label: '墨绿米金',
            labelEn: 'Vintage Gold',
            params: { shadowHue: 155, highlightHue: 45, split: 56, detail: 48, saturation: 62, contrast: 18 },
        },
    ],
    film: [
        {
            id: 'film-kodak',
            label: '暖调柯达',
            labelEn: 'Kodak Warm',
            params: { fade: 48, grain: 64, smear: 45, warmth: 24, halation: 38, tint: 0, vignette: 0 },
        },
        {
            id: 'film-fuji',
            label: '日系清冷',
            labelEn: 'Fuji Cool',
            params: { fade: 62, grain: 42, smear: 35, warmth: -22, halation: 24, tint: -18, vignette: 15 },
        },
        {
            id: 'film-cinestill',
            label: '暗夜光晕',
            labelEn: 'Night Halation',
            params: { fade: 35, grain: 78, smear: 52, warmth: 12, halation: 82, tint: 16, vignette: 45 },
        },
    ],
};

export function matchingStylePresetId(styleId: StyleId, current: Record<string, number>): string | null {
    for (const preset of STYLE_PRESETS[styleId]) {
        const matches = Object.entries(preset.params).every(([k, v]) => current[k] === v);
        if (matches) return preset.id;
    }
    return null;
}
