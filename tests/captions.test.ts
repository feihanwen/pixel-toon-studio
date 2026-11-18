import { describe, expect, it } from 'vitest';
import {
    CAPTIONS,
    captionText,
    customCaptionId,
    customCaptionValue,
    dialogRandomCandidates,
    filterCaptions,
    getCaption,
    isCustomCaptionId,
    pickRandomCaption,
    randomCaption,
    randomCaptionPool,
    validateCaptionLibrary,
} from '../src/config/captions';

describe('caption library', () => {
    it('has complete, unique bilingual themes with 100 zh and 100 en captions', () => {
        expect(validateCaptionLibrary()).toEqual([]);
        expect(CAPTIONS).toHaveLength(200);
        expect(filterCaptions({ language: 'zh' })).toHaveLength(100);
        expect(filterCaptions({ language: 'en' })).toHaveLength(100);
        expect(filterCaptions({ theme: 'nature', language: 'en' })).toHaveLength(10);
        expect(filterCaptions({ theme: 'mood', language: 'zh' })).toHaveLength(10);
        expect(filterCaptions({ theme: 'healing', language: 'en' })).toHaveLength(10);
    });
    it('randomizes bilingual in zh mode and english-only in en mode unless zh is chosen', () => {
        const zhPool = randomCaptionPool('zh');
        const enPool = randomCaptionPool('en');
        expect(zhPool).toHaveLength(200);
        expect(enPool).toHaveLength(100);
        expect(enPool.every(caption => caption.language === 'en')).toBe(true);

        for (let i = 0; i < 20; i++) {
            const id = randomCaption(undefined, 'en');
            expect(getCaption(id)?.language).toBe('en');
        }

        const allOptions = filterCaptions({ language: 'all', theme: 'mood' });
        expect(dialogRandomCandidates(allOptions, 'zh', 'all')).toHaveLength(20);
        const enDialogPool = dialogRandomCandidates(allOptions, 'en', 'all');
        expect(enDialogPool).toHaveLength(10);
        expect(enDialogPool.every(caption => caption.language === 'en')).toBe(true);

        const zhExplicit = filterCaptions({ language: 'zh', theme: 'mood' });
        const zhDialogPool = dialogRandomCandidates(zhExplicit, 'en', 'zh');
        expect(zhDialogPool).toHaveLength(10);
        expect(zhDialogPool.every(caption => caption.language === 'zh')).toBe(true);
    });
    it('replaces retired captions with the new selection and keeps sources', () => {
        expect(captionText('c1')).toBe(CAPTIONS[0].text);
        expect(captionText('zh-daily-01')).toBe(CAPTIONS[0].text);
        expect(CAPTIONS.every(caption => caption.source && new URL(caption.sourceUrl).protocol === 'https:')).toBe(true);
        expect(captionText('missing')).toBe(CAPTIONS[0].text);
    });
    it('randomizes only within the selected candidates and avoids recent items', () => {
        const candidates = filterCaptions({ theme: 'city', language: 'en' });
        const selected = pickRandomCaption(candidates, [candidates[0].id]);
        expect(candidates).toContain(selected);
        expect(selected.id).not.toBe(candidates[0].id);
        const onlySecond = pickRandomCaption(
            candidates,
            candidates.filter((_, idx) => idx !== 1).map(caption => caption.id),
        );
        expect(onlySecond.id).toBe(candidates[1].id);
        expect(candidates).toContain(pickRandomCaption(candidates, candidates.map(caption => caption.id)));
    });
    it('supports custom frame captions with normalization and length limits', () => {
        const id = customCaptionId('  Kyoto · 2026\n雨巷  ');
        expect(isCustomCaptionId(id)).toBe(true);
        expect(customCaptionValue(id)).toBe('Kyoto · 2026 雨巷');
        expect(captionText(id)).toBe('Kyoto · 2026 雨巷');
        expect(customCaptionId('   ')).toBe(CAPTIONS[0].id);
        expect(isCustomCaptionId('custom:   ')).toBe(false);
    });
});
