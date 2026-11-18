import { getLanguage, type AppLanguage } from './preferences';

/**
 * Resolve a localized message for a specific language (safe inside Web Workers).
 */
export function bMsg(lang: AppLanguage | undefined, zh: string, en: string): string {
    return lang === 'en' ? en : zh;
}

/**
 * Resolve a localized message using the active main-thread language preference.
 */
export function currentMsg(zh: string, en: string): string {
    return getLanguage() === 'en' ? en : zh;
}
