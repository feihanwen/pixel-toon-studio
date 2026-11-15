import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PREFERENCES,
    THEME_COLORS,
    getThemeColorOption,
    isAppLanguage,
    isThemeColorId,
    isThemeMode,
    resolveWindowBackground,
    setGlobalLanguage,
    getLanguage,
} from '../src/config/preferences';
import { ENHANCEMENT_CHOICES, UI_STRINGS, uiText } from '../src/config/i18n';
import { GLOBAL, STYLES, styleShortName } from '../src/config/styles';
import {
    FRAME_CATEGORIES,
    FRAME_STYLES,
    frameCategoryLabel,
    frameStyleDescription,
    frameStyleName,
} from '../src/config/frames';
import { CAPTION_THEMES, captionThemeLabel } from '../src/config/captions';
import { frameKind } from '../src/imaging/frame';

describe('bilingual i18n and theme color preferences', () => {
    it('validates language, theme mode, and 5 theme color presets', () => {
        expect(DEFAULT_PREFERENCES).toEqual({
            language: 'zh',
            themeMode: 'system',
            themeColor: 'sky',
        });
        expect(isAppLanguage('zh')).toBe(true);
        expect(isAppLanguage('en')).toBe(true);
        expect(isAppLanguage('fr')).toBe(false);

        expect(isThemeMode('system')).toBe(true);
        expect(isThemeMode('light')).toBe(true);
        expect(isThemeMode('dark')).toBe(true);
        expect(isThemeMode('auto')).toBe(false);

        expect(THEME_COLORS.map(item => item.id)).toEqual([
            'sky',
            'sakura',
            'mint',
            'amber',
            'violet',
            'indigo',
        ]);
        for (const color of THEME_COLORS) {
            expect(isThemeColorId(color.id)).toBe(true);
            expect(color.name.zh.length).toBeGreaterThan(0);
            expect(color.name.en.length).toBeGreaterThan(0);
            expect(resolveWindowBackground(color.id, false)).toMatch(/^#[0-9a-f]{6}$/i);
            expect(resolveWindowBackground(color.id, true)).toMatch(/^#[0-9a-f]{6}$/i);
        }
        expect(getThemeColorOption('sky').lightBg).toBe('#dce7f2');
        expect(getThemeColorOption('sky').darkBg).toBe('#182b43');
    });

    it('provides matching keys and complete translations across zh and en', () => {
        const zhKeys = Object.keys(UI_STRINGS.zh).sort();
        const enKeys = Object.keys(UI_STRINGS.en).sort();
        expect(zhKeys).toEqual(enKeys);

        expect(uiText('zh').importButton).toBe('导入图片');
        expect(uiText('en').importButton).toBe('Import Photo');
        expect(uiText('zh').tabCount(3)).toBe('3 张照片');
        expect(uiText('en').tabCount(1)).toBe('1 photo');
        expect(uiText('en').tabCount(3)).toBe('3 photos');

        for (const lang of ['zh', 'en'] as const) {
            for (const profile of ['liveaction', 'omnisr', 'anime', 'denoise'] as const) {
                expect(ENHANCEMENT_CHOICES[lang][profile].title.length).toBeGreaterThan(0);
                expect(ENHANCEMENT_CHOICES[lang][profile].description.length).toBeGreaterThan(0);
            }
        }
    });

    it('localizes all styles, parameters, frames, and caption themes in both zh and en', () => {
        for (const [id, style] of Object.entries(STYLES)) {
            expect(styleShortName(id as keyof typeof STYLES, 'zh')).toBe(style.short);
            expect(styleShortName(id as keyof typeof STYLES, 'en')).toBe(style.shortEn);
            for (const param of Object.values(style.params)) {
                expect(param.label.length).toBeGreaterThan(0);
                expect(param.labelEn.length).toBeGreaterThan(0);
            }
        }
        for (const globalParam of Object.values(GLOBAL)) {
            expect(globalParam.label.length).toBeGreaterThan(0);
            expect(globalParam.labelEn.length).toBeGreaterThan(0);
        }
        for (const cat of Object.keys(FRAME_CATEGORIES) as Array<keyof typeof FRAME_CATEGORIES>) {
            expect(frameCategoryLabel(cat, 'zh')).not.toBe(frameCategoryLabel(cat, 'en'));
        }
        for (const frame of FRAME_STYLES) {
            expect(frameStyleName(frame, 'zh').length).toBeGreaterThan(0);
            expect(frameStyleName(frame, 'en').length).toBeGreaterThan(0);
            expect(frameStyleDescription(frame, 'zh').length).toBeGreaterThan(0);
            expect(frameStyleDescription(frame, 'en').length).toBeGreaterThan(0);
        }
        for (const theme of Object.keys(CAPTION_THEMES) as Array<keyof typeof CAPTION_THEMES>) {
            expect(captionThemeLabel(theme, 'zh')).not.toBe(captionThemeLabel(theme, 'en'));
        }

        setGlobalLanguage('en');
        expect(getLanguage()).toBe('en');
        expect(frameKind({ captionId: 'c1', showExif: false, exif: null })).toBe('Caption');
        setGlobalLanguage('zh');
        expect(frameKind({ captionId: 'c1', showExif: false, exif: null })).toBe('文案');
    });
});
