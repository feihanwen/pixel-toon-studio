import { useEffect, useMemo, useRef, useState } from 'react';
import {
    FRAME_CATEGORIES,
    filterFrameStyles,
    frameCategoryLabel,
    frameStyleDescription,
    frameStyleName,
    getFrameStyle,
    type FrameCategory,
    type FrameStyle,
    type FrameStyleId,
} from '../config/frames';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import './caption-picker.css';

interface Props {
    selectedId: FrameStyleId;
    photoWidth?: number;
    photoHeight?: number;
    onPreview: (id: FrameStyleId) => void;
    onConfirm: () => void;
    onCancel: () => void;
    onRandom: (candidates: readonly FrameStyle[], currentId: FrameStyleId) => FrameStyleId;
}

export function FrameStylePickerDialog({
    selectedId,
    photoWidth = 3,
    photoHeight = 4,
    onPreview,
    onConfirm,
    onCancel,
    onRandom,
}: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const [category, setCategory] = useState<FrameCategory | 'all'>('all');
    const dialog = useRef<HTMLDivElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const options = useMemo(() => filterFrameStyles(category), [category]);
    const currentStyle = getFrameStyle(selectedId);
    const ratio = photoWidth > 0 && photoHeight > 0 ? `${photoWidth} / ${photoHeight}` : '3 / 4';

    useEffect(() => {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.current?.querySelector<HTMLElement>('button')?.focus();
        return () => previousFocus.current?.focus();
    }, []);

    function keyDown(event: React.KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
            return;
        }
        if (event.key !== 'Tab' || !dialog.current) return;
        const focusable = Array.from(
            dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    }

    return (
        <div
            className="modal-backdrop caption-backdrop"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <div
                ref={dialog}
                className="caption-dialog frame-style-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="frame-style-title"
                onKeyDown={keyDown}
            >
                <div className="caption-dialog-heading">
                    <div>
                        <span className="eyebrow">POLAROID FRAME</span>
                        <h2 id="frame-style-title">{t.frameDialogTitle}</h2>
                        <p>{t.frameDialogSub}</p>
                    </div>
                    <button className="caption-close" aria-label={t.frameDialogCloseAria} onClick={onCancel}>
                        ×
                    </button>
                </div>

                <div className="caption-filters themes frame-category-filters" aria-label={t.frameCategoryFilterAria}>
                    <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
                        {t.allFrameCategories}
                    </button>
                    {(Object.keys(FRAME_CATEGORIES) as FrameCategory[]).map(id => (
                        <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>
                            {frameCategoryLabel(id, language)}
                        </button>
                    ))}
                </div>

                <div
                    className="caption-list frame-style-list"
                    role="listbox"
                    aria-label={t.frameListAria(options.length)}
                >
                    {options.map(item => (
                        <button
                            key={item.id}
                            role="option"
                            aria-selected={selectedId === item.id}
                            className={`frame-style-option ${selectedId === item.id ? 'selected' : ''}`}
                            onClick={() => onPreview(item.id)}
                        >
                            <div className="frame-mini-stage" aria-hidden="true">
                                <div
                                    className={`frame-mini-polaroid ${item.id === 'stacked-double' ? 'is-stacked' : ''}`}
                                    style={{
                                        background: item.previewBackground,
                                        color: item.previewTextColor,
                                    }}
                                >
                                    {item.id === 'washi-tape' && <i className="frame-mini-tape" />}
                                    <div
                                        className="frame-mini-photo"
                                        style={{
                                            aspectRatio: ratio,
                                            border: item.previewInnerBorder,
                                        }}
                                    >
                                        <span className="frame-mini-sun" />
                                        <span className="frame-mini-hill" />
                                    </div>
                                    <span className="frame-mini-caption">{item.code}</span>
                                </div>
                            </div>
                            <div className="frame-style-meta">
                                <div className="frame-style-title-row">
                                    <strong>{frameStyleName(item, language)}</strong>
                                    <code>{item.code}</code>
                                </div>
                                <p>{frameStyleDescription(item, language)}</p>
                                <small>{frameCategoryLabel(item.category, language)}</small>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="caption-dialog-footer">
                    <div className="caption-selected">
                        {t.frameCurrentPreview(
                            currentStyle.code,
                            frameStyleName(currentStyle, language),
                            frameCategoryLabel(currentStyle.category, language),
                        )}
                    </div>
                    <div>
                        <button className="caption-random" onClick={() => onPreview(onRandom(options, selectedId))}>
                            {t.randomFrameBtn}
                        </button>
                        <button onClick={onCancel}>{t.cancelBtn}</button>
                        <button className="caption-confirm" onClick={onConfirm}>
                            {t.confirmFrameBtn}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
