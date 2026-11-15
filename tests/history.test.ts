import { describe, expect, it } from 'vitest';
import { initialSnapshot, normalizeHistory, applySharedSettings, commit, moveHistory } from '../src/state/history';
import { CAPTIONS, customCaptionId } from '../src/config/captions';
import { defaultParams, STYLES } from '../src/config/styles';
import type { History } from '../src/types/document';

describe('saved workspace normalization', () => {
    it('keeps diffusion off for existing film edits and preserves it in new edits', () => {
        const old = initialSnapshot();
        old.styleId = 'film';
        old.params.film = { fade: 38, grain: 28, warmth: 24, halation: 22 };
        const restored = normalizeHistory({ entries: [old], cursor: 0 }).entries[0];
        expect(restored.params.film).toEqual({ ...old.params.film, smear: 0 });
        expect(initialSnapshot().params.film.smear).toBeGreaterThan(0);
        const current = initialSnapshot(); current.params.film.smear = 72;
        expect(normalizeHistory({ entries: [current], cursor: 0 }).entries[0].params.film.smear).toBe(72);
    });
    it('replaces retired captions and upgrades previous watercolor semantics', () => {
        const saved = initialSnapshot();
        saved.styleId = 'watercolor';
        saved.captionId = 'c2';
        saved.params.watercolor = { radius: 6, smear: 60, softness: 55, detail: 75 };
        const restored = normalizeHistory({ entries: [saved], cursor: 0 }, true).entries[0];
        expect(restored.captionId).toBe(CAPTIONS[0].id);
        expect(restored.params.watercolor).toEqual({ radius: 7, smear: 77, softness: 55, detail: 55 });
    });
    it('repairs missing or out-of-range values without losing the photo', () => {
        const saved = initialSnapshot();
        saved.params.watercolor.radius = 100;
        saved.params.watercolor.smear = Number.NaN;
        saved.captionId = 'unknown';
        const restored = normalizeHistory({ entries: [saved], cursor: 0 }).entries[0];
        expect(restored.params.watercolor.radius).toBe(12);
        expect(restored.params.watercolor.smear).toBe(78);
        expect(restored.captionId).toMatch(/^social-(zh|en)-/);
    });
    it('fills all v2 historical snapshots without changing saved choices or cursor', () => {
        const old = initialSnapshot(); old.styleId = 'watercolor'; old.captionId = 'c2'; old.params.cel.ink = 33;
        const raw = JSON.parse(JSON.stringify({ entries: [old, { ...old, styleId: 'pixel' }], cursor: 0 }));
        for (const entry of raw.entries) for (const id of ['manga', 'pencil', 'duotone', 'film']) delete entry.params[id];
        const migrated = normalizeHistory(raw);
        expect(migrated.cursor).toBe(0); expect(migrated.entries).toHaveLength(2);
        for (const entry of migrated.entries) {
            expect(Object.keys(entry.params)).toHaveLength(8);
            expect(entry.params.cel.ink).toBe(33); expect(entry.captionId).toBe(CAPTIONS[0].id);
            expect(entry.params.film).toEqual(defaultParams().film);
        }
        expect(migrated.entries[1].styleId).toBe('pixel');
        expect(normalizeHistory(migrated)).toEqual(migrated);
    });
    it('v1 missing values get current defaults without applying the legacy curve twice', () => {
        const raw = JSON.parse(JSON.stringify({ entries: [initialSnapshot()], cursor: 0 }));
        delete raw.entries[0].params.watercolor.smear;
        const migrated = normalizeHistory(raw, true);
        expect(migrated.entries[0].params.watercolor.smear).toBe(78);
        expect(normalizeHistory(migrated)).toEqual(migrated);
    });
    it('normalizes invalid new controls and keeps independent defaults per snapshot', () => {
        const one = initialSnapshot(), two = initialSnapshot();
        one.params.film.warmth = -200; one.params.duotone.shadowHue = 225.4; one.params.pencil.paper = NaN;
        const restored = normalizeHistory({ entries: [one, two], cursor: 1 });
        expect(restored.entries[0].params.film.warmth).toBe(-100);
        expect(restored.entries[0].params.duotone.shadowHue).toBe(225);
        expect(restored.entries[0].params.pencil.paper).toBe(24);
        restored.entries[0].params.film.warmth = 99;
        expect(restored.entries[1].params.film.warmth).toBe(24);
        expect(Object.keys(STYLES)).toHaveLength(8);
    });
    it('supports style switching, parameter history, undo and redo after migration', () => {
        let history: History = { entries: [initialSnapshot()], cursor: 0 };
        history = commit(history, { ...structuredClone(history.entries[0]), styleId: 'film' });
        const changed = structuredClone(history.entries[1]); changed.params.film.grain = 80;
        history = commit(history, changed);
        expect(moveHistory(history, -1).entries[1].params.film.grain).toBe(defaultParams().film.grain);
        history = moveHistory(history, -1); expect(history.cursor).toBe(1);
        history = moveHistory(history, 1); expect(history.entries[history.cursor].params.film.grain).toBe(80);
        expect(normalizeHistory(history)).toEqual(history);
    });
    it('preserves custom captions and syncs shared style settings across tabs without overwriting per-photo enhancement or EXIF state', () => {
        const source = initialSnapshot();
        source.styleId = 'watercolor';
        source.params.watercolor.radius = 10;
        source.global.brightness = 15;
        source.autoColor = { algorithmVersion: 2, enabled: true, strength: 85 };
        source.frameEnabled = true;
        source.frameStyleId = 'magical-starlight';
        source.showExif = true;
        source.captionId = customCaptionId('Kamakura · Summer');
        source.enhancement = { enabled: true, resultId: 'source-result', strength: 90 };

        const target = initialSnapshot();
        target.enhancement = { enabled: true, resultId: 'target-result', strength: 60 };
        target.showExif = false;

        const synced = applySharedSettings(source, target);
        expect(synced.styleId).toBe('watercolor');
        expect(synced.params.watercolor.radius).toBe(10);
        expect(synced.global.brightness).toBe(15);
        expect(synced.autoColor).toEqual({ algorithmVersion: 2, enabled: true, strength: 85 });
        expect(synced.frameEnabled).toBe(true);
        expect(synced.frameStyleId).toBe('magical-starlight');
        expect(synced.captionId).toBe('custom:Kamakura · Summer');
        expect(synced.enhancement).toEqual({ enabled: true, resultId: 'target-result', strength: 60 });
        expect(synced.showExif).toBe(false);

        const restored = normalizeHistory({ entries: [synced], cursor: 0 }).entries[0];
        expect(restored.captionId).toBe('custom:Kamakura · Summer');
        expect(restored.frameStyleId).toBe('magical-starlight');
    });
});
