import { useEffect, useMemo, useRef, useState } from 'react';
import {
    FRAME_CATEGORIES,
    filterFrameStyles,
    getFrameStyle,
    type FrameCategory,
    type FrameStyle,
    type FrameStyleId,
} from '../config/frames';
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
                        <h2 id="frame-style-title">选择拍立得相框</h2>
                        <p>共 27 款主题相纸，自动匹配当前照片比例，点击即可实时预览。</p>
                    </div>
                    <button className="caption-close" aria-label="关闭相框选择器" onClick={onCancel}>
                        ×
                    </button>
                </div>

                <div className="caption-filters themes frame-category-filters" aria-label="相框分类">
                    <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
                        全部款式
                    </button>
                    {(Object.keys(FRAME_CATEGORIES) as FrameCategory[]).map(id => (
                        <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>
                            {FRAME_CATEGORIES[id]}
                        </button>
                    ))}
                </div>

                <div
                    className="caption-list frame-style-list"
                    role="listbox"
                    aria-label={`可选拍立得相框，共 ${options.length} 款`}
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
                                    <strong>{item.name}</strong>
                                    <code>{item.code}</code>
                                </div>
                                <p>{item.description}</p>
                                <small>{FRAME_CATEGORIES[item.category]}</small>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="caption-dialog-footer">
                    <div className="caption-selected">
                        当前预览：{currentStyle.code} {currentStyle.name}（{FRAME_CATEGORIES[currentStyle.category]}）
                    </div>
                    <div>
                        <button className="caption-random" onClick={() => onPreview(onRandom(options, selectedId))}>
                            随机一款
                        </button>
                        <button onClick={onCancel}>取消</button>
                        <button className="caption-confirm" onClick={onConfirm}>
                            使用这款
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
