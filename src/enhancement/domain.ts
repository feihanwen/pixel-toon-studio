import { currentMsg } from '../config/errors';
import { MAX_PIXELS, MAX_SIDE } from '../config/limits';
import type { TaskStatus } from '../types/enhancement';

export const AI_TIMEOUT = 300000;
export function checkDimensions(width: number, height: number, scale = 1) {
    const w = width * scale, h = height * scale;
    if (![w, h].every(n => Number.isSafeInteger(n) && n > 0) || w * h > MAX_PIXELS || Math.max(w, h) > MAX_SIDE)
        throw new Error(
            currentMsg(
                `增强输出超过 24 MP 或单边 12,000 px，请缩小输入照片或选择较低倍率（预计 ${w} × ${h}）`,
                `Enhanced output exceeds 24 MP or 12,000 px per side (estimated ${w} × ${h}); please resize the input photo`,
            ),
        );
}
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
    throw new Error(currentMsg('模型参数只能包含 JSON 值', 'Model parameters must be valid JSON values'));
}
export async function digest(bytes: ArrayBuffer): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function cacheKey(sourceDigest: string, model: unknown) {
    return digest(new TextEncoder().encode(canonicalJson({ sourceDigest, model, preprocessingVersion: 1 })).buffer as ArrayBuffer);
}
const transitions: Record<TaskStatus, TaskStatus[]> = {
    idle: ['preparing'], preparing: ['processing', 'succeeded', 'failed', 'cancelled'],
    processing: ['processing', 'saving', 'failed', 'cancelled'],
    saving: ['succeeded', 'failed', 'cancelled'], succeeded: [], failed: [], cancelled: [],
};
export function transition(from: TaskStatus, to: TaskStatus) {
    if (from !== to && !transitions[from].includes(to)) {
        throw new Error(currentMsg(`无效的增强状态转换：${from} → ${to}`, `Invalid enhancement state transition: ${from} → ${to}`));
    }
    return to;
}
