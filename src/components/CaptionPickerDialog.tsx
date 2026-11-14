import { useEffect, useMemo, useRef, useState } from 'react';
import { CAPTION_THEMES, captionText, filterCaptions, type Caption, type CaptionLanguage, type CaptionTheme } from '../config/captions';
import './caption-picker.css';

interface Props {
    selectedId: string;
    onPreview: (id: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
    onRandom: (candidates: readonly Caption[], currentId: string) => string;
}
export function CaptionPickerDialog({ selectedId, onPreview, onConfirm, onCancel, onRandom }: Props) {
    const [language, setLanguage] = useState<CaptionLanguage | 'all'>('all');
    const [theme, setTheme] = useState<CaptionTheme | 'all'>('all');
    const dialog = useRef<HTMLDivElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const options = useMemo(() => filterCaptions({ language, theme }), [language, theme]);
    useEffect(() => {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.current?.querySelector<HTMLElement>('button')?.focus();
        return () => previousFocus.current?.focus();
    }, []);
    function keyDown(event: React.KeyboardEvent) {
        if (event.key === 'Escape') { event.preventDefault(); onCancel(); return; }
        if (event.key !== 'Tab' || !dialog.current) return;
        const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled)'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return <div className="modal-backdrop caption-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
        <div ref={dialog} className="caption-dialog" role="dialog" aria-modal="true" aria-labelledby="caption-title" onKeyDown={keyDown}>
            <div className="caption-dialog-heading"><div><span className="eyebrow">FRAME CAPTION</span><h2 id="caption-title">选择相框文案</h2><p>中英文短句，选一句配这张照片。</p></div><button className="caption-close" aria-label="关闭文案选择器" onClick={onCancel}>×</button></div>
            <div className="caption-filters" aria-label="文案语言">{([['all', '全部语言'], ['zh', '中文'], ['en', 'English']] as const).map(([id, label]) => <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>{label}</button>)}</div>
            <div className="caption-filters themes" aria-label="文案主题"><button aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>全部主题</button>{(Object.keys(CAPTION_THEMES) as CaptionTheme[]).map(id => <button key={id} aria-pressed={theme === id} onClick={() => setTheme(id)}>{CAPTION_THEMES[id]}</button>)}</div>
            <div className="caption-list" role="listbox" aria-label={`可选文案，共 ${options.length} 句`}>{options.map(caption => <button key={caption.id} role="option" aria-selected={selectedId === caption.id} className={selectedId === caption.id ? 'selected' : ''} onClick={() => onPreview(caption.id)}><span>{caption.text}</span><small>{CAPTION_THEMES[caption.theme]} · {caption.language === 'zh' ? '中文' : 'English'}</small></button>)}</div>
            <div className="caption-dialog-footer"><div className="caption-selected">当前预览：{captionText(selectedId)}</div><div><button className="caption-random" onClick={() => onPreview(onRandom(options, selectedId))}>随机一句</button><button onClick={onCancel}>取消</button><button className="caption-confirm" onClick={onConfirm}>使用这句</button></div></div>
        </div>
    </div>;
}
