import { useEffect, useRef, useState, type ReactNode } from 'react';
import { composeFrame, frameInfo, type FrameContent } from '../imaging/frame';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';

interface Props {
    heading: ReactNode;
    resultKey?: string | null;
    original: HTMLCanvasElement | null;
    processed: HTMLCanvasElement | null;
    width: number;
    height: number;
    frameEnabled: boolean;
    content: FrameContent;
    showOriginal: boolean;
    processing: boolean;
}

export function CanvasStage({
    heading,
    resultKey,
    original,
    processed,
    width,
    height,
    frameEnabled,
    content,
    showOriginal,
    processing,
}: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const before = useRef<HTMLCanvasElement>(null);
    const after = useRef<HTMLCanvasElement>(null);
    const [split, setSplit] = useState(0.5);
    const dragging = useRef(false);
    const [view, setView] = useState<'effect' | 'compare' | 'original'>('effect');

    useEffect(() => {
        setView('effect');
        setSplit(0.5);
    }, [original, resultKey]);

    const originalVisible = showOriginal || view === 'original';
    const comparing = !showOriginal && view === 'compare';
    const layout = frameInfo(width, height, frameEnabled);
    const viewport = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const previewWidth = Math.min(available.width, (available.height * layout.width) / layout.height);

    useEffect(() => {
        if (!original || !before.current || !after.current) return;
        for (const [target, photo] of [
            [before.current, original],
            [after.current, processed ?? original],
        ] as const) {
            const composed = composeFrame(photo, width, height, frameEnabled, content);
            target.width = composed.width;
            target.height = composed.height;
            target.getContext('2d')?.drawImage(composed, 0, 0);
        }
    }, [
        original,
        processed,
        width,
        height,
        frameEnabled,
        content.frameStyleId,
        content.captionId,
        content.showExif,
        content.exif,
    ]);

    const left = (layout.x / layout.width) * 100;
    const right = ((layout.width - layout.x - layout.photoWidth * split) / layout.width) * 100;
    const top = (layout.y / layout.height) * 100;
    const bottom = ((layout.height - layout.y - layout.photoHeight) / layout.height) * 100;

    function move(e: React.PointerEvent) {
        if (!dragging.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) * layout.width) / rect.width;
        setSplit(Math.max(0, Math.min(1, (x - layout.x) / layout.photoWidth)));
    }

    return (
        <div className="stage-outer">
            <div className="work-heading">
                {heading}
                <div className="stage-view-controls" role="group" aria-label={t.previewModeGroupAria}>
                    {([
                        ['effect', t.viewEffect],
                        ['compare', t.viewCompare],
                        ['original', t.viewOriginal],
                    ] as const).map(([mode, label]) => (
                        <button
                            key={mode}
                            aria-pressed={view === mode}
                            onClick={() => {
                                setView(mode);
                                if (mode === 'compare') setSplit(0.5);
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="stage-viewport" ref={viewport}>
                <div
                    className="stage-inner"
                    style={{
                        width: previewWidth,
                        height: (previewWidth * layout.height) / layout.width,
                    }}
                    onPointerMove={move}
                    onPointerUp={e => {
                        dragging.current = false;
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => {
                        dragging.current = false;
                    }}
                >
                    <canvas ref={after} className="stage-canvas" aria-label={t.processedCanvasAria} />
                    <canvas
                        ref={before}
                        className="stage-canvas"
                        style={{
                            display: originalVisible || comparing ? 'block' : 'none',
                            clipPath: originalVisible
                                ? `inset(${top}% ${100 - ((layout.x + layout.photoWidth) / layout.width) * 100}% ${bottom}% ${left}%)`
                                : `inset(${top}% ${right}% ${bottom}% ${left}%)`,
                        }}
                        aria-label={t.originalCanvasAria}
                    />
                    {comparing && (
                        <div
                            className="compare-line"
                            style={{
                                left: `${((layout.x + layout.photoWidth * split) / layout.width) * 100}%`,
                                top: `${top}%`,
                                bottom: `${bottom}%`,
                            }}
                            onPointerDown={e => {
                                dragging.current = true;
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                    parent.setPointerCapture(e.pointerId);
                                    const rect = parent.getBoundingClientRect();
                                    const x = ((e.clientX - rect.left) * layout.width) / rect.width;
                                    setSplit(Math.max(0, Math.min(1, (x - layout.x) / layout.photoWidth)));
                                }
                            }}
                            role="slider"
                            aria-label={t.compareSliderAria}
                            aria-valuenow={Math.round(split * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            tabIndex={0}
                            onKeyDown={e => {
                                if (e.key === 'ArrowLeft') setSplit(Math.max(0, split - 0.05));
                                if (e.key === 'ArrowRight') setSplit(Math.min(1, split + 0.05));
                            }}
                        >
                            <span className="compare-handle">‹ ›</span>
                        </div>
                    )}
                    {processing && (
                        <div className="stage-processing">
                            <span className="pulse-dot" /> {t.renderingPreview}
                        </div>
                    )}
                    {(originalVisible || comparing) && <span className="stage-corner left">{t.cornerOriginal}</span>}
                </div>
            </div>
            <div className="stage-hint">
                {comparing ? t.hintComparing : originalVisible ? t.hintOriginal : t.hintEffect} · {t.hintHoldSpace}
            </div>
        </div>
    );
}
