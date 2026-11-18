import { useEffect, useRef, useState, type ReactNode } from 'react';
import { composeFrame, frameInfo, type FrameContent } from '../imaging/frame';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import type { MosaicPoint, MosaicStroke } from '../types/mosaic';
import type { MosaicToolMode } from './MosaicPanel';
import {
    INITIAL_STAGE_TRANSFORM,
    MAX_STAGE_ZOOM,
    MIN_STAGE_ZOOM,
    clampStagePan,
    wheelZoomFactor,
    zoomStageByFactor,
    zoomStageTo,
    type StageBounds,
    type StageTransform,
} from './stageZoom';

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
    const [transform, setTransform] = useState<StageTransform>(INITIAL_STAGE_TRANSFORM);
    const { zoom, pan } = transform;
    const [isPanning, setIsPanning] = useState(false);
    const dragging = useRef(false);
    const painting = useRef(false);
    const panning = useRef(false);
    const panOrigin = useRef({ clientX: 0, clientY: 0, panX: 0, panY: 0 });
    const touchPointers = useRef(new Map<number, { x: number; y: number }>());
    const pinchDist = useRef<number | null>(null);
    const boundsRef = useRef<StageBounds>({ previewWidth: 0, stageHeight: 0, availableWidth: 0, availableHeight: 0 });
    const strokePoints = useRef<MosaicPoint[]>([]);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [view, setView] = useState<'effect' | 'compare' | 'original'>('effect');

    useEffect(() => {
        setView('effect');
        setSplit(0.5);
        setTransform(INITIAL_STAGE_TRANSFORM);
        touchPointers.current.clear();
        pinchDist.current = null;
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
    boundsRef.current = {
        previewWidth,
        stageHeight,
        availableWidth: available.width,
        availableHeight: available.height,
    };
    const normRadius = Math.max(0.008, mosaicBrushSize / 600);
    const cssBrushRadius =
        previewWidth > 0
            ? normRadius * Math.min(layout.photoWidth, layout.photoHeight) * (previewWidth / layout.width)
            : 16;

    function viewportAnchor(clientX: number, clientY: number) {
        const el = viewport.current;
        if (!el) return undefined;
        const rect = el.getBoundingClientRect();
        return {
            cx: clientX - (rect.left + rect.width / 2),
            cy: clientY - (rect.top + rect.height / 2),
        };
    }

    function applyZoom(nextZoomRaw: number) {
        setTransform(prev => zoomStageTo(prev, nextZoomRaw, boundsRef.current));
    }

    function resetZoom() {
        setTransform(INITIAL_STAGE_TRANSFORM);
    }

    useEffect(() => {
        const el = viewport.current;
        if (!el) return;
        let gestureScale = 1;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
            if (factor === 1) return;
            const anchor = viewportAnchor(e.clientX, e.clientY);
            setTransform(prev => zoomStageByFactor(prev, factor, boundsRef.current, anchor));
        };

        const onGestureStart = (e: Event) => {
            e.preventDefault();
            gestureScale = 1;
        };

        const onGestureChange = (e: Event) => {
            e.preventDefault();
            const ge = e as UIEvent & { scale?: number; clientX?: number; clientY?: number };
            const scale = ge.scale;
            if (!scale || !Number.isFinite(scale) || scale <= 0) return;
            const factor = scale / gestureScale;
            gestureScale = scale;
            const hasCoords =
                typeof ge.clientX === 'number' &&
                typeof ge.clientY === 'number' &&
                Number.isFinite(ge.clientX) &&
                Number.isFinite(ge.clientY) &&
                (ge.clientX !== 0 || ge.clientY !== 0);
            const anchor = hasCoords ? viewportAnchor(ge.clientX!, ge.clientY!) : undefined;
            setTransform(prev => zoomStageByFactor(prev, factor, boundsRef.current, anchor));
        };

        const onGestureEnd = (e: Event) => {
            e.preventDefault();
            gestureScale = 1;
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('gesturestart', onGestureStart, { passive: false });
        el.addEventListener('gesturechange', onGestureChange, { passive: false });
        el.addEventListener('gestureend', onGestureEnd, { passive: false });
        return () => {
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('gesturestart', onGestureStart);
            el.removeEventListener('gesturechange', onGestureChange);
            el.removeEventListener('gestureend', onGestureEnd);
        };
    }, []);

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

    function releaseTouchPointer(e: React.PointerEvent) {
        if (e.pointerType !== 'touch') return;
        touchPointers.current.delete(e.pointerId);
        if (touchPointers.current.size < 2) {
            pinchDist.current = null;
        }
    }

    function handleStagePointerDown(e: React.PointerEvent) {
        if (e.pointerType === 'touch') {
            touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touchPointers.current.size === 2) {
                const [p1, p2] = Array.from(touchPointers.current.values());
                pinchDist.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if (painting.current) {
                    painting.current = false;
                    strokePoints.current = [];
                    clearLiveOverlay();
                }
                panning.current = false;
                setIsPanning(false);
                dragging.current = false;
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
            }
        }
        const wantPan = zoom > 1 && ((!mosaicTool && e.button === 0) || e.button === 1 || (mosaicTool && e.altKey));
        if (wantPan) {
            e.preventDefault();
            panning.current = true;
            setIsPanning(true);
            panOrigin.current = { clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
        }
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
        if (e.pointerType === 'touch' && touchPointers.current.has(e.pointerId)) {
            touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touchPointers.current.size === 2 && pinchDist.current !== null) {
                const [p1, p2] = Array.from(touchPointers.current.values());
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if (dist > 0 && pinchDist.current > 0) {
                    const factor = dist / pinchDist.current;
                    pinchDist.current = dist;
                    const anchor = viewportAnchor((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
                    setTransform(prev => zoomStageByFactor(prev, factor, boundsRef.current, anchor));
                }
                return;
            }
        }
        if (panning.current) {
            const dx = e.clientX - panOrigin.current.clientX;
            const dy = e.clientY - panOrigin.current.clientY;
            setTransform(prev => ({
                zoom: prev.zoom,
                pan: clampStagePan(
                    { x: panOrigin.current.panX + dx, y: panOrigin.current.panY + dy },
                    prev.zoom,
                    boundsRef.current,
                ),
            }));
            return;
        }
        if (mosaicTool) {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursorPos({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom });
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
                <div className="stage-toolbar-group">
                    <div className="stage-zoom-controls" role="group" aria-label="Zoom">
                        <button
                            type="button"
                            aria-label={t.zoomOutAria}
                            disabled={zoom <= MIN_STAGE_ZOOM}
                            onClick={() => applyZoom(zoom - 0.35)}
                        >
                            −
                        </button>
                        <button
                            type="button"
                            className="stage-zoom-readout"
                            aria-label={t.zoomResetAria}
                            onClick={resetZoom}
                            title={t.zoomResetAria}
                        >
                            {Math.round(zoom * 100) <= 100 ? t.zoomFitLabel : `${Math.round(zoom * 100)}%`}
                        </button>
                        <button
                            type="button"
                            aria-label={t.zoomInAria}
                            disabled={zoom >= MAX_STAGE_ZOOM}
                            onClick={() => applyZoom(zoom + 0.35)}
                        >
                            +
                        </button>
                    </div>
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
            </div>
            <div className="stage-viewport" ref={viewport}>
                <div
                    className={`stage-inner${mosaicTool ? ' is-painting' : ''}${zoom > 1 && !mosaicTool ? ' can-pan' : ''}${isPanning ? ' is-panning' : ''}`}
                    style={{
                        width: previewWidth,
                        height: stageHeight,
                        transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                    }}
                    onDoubleClick={() => {
                        if (!mosaicTool && zoom > 1) resetZoom();
                    }}
                    onPointerDown={handleStagePointerDown}
                    onPointerMove={move}
                    onPointerLeave={() => {
                        if (!painting.current) setCursorPos(null);
                    }}
                    onPointerUp={e => {
                        releaseTouchPointer(e);
                        if (painting.current) {
                            finishStroke();
                        }
                        if (panning.current) {
                            panning.current = false;
                            setIsPanning(false);
                        }
                        dragging.current = false;
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                    }}
                    onPointerCancel={e => {
                        releaseTouchPointer(e);
                        finishStroke();
                        panning.current = false;
                        setIsPanning(false);
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
                                e.stopPropagation();
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
            <div className="stage-hint">{t.hintHoldSpace}</div>
        </div>
    );
}
