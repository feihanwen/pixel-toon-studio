import { defaultAutoColor } from '../imaging/autoColor';
import { defaultParams, GLOBAL, STYLES, type StyleId, type GlobalKey } from '../config/styles';
import { CAPTIONS, isKnownCaptionId, randomCaption } from '../config/captions';
import type { EditorSnapshot, History } from '../types/document';
import { defaultEnhancement } from '../types/enhancement';
export function initialSnapshot(): EditorSnapshot { return { autoColor: defaultAutoColor(), enhancement: defaultEnhancement(), styleId: 'cel', params: defaultParams(), global: { brightness: 0, contrast: 0, saturation: 0 }, frameEnabled: false, showExif: false, captionId: randomCaption() }; }
export function cloneSnapshot(s: EditorSnapshot): EditorSnapshot { return structuredClone(s); }
export function commit(history: History, next: EditorSnapshot): History { const current = history.entries[history.cursor]; if (JSON.stringify(current) === JSON.stringify(next))
    return history; const entries = [...history.entries.slice(0, history.cursor + 1), cloneSnapshot(next)].slice(-31); return { entries, cursor: entries.length - 1 }; }
export function moveHistory(history: History, delta: number): History { return { ...history, cursor: Math.max(0, Math.min(history.entries.length - 1, history.cursor + delta)) }; }
export function normalizeHistory(history: History | undefined, legacyWatercolor = false): History {
    if (!history?.entries?.length) return { entries: [initialSnapshot()], cursor: 0 };
    const entries = history.entries.slice(-31).map(raw => {
        const styleId: StyleId = Object.hasOwn(STYLES, raw?.styleId) ? raw.styleId : 'cel';
        const params = defaultParams();
        for (const id of Object.keys(STYLES) as StyleId[]) {
            const definitions = STYLES[id].params as Record<string, { min: number; max: number; default: number }>;
            for (const key of Object.keys(definitions)) {
                const candidate = raw?.params?.[id]?.[key];
                let value = Number.isFinite(candidate) ? candidate : definitions[key].default;
                if (legacyWatercolor && id === 'watercolor' && Number.isFinite(candidate)) {
                    if (key === 'radius') value = Math.min(12, value + 1);
                    if (key === 'smear') value = Math.round(Math.sqrt(Math.max(0, value) / 100) * 100);
                    if (key === 'detail') value = Math.round(value * .73);
                }
                params[id][key] = Math.round(Math.max(definitions[key].min, Math.min(definitions[key].max, value)));
            }
        }
        const global = {} as EditorSnapshot['global'];
        for (const key of Object.keys(GLOBAL) as GlobalKey[]) {
            const candidate = raw?.global?.[key];
            global[key] = Number.isFinite(candidate) ? Math.max(GLOBAL[key].min, Math.min(GLOBAL[key].max, candidate)) : GLOBAL[key].default;
        }
        const e = raw?.enhancement;
        const enhancement = { enabled: e?.enabled === true && typeof e.resultId === 'string', resultId: typeof e?.resultId === 'string' ? e.resultId : null, strength: Number.isFinite(e?.strength) ? Math.max(0, Math.min(100, Math.round(e.strength))) : 70 };
        const autoColor = { algorithmVersion: raw?.autoColor?.algorithmVersion === 2 ? 2 as const : 1 as const, enabled: raw?.autoColor?.enabled === true, strength: Number.isFinite(raw?.autoColor?.strength) ? Math.max(0, Math.min(100, Math.round(raw.autoColor.strength))) : 70 };
        return { autoColor, enhancement, styleId, params, global, frameEnabled: raw?.frameEnabled === true, showExif: raw?.showExif === true, captionId: typeof raw?.captionId === 'string' && isKnownCaptionId(raw.captionId) ? raw.captionId : CAPTIONS[0].id };
    });
    const removed = history.entries.length - entries.length;
    return { entries, cursor: Math.max(0, Math.min(entries.length - 1, (Number.isInteger(history.cursor) ? history.cursor : 0) - removed)) };
}
