import { useEffect, useMemo, useRef, useState } from 'react';
import {
    CAPTIONS,
    CAPTION_THEMES,
    MAX_CUSTOM_CAPTION_LENGTH,
    captionText,
    captionThemeLabel,
    customCaptionId,
    customCaptionValue,
    filterCaptions,
    isCustomCaptionId,
    normalizeCustomCaption,
    type Caption,
    type CaptionLanguage,
    type CaptionTheme,
} from '../config/captions';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import './caption-picker.css';

interface Props {
    selectedId: string;
    onPreview: (id: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
    onRandom: (candidates: readonly Caption[], currentId: string) => string;
}

export function CaptionPickerDialog({ selectedId, onPreview, onConfirm, onCancel, onRandom }: Props) {
    const { language: appLang } = usePreferences();
    const t = uiText(appLang);
    const [language, setLanguage] = useState<CaptionLanguage | 'all'>('all');
    const [theme, setTheme] = useState<CaptionTheme | 'all'>('all');
    const [customText, setCustomText] = useState(() =>
        isCustomCaptionId(selectedId) ? customCaptionValue(selectedId) : '',
    );
    const lastPresetId = useRef<string>(isCustomCaptionId(selectedId) ? CAPTIONS[0].id : selectedId);
    const dialog = useRef<HTMLDivElement>(null);
    const options = useMemo(() => filterCaptions({ language, theme }), [language, theme]);

    useEffect(() => {
        dialog.current?.querySelector<HTMLElement>('button')?.focus();
        dialog.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, []);

    function selectPreset(id: string) {
        lastPresetId.current = id;
        setCustomText('');
        onPreview(id);
    }

    function changeCustomText(value: string) {
        setCustomText(value);
        const normalized = normalizeCustomCaption(value);
        if (normalized) {
            onPreview(customCaptionId(normalized));
        } else {
            onPreview(lastPresetId.current);
        }
    }

    function keyDown(event: React.KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
        }
    }

    return (
        <div
            ref={dialog}
            className="inline-picker caption-picker"
            role="region"
            aria-labelledby="caption-title"
            onKeyDown={keyDown}
        >
                <div className="caption-dialog-heading">
                    <div>
                        <span className="eyebrow">FRAME CAPTION</span>
                        <h2 id="caption-title">{t.captionDialogTitle}</h2>
                        <p>{t.captionDialogSub}</p>
                    </div>
                    <button className="caption-close" aria-label={t.captionDialogCloseAria} onClick={onCancel}>
                        ×
                    </button>
                </div>
                <div className="caption-filters" aria-label={t.captionLangFilterAria}>
                    {([
                        ['all', t.allLanguages],
                        ['zh', '中文'],
                        ['en', 'English'],
                    ] as const).map(([id, label]) => (
                        <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="caption-filters themes" aria-label={t.captionThemeFilterAria}>
                    <button aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>
                        {t.allThemes}
                    </button>
                    {(Object.keys(CAPTION_THEMES) as CaptionTheme[]).map(id => (
                        <button key={id} aria-pressed={theme === id} onClick={() => setTheme(id)}>
                            {captionThemeLabel(id, appLang)}
                        </button>
                    ))}
                </div>
                <div className="caption-custom">
                    <input
                        type="text"
                        className="caption-custom-input"
                        aria-label={t.customCaptionAria}
                        maxLength={MAX_CUSTOM_CAPTION_LENGTH}
                        placeholder={t.customCaptionPlaceholder}
                        value={customText}
                        onChange={event => changeCustomText(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && normalizeCustomCaption(customText)) {
                                event.preventDefault();
                                onConfirm();
                            }
                        }}
                    />
                    {customText && (
                        <button
                            type="button"
                            className="caption-custom-clear"
                            aria-label={t.clearCustomCaptionAria}
                            onClick={() => changeCustomText('')}
                        >
                            {t.clearBtn}
                        </button>
                    )}
                </div>
                <div className="caption-list" role="listbox" aria-label={t.captionListAria(options.length)}>
                    {options.map(caption => (
                        <button
                            key={caption.id}
                            role="option"
                            aria-selected={selectedId === caption.id}
                            className={selectedId === caption.id ? 'selected' : ''}
                            onClick={() => selectPreset(caption.id)}
                        >
                            <span>{caption.text}</span>
                            <small>
                                {captionThemeLabel(caption.theme, appLang)} ·{' '}
                                {caption.language === 'zh' ? '中文' : 'English'}
                            </small>
                        </button>
                    ))}
                </div>
                <div className="caption-dialog-footer">
                    <div className="caption-selected">{t.captionCurrentPreview(captionText(selectedId))}</div>
                    <div>
                        <button className="caption-random" onClick={() => selectPreset(onRandom(options, selectedId))}>
                            {t.randomCaptionBtn}
                        </button>
                        <button onClick={onCancel}>{t.cancelBtn}</button>
                        <button className="caption-confirm" onClick={onConfirm}>
                            {t.confirmCaptionBtn}
                        </button>
                    </div>
                </div>
            </div>
    );
}
