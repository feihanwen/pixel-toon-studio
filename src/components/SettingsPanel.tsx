import { useEffect, useRef, useState } from 'react';
import {
    THEME_COLORS,
    usePreferences,
    type AppLanguage,
    type ThemeColorId,
    type ThemeMode,
} from '../config/preferences';
import { uiText } from '../config/i18n';
import { StudioIcon } from './StudioIcon';

export function SettingsPanel() {
    const { language, themeMode, themeColor, setLanguage, setThemeMode, setThemeColor } = usePreferences();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const t = uiText(language);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };
        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div className="settings-anchor" ref={containerRef}>
            <button
                type="button"
                className="top-settings-btn"
                aria-label={t.settingsButton}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen(prev => !prev)}
            >
                <StudioIcon name="settings" size={16} />
                <span className="settings-btn-label">{t.settingsButtonLabel}</span>
            </button>
            {open && (
                <div className="settings-popover" role="dialog" aria-label={t.settingsTitle}>
                    <div className="settings-popover-head">
                        <div>
                            <strong>{t.settingsTitle}</strong>
                            <small>{t.settingsSubtitle}</small>
                        </div>
                        <button
                            type="button"
                            className="settings-popover-close"
                            aria-label={t.closeNoticeAria}
                            onClick={() => setOpen(false)}
                        >
                            ×
                        </button>
                    </div>

                    <div className="settings-group">
                        <span className="settings-label">{t.languageLabel}</span>
                        <div className="settings-segmented" role="group" aria-label={t.languageLabel}>
                            {([
                                ['zh', '中文'],
                                ['en', 'English'],
                            ] as const satisfies ReadonlyArray<readonly [AppLanguage, string]>).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    aria-pressed={language === id}
                                    onClick={() => setLanguage(id)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="settings-group">
                        <span className="settings-label">{t.appearanceLabel}</span>
                        <div className="settings-segmented" role="group" aria-label={t.appearanceLabel}>
                            {([
                                ['system', t.appearanceSystem],
                                ['light', t.appearanceLight],
                                ['dark', t.appearanceDark],
                            ] as const satisfies ReadonlyArray<readonly [ThemeMode, string]>).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    aria-pressed={themeMode === id}
                                    onClick={() => setThemeMode(id)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="settings-group">
                        <span className="settings-label">{t.themeColorLabel}</span>
                        <div className="settings-color-grid" role="group" aria-label={t.themeColorLabel}>
                            {THEME_COLORS.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`settings-color-chip ${themeColor === item.id ? 'active' : ''}`}
                                    aria-pressed={themeColor === item.id}
                                    onClick={() => setThemeColor(item.id as ThemeColorId)}
                                >
                                    <i
                                        className="settings-color-swatch"
                                        style={{ background: item.swatch }}
                                        aria-hidden="true"
                                    />
                                    <span>{item.name[language]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
