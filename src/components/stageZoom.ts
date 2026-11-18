export const MIN_STAGE_ZOOM = 1;
export const MAX_STAGE_ZOOM = 5;

export interface StagePan {
    x: number;
    y: number;
}

export interface StageTransform {
    zoom: number;
    pan: StagePan;
}

export interface StageBounds {
    previewWidth: number;
    stageHeight: number;
    availableWidth: number;
    availableHeight: number;
}

export interface ZoomAnchor {
    cx: number;
    cy: number;
}

export const INITIAL_STAGE_TRANSFORM: StageTransform = {
    zoom: MIN_STAGE_ZOOM,
    pan: { x: 0, y: 0 },
};

/** Clamp stage pan offsets within the zoomed viewport bounds. */
export function clampStagePan(pan: StagePan, zoom: number, bounds: StageBounds): StagePan {
    if (zoom <= 1.001 || bounds.previewWidth <= 0 || bounds.stageHeight <= 0) {
        return { x: 0, y: 0 };
    }
    const maxX =
        Math.max(
            (bounds.previewWidth * (zoom - 1)) / 2,
            (bounds.previewWidth * zoom - bounds.availableWidth) / 2,
        ) + 48;
    const maxY =
        Math.max(
            (bounds.stageHeight * (zoom - 1)) / 2,
            (bounds.stageHeight * zoom - bounds.availableHeight) / 2,
        ) + 48;
    return {
        x: Math.max(-maxX, Math.min(maxX, pan.x)),
        y: Math.max(-maxY, Math.min(maxY, pan.y)),
    };
}

/**
 * Convert a wheel or trackpad pinch delta into a multiplicative zoom factor.
 * Trackpad pinch-to-zoom arrives with ctrlKey=true and small pixel deltas, so it
 * uses higher sensitivity than regular wheel scrolling.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
    const unitScale = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
    const normalizedDelta = deltaY * unitScale;
    const sensitivity = ctrlKey ? 0.01 : 0.0018;
    const clampedDelta = Math.max(-250, Math.min(250, normalizedDelta));
    return Math.exp(-clampedDelta * sensitivity);
}

/**
 * Apply a multiplicative zoom factor around an optional viewport-centered anchor.
 * Only snaps to fit (1x) while zooming out so small trackpad increments from 1x
 * accumulate smoothly instead of snapping back.
 */
export function zoomStageByFactor(
    prev: StageTransform,
    factor: number,
    bounds: StageBounds,
    anchor?: ZoomAnchor,
): StageTransform {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return prev;
    const candidate = prev.zoom * factor;
    const nextZoom =
        factor < 1 && candidate <= 1.02
            ? MIN_STAGE_ZOOM
            : Math.max(MIN_STAGE_ZOOM, Math.min(MAX_STAGE_ZOOM, Number(candidate.toFixed(4))));

    if (nextZoom === prev.zoom) return prev;
    if (nextZoom === MIN_STAGE_ZOOM) {
        return INITIAL_STAGE_TRANSFORM;
    }

    const nextPan = anchor
        ? {
              x: anchor.cx - ((anchor.cx - prev.pan.x) / prev.zoom) * nextZoom,
              y: anchor.cy - ((anchor.cy - prev.pan.y) / prev.zoom) * nextZoom,
          }
        : {
              x: (prev.pan.x / prev.zoom) * nextZoom,
              y: (prev.pan.y / prev.zoom) * nextZoom,
          };

    return {
        zoom: nextZoom,
        pan: clampStagePan(nextPan, nextZoom, bounds),
    };
}

/** Zoom directly to a target scale level around an optional anchor. */
export function zoomStageTo(
    prev: StageTransform,
    targetZoom: number,
    bounds: StageBounds,
    anchor?: ZoomAnchor,
): StageTransform {
    if (!Number.isFinite(targetZoom) || prev.zoom <= 0) return prev;
    return zoomStageByFactor(prev, targetZoom / prev.zoom, bounds, anchor);
}

/**
 * Simultaneously pinch-zoom by `factor` and pan as the gesture midpoint moves
 * from `prevAnchor` to `nextAnchor` (both relative to viewport/pane center).
 */
export function panAndZoomStage(
    prev: StageTransform,
    factor: number,
    bounds: StageBounds,
    prevAnchor: ZoomAnchor,
    nextAnchor: ZoomAnchor,
): StageTransform {
    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    const candidate = prev.zoom * safeFactor;
    const nextZoom =
        safeFactor < 1 && candidate <= 1.02
            ? MIN_STAGE_ZOOM
            : Math.max(MIN_STAGE_ZOOM, Math.min(MAX_STAGE_ZOOM, Number(candidate.toFixed(4))));

    if (nextZoom === MIN_STAGE_ZOOM) {
        return INITIAL_STAGE_TRANSFORM;
    }

    const nextPan = {
        x: nextAnchor.cx - ((prevAnchor.cx - prev.pan.x) / prev.zoom) * nextZoom,
        y: nextAnchor.cy - ((prevAnchor.cy - prev.pan.y) / prev.zoom) * nextZoom,
    };

    return {
        zoom: nextZoom,
        pan: clampStagePan(nextPan, nextZoom, bounds),
    };
}
