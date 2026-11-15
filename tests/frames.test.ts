import { describe, expect, it } from 'vitest';
import {
    DEFAULT_FRAME_STYLE_ID,
    FRAME_CATEGORIES,
    FRAME_STYLES,
    filterFrameStyles,
    getFrameStyle,
    isKnownFrameStyleId,
    pickRandomFrameStyle,
} from '../src/config/frames';
import { frameInfo } from '../src/imaging/frame';

describe('polaroid frame style library', () => {
    it('contains the 27 selected styles across 6 categories with unique ids and codes', () => {
        expect(FRAME_STYLES).toHaveLength(27);
        const ids = new Set(FRAME_STYLES.map(s => s.id));
        const codes = new Set(FRAME_STYLES.map(s => s.code));
        expect(ids.size).toBe(27);
        expect(codes.size).toBe(27);
        expect(Array.from(codes)).toEqual([
            '#01', '#02', '#03', '#04', '#05', '#06',
            '#07', '#08', '#11', '#12',
            '#13', '#15', '#16', '#17',
            '#19', '#20', '#21', '#22', '#23',
            '#25', '#27', '#28', '#29',
            '#31', '#33', '#35', '#36',
        ]);
        for (const cat of Object.keys(FRAME_CATEGORIES) as Array<keyof typeof FRAME_CATEGORIES>) {
            expect(filterFrameStyles(cat).length).toBeGreaterThanOrEqual(4);
        }
    });

    it('falls back to classic-ivory for unknown ids and randomizes without repeating recent styles', () => {
        expect(isKnownFrameStyleId('cyber-neon')).toBe(true);
        expect(isKnownFrameStyleId('unknown-frame')).toBe(false);
        expect(getFrameStyle('unknown-frame').id).toBe(DEFAULT_FRAME_STYLE_ID);

        const gradientCandidates = filterFrameStyles('gradient');
        const picked = pickRandomFrameStyle(
            gradientCandidates,
            gradientCandidates.slice(0, -1).map(s => s.id),
        );
        expect(picked.id).toBe(gradientCandidates[gradientCandidates.length - 1].id);
    });

    it('automatically matches original photo aspect ratios (portrait, square, landscape, panoramic)', () => {
        for (const [w, h] of [
            [900, 1200],
            [1000, 1000],
            [1600, 1200],
            [1080, 1920],
        ] as const) {
            const layout = frameInfo(w, h, true);
            expect(layout.photoWidth).toBe(w);
            expect(layout.photoHeight).toBe(h);
            expect(layout.photoWidth / layout.photoHeight).toBeCloseTo(w / h, 5);
            expect(layout.width).toBeGreaterThan(w);
            expect(layout.height - layout.y - h).toBeGreaterThan(layout.x);
        }
    });
});
