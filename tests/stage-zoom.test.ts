import { describe, expect, it } from 'vitest';
import {
    INITIAL_STAGE_TRANSFORM,
    MAX_STAGE_ZOOM,
    MIN_STAGE_ZOOM,
    panAndZoomStage,
    wheelZoomFactor,
    zoomStageByFactor,
    zoomStageTo,
    type StageBounds,
} from '../src/components/stageZoom';

const BOUNDS: StageBounds = {
    previewWidth: 800,
    stageHeight: 600,
    availableWidth: 900,
    availableHeight: 700,
};

describe('stageZoom', () => {
    it('accumulates small trackpad pinch deltas smoothly from 1x without snapping back', () => {
        let state = INITIAL_STAGE_TRANSFORM;
        const factor = wheelZoomFactor(-2, 0, true);
        expect(factor).toBeGreaterThan(1.01);
        expect(factor).toBeLessThan(1.03);

        for (let i = 0; i < 10; i++) {
            state = zoomStageByFactor(state, factor, BOUNDS, { cx: 120, cy: -80 });
        }

        expect(state.zoom).toBeGreaterThan(1.2);
        expect(state.zoom).toBeLessThanOrEqual(MAX_STAGE_ZOOM);
    });

    it('gives trackpad pinch (ctrlKey) higher sensitivity than regular scroll wheel', () => {
        const pinchFactor = wheelZoomFactor(-4, 0, true);
        const scrollFactor = wheelZoomFactor(-4, 0, false);
        expect(pinchFactor).toBeGreaterThan(scrollFactor);
    });

    it('snaps cleanly back to fit (1x) and resets pan when zooming out near 1x', () => {
        const zoomed = zoomStageTo(INITIAL_STAGE_TRANSFORM, 1.015, BOUNDS, { cx: 100, cy: 50 });
        expect(zoomed.zoom).toBe(1.015);

        const outFactor = wheelZoomFactor(1, 0, true);
        const snapped = zoomStageByFactor(zoomed, outFactor, BOUNDS, { cx: 100, cy: 50 });
        expect(snapped).toEqual({ zoom: MIN_STAGE_ZOOM, pan: { x: 0, y: 0 } });
    });

    it('keeps the cursor anchor stationary when zooming in within bounds', () => {
        const anchor = { cx: 120, cy: -60 };
        const step1 = zoomStageTo(INITIAL_STAGE_TRANSFORM, 2, BOUNDS, anchor);
        expect(step1.zoom).toBe(2);
        expect(step1.pan.x).toBeCloseTo(-120, 5);
        expect(step1.pan.y).toBeCloseTo(60, 5);

        const step2 = zoomStageTo(step1, 3, BOUNDS, anchor);
        expect(step2.zoom).toBe(3);
        expect(step2.pan.x).toBeCloseTo(-240, 5);
        expect(step2.pan.y).toBeCloseTo(120, 5);
    });

    it('normalizes line-based wheel deltas and clamps extreme values', () => {
        expect(wheelZoomFactor(0, 0, false)).toBe(1);
        expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(wheelZoomFactor(-48, 0, false), 10);
        expect(wheelZoomFactor(-5000, 0, true)).toBeCloseTo(wheelZoomFactor(-250, 0, true), 10);
    });

    it('simultaneously zooms and pans when two-finger pinch midpoint translates', () => {
        const start = zoomStageTo(INITIAL_STAGE_TRANSFORM, 2, BOUNDS, { cx: 0, cy: 0 });
        const prevAnchor = { cx: 40, cy: -20 };
        const nextAnchor = { cx: 90, cy: 30 };

        const next = panAndZoomStage(start, 1.25, BOUNDS, prevAnchor, nextAnchor);
        expect(next.zoom).toBe(2.5);
        // Image point under (40, -20) at 2x was (20, -10); at 2.5x it moves to (90, 30) -> pan = (90 - 50, 30 - (-25)) = (40, 55)
        expect(next.pan.x).toBeCloseTo(40, 5);
        expect(next.pan.y).toBeCloseTo(55, 5);
    });

    it('continues panning smoothly at max zoom even when pinch factor exceeds max', () => {
        const atMax = zoomStageTo(INITIAL_STAGE_TRANSFORM, MAX_STAGE_ZOOM, BOUNDS, { cx: 0, cy: 0 });
        const next = panAndZoomStage(atMax, 1.5, BOUNDS, { cx: 0, cy: 0 }, { cx: 35, cy: -25 });
        expect(next.zoom).toBe(MAX_STAGE_ZOOM);
        expect(next.pan.x).toBeCloseTo(35, 5);
        expect(next.pan.y).toBeCloseTo(-25, 5);
    });

    it('snaps pan back to zero when pinch-out returns to fit (1x)', () => {
        const zoomed = zoomStageTo(INITIAL_STAGE_TRANSFORM, 1.015, BOUNDS, { cx: 80, cy: 40 });
        const snapped = panAndZoomStage(zoomed, 0.99, BOUNDS, { cx: 80, cy: 40 }, { cx: 90, cy: 50 });
        expect(snapped).toEqual(INITIAL_STAGE_TRANSFORM);
    });
});
