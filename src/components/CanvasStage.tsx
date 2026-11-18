import { useEffect, useRef, useState, type ReactNode } from 'react';
import { composeFrame, frameInfo, type FrameContent } from '../imaging/frame';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import type { MosaicPoint, MosaicStroke } from '../types/mosaic';
import type { MosaicToolMode } from './MosaicPanel';
import { StudioIcon } from './StudioIcon';
import {
    INITIAL_STAGE_TRANSFORM,
    MAX_STAGE_ZOOM,
    MIN_STAGE_ZOOM,
    clampStagePan,
    panAndZoomStage,
    wheelZoomFactor,
    zoomStageByFactor,
    zoomStageTo,
    type StageBounds,
    type StageTransform,
    type ZoomAnchor,
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

const COMPARE_GAP = 12;
const DOUBLE_TAP_ZOOM = 2.2;
type StageViewMode = 'effect' | 'split' | 'sideBySide';

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
    const mosaicSurfaceRef = useRef<HTMLDivElement>(null);
    const [split, setSplit] = useState(0.5);
    const [transform, setTransform] = useState<StageTransform>(INITIAL_STAGE_TRANSFORM);
    const transformRef = useRef<StageTransform>(INITIAL_STAGE_TRANSFORM);
    transformRef.current = transform;
    const { zoom, pan } = transform;
    const [isPanning, setIsPanning] = useState(false);
    const [touchInputDetected, setTouchInputDetected] = useState(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)').matches
            : false,
    );
    const dragging = useRef(false);
    const painting = useRef(false);
    const panning = useRef(false);
    const panOrigin = useRef({ clientX: 0, clientY: 0, panX: 0, panY: 0 });
    const touchPointers = useRef(new Map<number, { x: number; y: number }>());
    const pinchState = useRef<{ dist: number; midX: number; midY: number } | null>(null);
    const pinchAnchorEl = useRef<Element | null>(null);
    const wasMultiTouch = useRef(false);
    const tapCandidate = useRef<{
        id: number;
        startX: number;
        startY: number;
        startTime: number;
        moved: boolean;
        anchorEl: Element | null;
    } | null>(null);
    const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
    const lastTouchEndTime = useRef(0);
    const boundsRef = useRef<StageBounds>({ previewWidth: 0, stageHeight: 0, availableWidth: 0, availableHeight: 0 });
    const strokePoints = useRef<MosaicPoint[]>([]);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [view, setView] = useState<StageViewMode>('effect');

    useEffect(() => {
        setView('effect');
        setSplit(0.5);
        setTransform(INITIAL_STAGE_TRANSFORM);
        touchPointers.current.clear();
        pinchState.current = null;
        pinchAnchorEl.current = null;
        wasMultiTouch.current = false;
        tapCandidate.current = null;
    }, [original, resultKey]);

    const sideBySide = view === 'sideBySide';
    const originalVisible = showOriginal && !sideBySide;
    const comparing = !showOriginal && view === 'split';
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

    const paneMaxWidth = sideBySide ? Math.max(0, (available.width - COMPARE_GAP) / 2) : available.width;
    const previewWidth = Math.min(paneMaxWidth, (available.height * layout.width) / layout.height);

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
        view,
    ]);

    const left = (layout.x / layout.width) * 100;
    const right = ((layout.width - layout.x - layout.photoWidth * split) / layout.width) * 100;
    const top = (layout.y / layout.height) * 100;
    const bottom = ((layout.height - layout.y - layout.photoHeight) / layout.height) * 100;
    const stageHeight = previewWidth > 0 ? (previewWidth * layout.height) / layout.width : 0;
    boundsRef.current = {
        previewWidth,
        stageHeight,
        availableWidth: paneMaxWidth,
        availableHeight: available.height,
    };

    useEffect(() => {
        setTransform(prev => {
            const clamped = clampStagePan(prev.pan, prev.zoom, boundsRef.current);
            if (clamped.x === prev.pan.x && clamped.y === prev.pan.y) return prev;
            return { zoom: prev.zoom, pan: clamped };
        });
    }, [view, previewWidth, stageHeight]);
    const normRadius = Math.max(0.008, mosaicBrushSize / 600);
    const cssBrushRadius =
        previewWidth > 0
            ? normRadius * Math.min(layout.photoWidth, layout.photoHeight) * (previewWidth / layout.width)
            : 16;

    function resolveAnchorElement(target?: EventTarget | null): Element | null {
        const pane = target instanceof Element ? target.closest('.stage-compare-pane') : null;
        return pane ?? viewport.current;
    }

    function viewportAnchorForEl(clientX: number, clientY: number, el: Element | null): ZoomAnchor | undefined {
        if (!el) return undefined;
        const rect = el.getBoundingClientRect();
        return {
            cx: clientX - (rect.left + rect.width / 2),
            cy: clientY - (rect.top + rect.height / 2),
        };
    }

    function viewportAnchor(clientX: number, clientY: number, target?: EventTarget | null) {
        return viewportAnchorForEl(clientX, clientY, resolveAnchorElement(target));
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
            const anchor = viewportAnchor(e.clientX, e.clientY, e.target);
            setTransform(prev => zoomStageByFactor(prev, factor, boundsRef.current, anchor));
        };

        const onGestureStart = (e: Event) => {
            e.preventDefault();
            gestureScale = 1;
        };

        const onGestureChange = (e: Event) => {
            e.preventDefault();
            if (touchPointers.current.size >= 2) return;
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
            const anchor = hasCoords ? viewportAnchor(ge.clientX!, ge.clientY!, e.target) : undefined;
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

    function clientToMosaicNorm(clientX: number, clientY: number, surface: Element | null): MosaicPoint | null {
        if (!surface) return null;
        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const cx = ((clientX - rect.left) * layout.width) / rect.width;
        const cy = ((clientY - rect.top) * layout.height) / rect.height;
        const nx = (cx - layout.x) / layout.photoWidth;
        const ny = (cy - layout.y) / layout.photoHeight;
        return {
            x: Math.max(0, Math.min(1, nx)),
            y: Math.max(0, Math.min(1, ny)),
        };
    }

    function updateSplitAt(clientX: number) {
        const surface = mosaicSurfaceRef.current;
        if (!surface) return;
        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0) return;
        const x = ((clientX - rect.left) * layout.width) / rect.width;
        setSplit(Math.max(0, Math.min(1, (x - layout.x) / layout.photoWidth)));
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

    function captureViewportPointer(pointerId: number) {
        try {
            viewport.current?.setPointerCapture(pointerId);
        } catch {
            // Ignore synthetic or non-capturable pointers
        }
    }

    function releaseViewportPointer(pointerId: number) {
        try {
            if (viewport.current?.hasPointerCapture(pointerId)) {
                viewport.current.releasePointerCapture(pointerId);
            }
        } catch {
            // Ignore release errors
        }
    }

    function handleViewportPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.pointerType === 'touch') {
            if (!touchInputDetected) setTouchInputDetected(true);
            touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            lastTouchEndTime.current = Date.now();

            if (touchPointers.current.size === 2) {
                const [p1, p2] = Array.from(touchPointers.current.values());
                pinchState.current = {
                    dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
                    midX: (p1.x + p2.x) / 2,
                    midY: (p1.y + p2.y) / 2,
                };
                pinchAnchorEl.current = resolveAnchorElement(e.target);
                wasMultiTouch.current = true;
                tapCandidate.current = null;
                if (painting.current) {
                    painting.current = false;
                    strokePoints.current = [];
                    clearLiveOverlay();
                }
                panning.current = false;
                setIsPanning(false);
                dragging.current = false;
                captureViewportPointer(e.pointerId);
                return;
            }

            if (touchPointers.current.size === 1) {
                const targetEl = e.target instanceof Element ? e.target : null;
                if (comparing && targetEl?.closest('.compare-line')) {
                    e.preventDefault();
                    dragging.current = true;
                    tapCandidate.current = null;
                    updateSplitAt(e.clientX);
                    captureViewportPointer(e.pointerId);
                    return;
                }

                if (mosaicTool && !wasMultiTouch.current && targetEl && mosaicSurfaceRef.current?.contains(targetEl)) {
                    const pt = clientToMosaicNorm(e.clientX, e.clientY, mosaicSurfaceRef.current);
                    if (pt) {
                        e.preventDefault();
                        painting.current = true;
                        strokePoints.current = [pt];
                        tapCandidate.current = null;
                        captureViewportPointer(e.pointerId);
                        drawLiveOverlay(strokePoints.current);
                        return;
                    }
                }

                tapCandidate.current = {
                    id: e.pointerId,
                    startX: e.clientX,
                    startY: e.clientY,
                    startTime: Date.now(),
                    moved: false,
                    anchorEl: resolveAnchorElement(e.target),
                };
                if (transformRef.current.zoom > 1 && !mosaicTool) {
                    panning.current = true;
                    setIsPanning(true);
                    panOrigin.current = {
                        clientX: e.clientX,
                        clientY: e.clientY,
                        panX: transformRef.current.pan.x,
                        panY: transformRef.current.pan.y,
                    };
                }
                captureViewportPointer(e.pointerId);
                return;
            }
            return;
        }

        const targetEl = e.target instanceof Element ? e.target : null;
        if (comparing && e.button === 0 && targetEl?.closest('.compare-line')) {
            e.preventDefault();
            dragging.current = true;
            updateSplitAt(e.clientX);
            captureViewportPointer(e.pointerId);
            return;
        }

        const currentZoom = transformRef.current.zoom;
        const wantPan = currentZoom > 1 && ((!mosaicTool && e.button === 0) || e.button === 1 || (mosaicTool && e.altKey));
        if (wantPan) {
            e.preventDefault();
            panning.current = true;
            setIsPanning(true);
            panOrigin.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                panX: transformRef.current.pan.x,
                panY: transformRef.current.pan.y,
            };
            captureViewportPointer(e.pointerId);
            return;
        }

        if (!mosaicTool || e.button !== 0) return;
        if (!targetEl || !mosaicSurfaceRef.current?.contains(targetEl)) return;
        const pt = clientToMosaicNorm(e.clientX, e.clientY, mosaicSurfaceRef.current);
        if (!pt) return;
        e.preventDefault();
        painting.current = true;
        strokePoints.current = [pt];
        captureViewportPointer(e.pointerId);
        drawLiveOverlay(strokePoints.current);
    }

    function handleViewportPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (e.pointerType === 'touch' && touchPointers.current.has(e.pointerId)) {
            touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (tapCandidate.current?.id === e.pointerId && !tapCandidate.current.moved) {
                if (Math.hypot(e.clientX - tapCandidate.current.startX, e.clientY - tapCandidate.current.startY) > 8) {
                    tapCandidate.current.moved = true;
                }
            }

            if (touchPointers.current.size === 2 && pinchState.current) {
                const [p1, p2] = Array.from(touchPointers.current.values());
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const prevPinch = pinchState.current;
                const factor = prevPinch.dist > 0 && dist > 0 ? dist / prevPinch.dist : 1;
                const anchorEl = pinchAnchorEl.current ?? viewport.current;
                const prevAnchor = viewportAnchorForEl(prevPinch.midX, prevPinch.midY, anchorEl);
                const nextAnchor = viewportAnchorForEl(midX, midY, anchorEl);
                pinchState.current = { dist, midX, midY };
                if (prevAnchor && nextAnchor) {
                    setTransform(prev => panAndZoomStage(prev, factor, boundsRef.current, prevAnchor, nextAnchor));
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

        if (dragging.current) {
            updateSplitAt(e.clientX);
            return;
        }

        if (mosaicTool && mosaicSurfaceRef.current) {
            if (e.pointerType !== 'touch' || painting.current) {
                const rect = mosaicSurfaceRef.current.getBoundingClientRect();
                setCursorPos({
                    x: (e.clientX - rect.left) / transformRef.current.zoom,
                    y: (e.clientY - rect.top) / transformRef.current.zoom,
                });
            }
            if (painting.current) {
                const pt = clientToMosaicNorm(e.clientX, e.clientY, mosaicSurfaceRef.current);
                if (pt) {
                    const last = strokePoints.current[strokePoints.current.length - 1];
                    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 0.004) {
                        strokePoints.current.push(pt);
                        drawLiveOverlay(strokePoints.current);
                    }
                }
            }
        }
    }

    function handleViewportPointerEnd(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
        if (e.pointerType === 'touch') {
            lastTouchEndTime.current = Date.now();
            touchPointers.current.delete(e.pointerId);

            const candidate = tapCandidate.current;
            if (candidate && candidate.id === e.pointerId) {
                tapCandidate.current = null;
                if (!cancelled && !candidate.moved && !wasMultiTouch.current && !mosaicTool && Date.now() - candidate.startTime < 300) {
                    const prevTap = lastTapRef.current;
                    if (
                        prevTap &&
                        Date.now() - prevTap.time < 320 &&
                        Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 32
                    ) {
                        lastTapRef.current = null;
                        if (transformRef.current.zoom > 1.05) {
                            resetZoom();
                        } else {
                            const anchor = viewportAnchorForEl(e.clientX, e.clientY, candidate.anchorEl);
                            setTransform(prev => zoomStageTo(prev, DOUBLE_TAP_ZOOM, boundsRef.current, anchor));
                        }
                    } else {
                        lastTapRef.current = { time: Date.now(), x: e.clientX, y: e.clientY };
                    }
                }
            }

            if (touchPointers.current.size < 2) {
                pinchState.current = null;
                pinchAnchorEl.current = null;
            }

            if (touchPointers.current.size === 1 && !mosaicTool && transformRef.current.zoom > 1) {
                const [remaining] = Array.from(touchPointers.current.values());
                panning.current = true;
                setIsPanning(true);
                panOrigin.current = {
                    clientX: remaining.x,
                    clientY: remaining.y,
                    panX: transformRef.current.pan.x,
                    panY: transformRef.current.pan.y,
                };
            } else if (touchPointers.current.size === 0) {
                wasMultiTouch.current = false;
                panning.current = false;
                setIsPanning(false);
                setCursorPos(null);
            }
        } else if (panning.current) {
            panning.current = false;
            setIsPanning(false);
        }

        if (painting.current) {
            finishStroke();
        }
        dragging.current = false;
        releaseViewportPointer(e.pointerId);
    }

    function handleDoubleClick() {
        if (Date.now() - lastTouchEndTime.current < 450) return;
        if (!mosaicTool && zoom > 1) resetZoom();
    }

    const stageStyle = {
        width: previewWidth,
        height: stageHeight,
        transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
    };

    const mosaicOverlayNodes = (
        <>
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
        </>
    );

    return (
        <div className="stage-outer">
            <div className="work-heading">
                {heading}
                <div className="stage-zoom-controls" role="group" aria-label={t.zoomControlsAria}>
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
            </div>
            <div
                className="stage-viewport"
                ref={viewport}
                onPointerDown={handleViewportPointerDown}
                onPointerMove={handleViewportPointerMove}
                onPointerUp={e => handleViewportPointerEnd(e, false)}
                onPointerCancel={e => handleViewportPointerEnd(e, true)}
            >
                {sideBySide ? (
                    <div className="stage-compare-pair" style={{ gap: COMPARE_GAP }}>
                        <div className="stage-compare-pane" style={{ width: previewWidth, height: stageHeight }}>
                            <div
                                className={`stage-inner${zoom > 1 ? ' can-pan' : ''}${isPanning ? ' is-panning' : ''}`}
                                style={stageStyle}
                                onDoubleClick={handleDoubleClick}
                            >
                                <canvas ref={before} className="stage-canvas" aria-label={t.originalCanvasAria} />
                            </div>
                            <span className="stage-corner left">{t.cornerOriginal}</span>
                        </div>
                        <div className="stage-compare-pane" style={{ width: previewWidth, height: stageHeight }}>
                            <div
                                ref={mosaicSurfaceRef}
                                className={`stage-inner${mosaicTool ? ' is-painting' : ''}${zoom > 1 && !mosaicTool ? ' can-pan' : ''}${isPanning ? ' is-panning' : ''}`}
                                style={stageStyle}
                                onDoubleClick={handleDoubleClick}
                                onPointerLeave={() => {
                                    if (!painting.current) setCursorPos(null);
                                }}
                            >
                                <canvas ref={after} className="stage-canvas" aria-label={t.processedCanvasAria} />
                                {mosaicOverlayNodes}
                            </div>
                            {processing && (
                                <div className="stage-processing">
                                    <span className="pulse-dot" /> {t.renderingPreview}
                                </div>
                            )}
                            <span className="stage-corner right">{t.cornerProcessed}</span>
                        </div>
                    </div>
                ) : (
                    <div
                        ref={mosaicSurfaceRef}
                        className={`stage-inner${mosaicTool ? ' is-painting' : ''}${zoom > 1 && !mosaicTool ? ' can-pan' : ''}${isPanning ? ' is-panning' : ''}`}
                        style={stageStyle}
                        onDoubleClick={handleDoubleClick}
                        onPointerLeave={() => {
                            if (!painting.current) setCursorPos(null);
                        }}
                    >
                        <canvas ref={after} className="stage-canvas" aria-label={t.processedCanvasAria} />
                        {mosaicOverlayNodes}
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
                )}
            </div>
            <div className="stage-footer">
                <div className="stage-view-actions" role="group" aria-label={t.previewModeGroupAria}>
                    <button
                        type="button"
                        className="stage-view-btn"
                        aria-pressed={view === 'split'}
                        onClick={() => {
                            setView(prev => (prev === 'split' ? 'effect' : 'split'));
                            setSplit(0.5);
                        }}
                    >
                        <StudioIcon name="split" size={14} />
                        <span>{t.viewSplit}</span>
                    </button>
                    <button
                        type="button"
                        className="stage-view-btn"
                        aria-pressed={view === 'sideBySide'}
                        onClick={() => setView(prev => (prev === 'sideBySide' ? 'effect' : 'sideBySide'))}
                    >
                        <StudioIcon name="compare" size={14} />
                        <span>{t.viewSideBySide}</span>
                    </button>
                </div>
                <div className="stage-hint">{touchInputDetected ? t.hintTouchGestures : t.hintHoldSpace}</div>
            </div>
        </div>
    );
}
