import { describe, expect, it } from 'vitest';
import { CAPTIONS, captionText, filterCaptions, pickRandomCaption, validateCaptionLibrary } from '../src/config/captions';

describe('caption library', () => {
    it('has complete, unique bilingual themes', () => {
        expect(validateCaptionLibrary()).toEqual([]);
        expect(CAPTIONS).toHaveLength(48);
        expect(filterCaptions({ theme: 'nature', language: 'en' })).toHaveLength(2);
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
        expect(selected.id).toBe(candidates[1].id);
        expect(candidates).toContain(pickRandomCaption(candidates, candidates.map(caption => caption.id)));
    });
});
