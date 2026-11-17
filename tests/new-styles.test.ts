import { describe, expect, it } from 'vitest';
import { defaultParams, STYLES } from '../src/config/styles';
import { duotonePalette } from '../src/worker/styles/duotone';
import { adjust, relativeLuminance } from '../src/worker/shared/color';
import { fixture, flat, metrics, newStyles, processStyle } from './style-fixtures';

describe('new style contracts', () => {
    for (const id of ['pixel', ...newStyles] as const) {
        it(`${id}: visible default, deterministic and no input mutation`, () => {
            const source = fixture(160, 120), saved = source.slice();
            const result = processStyle(id, source, 160, 120), diff = metrics(source, result);
            console.info(`${id} default MAD ${diff.mad.toFixed(2)}, changed ${(100 * diff.ratio).toFixed(1)}%`);
            expect(diff.mad).toBeGreaterThanOrEqual(5);
            expect(diff.ratio).toBeGreaterThanOrEqual(.5);
            expect(processStyle(id, source, 160, 120)).toEqual(result);
            expect(source).toEqual(saved);
            for (let i = 3; i < result.length; i += 4) expect(result[i]).toBe(255);
        });
        for (const [key, spec] of Object.entries(STYLES[id].params)) {
            it(`${id}.${key}: endpoints have an observable independent effect`, () => {
                const source = fixture(128, 96), params = defaultParams()[id];
                const a = processStyle(id, source, 128, 96, { ...params, [key]: spec.min });
                const b = processStyle(id, source, 128, 96, { ...params, [key]: spec.max });
                expect(metrics(a, b).mad).toBeGreaterThan(.1);
            });
        }
        it(`${id}: handles single-pixel and narrow images`, () => {
            for (const [w, h] of [[1, 1], [1, 17], [17, 1]]) {
                const result = processStyle(id, fixture(w, h), w, h);
                expect(result.length).toBe(w * h * 4);
                expect(result[3]).toBe(255);
            }
        });
    }
    it('manga remains neutral with clean white flats and increasing white protection', () => {
        const source = fixture(96, 72), result = processStyle('manga', source, 96, 72);
        for (let i = 0; i < result.length; i += 4) { expect(result[i]).toBe(result[i + 1]); expect(result[i]).toBe(result[i + 2]); }
        const wall = flat(96, 72, 230), params = defaultParams().manga;
        const low = processStyle('manga', wall, 96, 72, { ...params, white: 0 });
        const high = processStyle('manga', wall, 96, 72, { ...params, white: 100 });
        expect(metrics(wall, high).mad).toBeGreaterThan(0);
        expect(high[0]).toBeGreaterThanOrEqual(low[0]);
        expect(Math.min(...Array.from(high).filter((_, i) => i % 4 !== 3))).toBeGreaterThanOrEqual(248);
    });
    it('duotone stays within the chosen RGB segment, including almost identical hues', () => {
        const source = fixture(96, 72), params = defaultParams().duotone;
        for (const [shadowHue, highlightHue] of [[225, 35], [120, 120], [359, 0]]) {
            const { dark, light } = duotonePalette(shadowHue, highlightHue);
            expect(relativeLuminance(light) - relativeLuminance(dark)).toBeGreaterThanOrEqual(.35);
            const out = processStyle('duotone', source, 96, 72, { ...params, shadowHue, highlightHue });
            const axis = light.map((v, i) => v - dark[i]), length = axis.reduce((s, v) => s + v * v, 0);
            for (let i = 0; i < out.length; i += 4) {
                const t = Math.max(0, Math.min(1, axis.reduce((s, v, c) => s + v * (out[i + c] - dark[c]), 0) / length));
                for (let c = 0; c < 3; c++) expect(Math.abs(out[i + c] - dark[c] - t * axis[c])).toBeLessThan(1.5);
            }
        }
    });
    it('film: all controls zero is identity and zero grain has no flat-field noise', () => {
        const source = fixture(96, 72);
        expect(processStyle('film', source, 96, 72, { fade: 0, warmth: 0, halation: 0, grain: 0 })).toEqual(source);
        const result = processStyle('film', flat(96, 72, 128), 96, 72, { ...defaultParams().film, grain: 0 });
        for (let i = 4; i < result.length; i++) expect(result[i]).toBe(result[i % 4]);
    });
    it('film grain variance increases with strength without shifting average exposure', () => {
        const source = flat(128, 96, 128), params = { fade: 0, warmth: 0, halation: 0, grain: 0 };
        let previous = 0;
        for (const grain of [25, 50, 75, 100]) {
            const out = processStyle('film', source, 128, 96, { ...params, grain });
            let sum = 0, variance = 0;
            for (let i = 0; i < out.length; i += 4) { const d = out[i] - 128; sum += d; variance += d * d; }
            expect(Math.abs(sum / (out.length / 4))).toBeLessThan(1);
            expect(variance).toBeGreaterThan(previous); previous = variance;
        }
    });
    it('film diffusion softens fine detail without adding noise or tint to a flat field', () => {
        const w = 96, h = 72, source = flat(w, h, 128);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const value = (x + y) % 2 ? 220 : 36;
            for (let c = 0; c < 3; c++) source[(y * w + x) * 4 + c] = value;
        }
        const neutral = { fade: 0, warmth: 0, halation: 0, grain: 0, smear: 0 };
        expect(processStyle('film', source, w, h, neutral)).toEqual(source);
        const softened = processStyle('film', source, w, h, { ...neutral, smear: 100 });
        let sourceVariation = 0, softVariation = 0;
        for (let y = 12; y < h - 12; y++) for (let x = 12; x < w - 12; x++) {
            const i = (y * w + x) * 4;
            sourceVariation += Math.abs(source[i] - 128);
            softVariation += Math.abs(softened[i] - 128);
            expect(softened[i]).toBe(softened[i + 1]);
            expect(softened[i]).toBe(softened[i + 2]);
        }
        expect(softVariation / sourceVariation).toBeLessThan(.2);
        const uniform = flat(w, h, 128);
        expect(processStyle('film', uniform, w, h, { ...neutral, smear: 100 })).toEqual(uniform);
    });
    it('film halation is confined to the neighborhood of highlights', () => {
        const w = 128, h = 96, src = flat(w, h, 50);
        for (let y = 44; y < 50; y++) for (let x = 60; x < 66; x++) for (let c = 0; c < 3; c++) src[(y * w + x) * 4 + c] = 255;
        const params = { fade: 0, warmth: 0, halation: 0, grain: 0 };
        const off = processStyle('film', src, w, h, params), on = processStyle('film', src, w, h, { ...params, halation: 100 });
        expect(on[0]).toBe(off[0]);
        expect(on[(47 * w + 59) * 4]).toBeGreaterThan(off[(47 * w + 59) * 4]);
    });
    it('cel parameters and expanded global tone/temperature controls have observable independent effects', () => {
        const source = fixture(96, 72), celParams = defaultParams().cel;
        for (const [key, spec] of Object.entries(STYLES.cel.params)) {
            const a = processStyle('cel', source, 96, 72, { ...celParams, [key]: spec.min });
            const b = processStyle('cel', source, 96, 72, { ...celParams, [key]: spec.max });
            expect(metrics(a, b).mad, `cel.${key}`).toBeGreaterThan(.1);
        }
        const dark = flat(8, 8, 40);
        adjust(dark, { brightness: 0, contrast: 0, saturation: 0, shadows: 80 });
        expect(dark[0]).toBeGreaterThan(50);

        const bright = flat(8, 8, 220);
        adjust(bright, { brightness: 0, contrast: 0, saturation: 0, highlights: -80 });
        expect(bright[0]).toBeLessThan(210);

        const warm = flat(8, 8, 128);
        adjust(warm, { brightness: 0, contrast: 0, saturation: 0, temperature: 80 });
        expect(warm[0]).toBeGreaterThan(warm[2]);
    });
});
