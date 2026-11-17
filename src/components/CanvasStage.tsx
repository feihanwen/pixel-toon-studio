import { useEffect, useRef, useState, type ReactNode } from 'react';
import { composeFrame, frameInfo, type FrameContent } from '../imaging/frame';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import type { MosaicPoint, MosaicStroke } from '../types/mosaic';
import type { MosaicToolMode } from './MosaicPanel';

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
    mosaicTool?: MosaicToolMode;
    mosaicBrushSize?: number;
    onMosaicStroke?: (stroke: MosaicStroke) => void;
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
    mosaicTool = null,
    mosaicBrushSize = 36,
    onMosaicStroke,
}: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const before = useRef<HTMLCanvasElement>(null);
    const after = useRef<HTMLCanvasElement>(null);
    const overlay = useRef<HTMLCanvasElement>(null);
    const [split, setSplit] = useState(0.5);
    const dragging = useRef(false);
    const painting = useRef(false);
    const strokePoints = useRef<MosaicPoint[]>([]);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
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
    const stageHeight = previewWidth > 0 ? (previewWidth * layout.height) / layout.width : 0;
    const normRadius = Math.max(0.008, mosaicBrushSize / 600);
    const cssBrushRadius =
        previewWidth > 0
            ? normRadius * Math.min(layout.photoWidth, layout.photoHeight) * (previewWidth / layout.width)
            : 16;

    function pointerToNorm(e: React.PointerEvent): MosaicPoint | null {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const cx = ((e.clientX - rect.left) * layout.width) / rect.width;
        const cy = ((e.clientY - rect.top) * layout.height) / rect.height;
        const nx = (cx - layout.x) / layout.photoWidth;
        const ny = (cy - layout.y) / layout.photoHeight;
        return {
            x: Math.max(0, Math.min(1, nx)),
            y: Math.max(0, Math.min(1, ny)),
        };
    }

    function drawLiveOverlay(points: MosaicPoint[]) {
        const canvas = overlay.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!points.length) return;
        const rPx = Math.max(4, normRadius * Math.min(canvas.width, canvas.height));
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = rPx * 2;
        ctx.strokeStyle = mosaicTool === 'erase' ? 'rgba(255, 110, 110, 0.36)' : 'rgba(92, 178, 255, 0.38)';
        ctx.fillStyle = ctx.strokeStyle;
        if (points.length === 1) {
            ctx.beginPath();
            ctx.arc(points[0].x * canvas.width, points[0].y * canvas.height, rPx, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x * canvas.width, points[i].y * canvas.height);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    function clearLiveOverlay() {
        const canvas = overlay.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function finishStroke() {
        if (!painting.current) return;
        painting.current = false;
        const pts = strokePoints.current;
        strokePoints.current = [];
        clearLiveOverlay();
        if (pts.length > 0 && mosaicTool && onMosaicStroke) {
            onMosaicStroke({ mode: mosaicTool, radius: normRadius, points: pts });
        }
    }

    function handleStagePointerDown(e: React.PointerEvent) {
        if (!mosaicTool || e.button !== 0) return;
        const pt = pointerToNorm(e);
        if (!pt) return;
        e.preventDefault();
        if (view === 'original') setView('effect');
        painting.current = true;
        strokePoints.current = [pt];
        e.currentTarget.setPointerCapture(e.pointerId);
        drawLiveOverlay(strokePoints.current);
    }

    function move(e: React.PointerEvent) {
        if (mosaicTool) {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            if (painting.current) {
                const pt = pointerToNorm(e);
                if (pt) {
                    const last = strokePoints.current[strokePoints.current.length - 1];
                    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 0.004) {
                        strokePoints.current.push(pt);
                        drawLiveOverlay(strokePoints.current);
                    }
                }
            }
            return;
        }
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
                    className={`stage-inner${mosaicTool ? ' is-painting' : ''}`}
                    style={{
                        width: previewWidth,
                        height: stageHeight,
                    }}
                    onPointerDown={handleStagePointerDown}
                    onPointerMove={move}
                    onPointerLeave={() => {
                        if (!painting.current) setCursorPos(null);
                    }}
                    onPointerUp={e => {
                        if (painting.current) {
                            finishStroke();
                        }
                        dragging.current = false;
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                    }}
                    onPointerCancel={() => {
                        finishStroke();
                        dragging.current = false;
                    }}
                >
                    <canvas ref={after} className="stage-canvas" aria-label={t.processedCanvasAria} />
                    <canvas
                        ref={overlay}
                        width={Math.max(1, Math.round(layout.photoWidth))}
                        height={Math.max(1, Math.round(layout.photoHeight))}
                        className="mosaic-overlay-canvas"
                        style={{
                            left: `${left}%`,
                            top: `${top}%`,
                            width: `${(layout.photoWidth / layout.width) * 100}%`,
                            height: `${(layout.photoHeight / layout.height) * 100}%`,
                        }}
                    />
                    {mosaicTool && cursorPos && (
                        <div
                            className={`mosaic-brush-cursor${mosaicTool === 'erase' ? ' is-erase' : ''}`}
                            style={{
                                left: cursorPos.x,
                                top: cursorPos.y,
                                width: cssBrushRadius * 2,
                                height: cssBrushRadius * 2,
                            }}
                            aria-hidden="true"
                        />
                    )}
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
