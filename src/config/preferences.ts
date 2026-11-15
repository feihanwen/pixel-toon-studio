import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppLanguage = 'zh' | 'en';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeColorId = 'sky' | 'sakura' | 'mint' | 'amber' | 'violet' | 'indigo';

export interface AppPreferences {
    language: AppLanguage;
    themeMode: ThemeMode;
    themeColor: ThemeColorId;
}

export interface ThemeColorOption {
    id: ThemeColorId;
    name: { zh: string; en: string };
    swatch: string;
    lightBg: string;
    darkBg: string;
}

export const THEME_COLORS: readonly ThemeColorOption[] = [
    {
        id: 'sky',
        name: { zh: '天空蓝', en: 'Sky Blue' },
        swatch: 'linear-gradient(135deg, #076cda 0%, #82baff 100%)',
        lightBg: '#dce7f2',
        darkBg: '#182b43',
    },
    {
        id: 'sakura',
        name: { zh: '樱花粉', en: 'Sakura Pink' },
        swatch: 'linear-gradient(135deg, #d6336c 0%, #ff9ebb 100%)',
        lightBg: '#f4e3eb',
        darkBg: '#311a28',
    },
    {
        id: 'mint',
        name: { zh: '薄荷森', en: 'Mint Forest' },
        swatch: 'linear-gradient(135deg, #0ca678 0%, #6ee7b7 100%)',
        lightBg: '#dcefe7',
        darkBg: '#152e27',
    },
    {
        id: 'amber',
        name: { zh: '落日珀', en: 'Sunset Amber' },
        swatch: 'linear-gradient(135deg, #d95f18 0%, #fdba74 100%)',
        lightBg: '#f3e7d9',
        darkBg: '#2b150c',
    },
    {
        id: 'violet',
        name: { zh: '极光紫', en: 'Lavender Aura' },
        swatch: 'linear-gradient(135deg, #6741d9 0%, #b197fc 100%)',
        lightBg: '#e6e2f5',
        darkBg: '#211b38',
    },
    {
        id: 'indigo',
        name: { zh: '深空靛', en: 'Midnight Indigo' },
        swatch: 'linear-gradient(135deg, #3b5bdb 0%, #748ffc 100%)',
        lightBg: '#e2e6f7',
        darkBg: '#181e3d',
    },
] as const;

export const STORAGE_KEY = 'pixel-toon-preferences-v1';
export const LANGUAGE_CHOSEN_KEY = 'pixel-toon-language-chosen-v1';

export function isLanguageChosen(): boolean {
    try {
        if (typeof localStorage === 'undefined') return true;
        return localStorage.getItem(LANGUAGE_CHOSEN_KEY) === 'true';
    } catch {
        return true;
    }
}

export function markLanguageChosen(): void {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LANGUAGE_CHOSEN_KEY, 'true');
        }
    } catch {
        // ignore
    }
}

export const DEFAULT_PREFERENCES: AppPreferences = {
    language: 'zh',
    themeMode: 'system',
    themeColor: 'sky',
};

let currentLanguage: AppLanguage = DEFAULT_PREFERENCES.language;

export function getLanguage(): AppLanguage {
    return currentLanguage;
}

export function setGlobalLanguage(language: AppLanguage): void {
    currentLanguage = language === 'en' ? 'en' : 'zh';
}

export function isAppLanguage(value: unknown): value is AppLanguage {
    return value === 'zh' || value === 'en';
}

export function isThemeMode(value: unknown): value is ThemeMode {
    return value === 'system' || value === 'light' || value === 'dark';
}

export function isThemeColorId(value: unknown): value is ThemeColorId {
    return typeof value === 'string' && THEME_COLORS.some(item => item.id === value);
}

export function getThemeColorOption(id: ThemeColorId): ThemeColorOption {
    return THEME_COLORS.find(item => item.id === id) ?? THEME_COLORS[0];
}

export function resolveWindowBackground(themeColor: ThemeColorId, isDark: boolean): string {
    const option = getThemeColorOption(themeColor);
    return isDark ? option.darkBg : option.lightBg;
}

export function loadPreferences(): AppPreferences {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const isNonZhSystem =
                typeof navigator !== 'undefined' &&
                typeof navigator.language === 'string' &&
                !navigator.language.toLowerCase().startsWith('zh');
            const initialLang: AppLanguage = isNonZhSystem ? 'en' : 'zh';
            currentLanguage = initialLang;
            return {
                ...DEFAULT_PREFERENCES,
                language: initialLang,
            };
        }
        const parsed = JSON.parse(raw) as Partial<AppPreferences>;
        const prefs: AppPreferences = {
            language: isAppLanguage(parsed.language) ? parsed.language : DEFAULT_PREFERENCES.language,
            themeMode: isThemeMode(parsed.themeMode) ? parsed.themeMode : DEFAULT_PREFERENCES.themeMode,
            themeColor: isThemeColorId(parsed.themeColor) ? parsed.themeColor : DEFAULT_PREFERENCES.themeColor,
        };
        currentLanguage = prefs.language;
        return prefs;
    } catch {
        return DEFAULT_PREFERENCES;
    }
}

export function savePreferences(prefs: AppPreferences): void {
    currentLanguage = prefs.language;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        }
    } catch {
        // Ignore storage errors in private browsing or restricted contexts
    }
}

export function applyPreferencesToDocument(prefs: AppPreferences): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.lang = prefs.language === 'en' ? 'en' : 'zh-CN';
    root.dataset.themeColor = prefs.themeColor;
    root.dataset.themeMode = prefs.themeMode;
}

interface PreferencesContextValue extends AppPreferences {
    setLanguage: (language: AppLanguage) => void;
    setThemeMode: (themeMode: ThemeMode) => void;
    setThemeColor: (themeColor: ThemeColorId) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
    ...DEFAULT_PREFERENCES,
    setLanguage: () => {},
    setThemeMode: () => {},
    setThemeColor: () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [prefs, setPrefs] = useState<AppPreferences>(() => {
        const initial = loadPreferences();
        applyPreferencesToDocument(initial);
        return initial;
    });

    useEffect(() => {
        savePreferences(prefs);
        applyPreferencesToDocument(prefs);
        const option = getThemeColorOption(prefs.themeColor);
        void window.pixelToonDesktop?.setPreferences?.({
            language: prefs.language,
            themeMode: prefs.themeMode,
            themeColor: prefs.themeColor,
            lightBg: option.lightBg,
            darkBg: option.darkBg,
        });
    }, [prefs]);

    const value = useMemo<PreferencesContextValue>(
        () => ({
            ...prefs,
            setLanguage: language => {
                setGlobalLanguage(language);
                setPrefs(prev => (prev.language === language ? prev : { ...prev, language }));
            },
            setThemeMode: themeMode => setPrefs(prev => (prev.themeMode === themeMode ? prev : { ...prev, themeMode })),
            setThemeColor: themeColor =>
                setPrefs(prev => (prev.themeColor === themeColor ? prev : { ...prev, themeColor })),
        }),
        [prefs],
    );

    return createElement(PreferencesContext.Provider, { value }, children);
}

export function usePreferences(): PreferencesContextValue {
    return useContext(PreferencesContext);
}
