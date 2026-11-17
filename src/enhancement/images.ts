import { analyzeAutoColor } from '../imaging/autoColor';
import { decode, toImageData, imageDataCanvas } from '../imaging/decode';
import { getResult } from '../storage/enhancementStore';
import type { PhotoTab, EditorSnapshot } from '../types/document';
import { enhancementClarity, enhancementDenoise, enhancementSharpen } from '../types/enhancement';
import { applyAdaptiveUsm, applyEdgeDenoise, applyLocalClarity } from './usm';

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片编码失败，可能是内存不足')), type, quality));
}
export async function resolveBase(tab: PhotoTab, state: EditorSnapshot) {
    const selection = state.enhancement;
    if (!selection?.enabled || !selection.resultId || selection.strength === 0) return { blob: tab.blob, width: tab.width, height: tab.height };
    const result = await getResult(selection.resultId);
    if (!result) throw new Error('增强缓存已被清理，请关闭增强使用原图，或手动重新生成');
    return { blob: result.blob, width: result.width, height: result.height };
}
// Shared by preview and full-resolution export. Strength, USM sharpen, clarity and denoise never start a model task.
const previewPairs = new Map<string, Promise<{ original: ImageData; enhanced: ImageData }>>();
export async function basePixels(tab: PhotoTab, state: EditorSnapshot, maxSide: number): Promise<ImageData> {
    const selection = state.enhancement;
    if (Number.isFinite(maxSide) && selection?.enabled && selection.resultId && selection.strength > 0) {
        const key = `${tab.id}:${selection.resultId}:${maxSide}`;
        if (!previewPairs.has(key)) {
            const promise = (async () => {
                const enhanced = await uncachedBasePixels(tab, { ...state, enhancement: { enabled: true, resultId: selection.resultId, strength: 100 } }, maxSide);
                const bitmap = await decode(tab.blob), canvas = document.createElement('canvas');
                canvas.width = enhanced.width; canvas.height = enhanced.height;
                try {
                    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                    return { enhanced, original: ctx.getImageData(0, 0, canvas.width, canvas.height) };
                } finally { bitmap.close(); canvas.width = 1; }
            })();
            previewPairs.set(key, promise);
            promise.catch(() => previewPairs.delete(key));
            while (previewPairs.size > 3) previewPairs.delete(previewPairs.keys().next().value!);
        }
        const pair = await previewPairs.get(key)!;
        const amount = selection.strength / 100, pixels = new ImageData(new Uint8ClampedArray(pair.enhanced.data), pair.enhanced.width, pair.enhanced.height);
        if (amount < 1) for (let i = 0; i < pixels.data.length; i += 4) for (let c = 0; c < 3; c++) pixels.data[i + c] = pair.original.data[i + c] * (1 - amount) + pair.enhanced.data[i + c] * amount;
        const denoise = enhancementDenoise(selection);
        if (denoise > 0) applyEdgeDenoise(pixels.data, pixels.width, pixels.height, denoise);
        const sharpen = enhancementSharpen(selection);
        if (sharpen > 0) applyAdaptiveUsm(pixels.data, pixels.width, pixels.height, sharpen);
        const clarity = enhancementClarity(selection);
        if (clarity !== 0) applyLocalClarity(pixels.data, pixels.width, pixels.height, clarity);
        return pixels;
    }
    return uncachedBasePixels(tab, state, maxSide);
}
async function uncachedBasePixels(tab: PhotoTab, state: EditorSnapshot, maxSide: number) {
    const base = await resolveBase(tab, state), enhanced = await decode(base.blob);
    let pixels: ImageData;
    try { pixels = toImageData(enhanced, maxSide); } finally { enhanced.close(); }
    const selection = state.enhancement;
    if (!selection?.enabled || !selection.resultId || selection.strength === 0) return pixels;
    if (selection.strength < 100) {
        const original = await decode(tab.blob), canvas = document.createElement('canvas');
        canvas.width = pixels.width; canvas.height = pixels.height;
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height), amount = selection.strength / 100;
            for (let i = 0; i < data.data.length; i += 4) for (let c = 0; c < 3; c++) pixels.data[i + c] = data.data[i + c] * (1 - amount) + pixels.data[i + c] * amount;
        } finally { original.close(); canvas.width = 1; }
    }
    const denoise = enhancementDenoise(selection);
    if (denoise > 0) applyEdgeDenoise(pixels.data, pixels.width, pixels.height, denoise);
    const sharpen = enhancementSharpen(selection);
    if (sharpen > 0) applyAdaptiveUsm(pixels.data, pixels.width, pixels.height, sharpen);
    const clarity = enhancementClarity(selection);
    if (clarity !== 0) applyLocalClarity(pixels.data, pixels.width, pixels.height, clarity);
    return pixels;
}
export async function exportBase(tab: PhotoTab, state: EditorSnapshot) {
    const base = await resolveBase(tab, state);
    const selection = state.enhancement;
    const sharpen = enhancementSharpen(selection);
    const denoise = enhancementDenoise(selection);
    const clarity = enhancementClarity(selection);
    if (!selection?.enabled || selection.strength === 0 || (selection.strength === 100 && sharpen === 0 && denoise === 0 && clarity === 0)) return base;
    const canvas = imageDataCanvas(await basePixels(tab, state, Infinity));
    try { return { ...base, blob: await canvasBlob(canvas) }; } finally { canvas.width = 1; }
}

const colorSamples = new Map<string, Promise<ImageData>>();

// Always analyze the same whole-photo sample, never individual export tiles.
export async function autoColorPlan(tab: PhotoTab, state: EditorSnapshot) {
    if (!state.autoColor?.enabled || state.autoColor.strength === 0) return null;
    const version = state.autoColor.algorithmVersion === 2 ? 2 : 1;
    const key = JSON.stringify([tab.id, state.enhancement]);
    let samplePromise = colorSamples.get(key);
    if (!samplePromise) {
        samplePromise = basePixels(tab, state, 384);
        colorSamples.set(key, samplePromise);
        samplePromise.catch(() => { if (colorSamples.get(key) === samplePromise) colorSamples.delete(key); });
        while (colorSamples.size > 8) colorSamples.delete(colorSamples.keys().next().value!);
    }
    const sample = await samplePromise;
    return analyzeAutoColor(sample.data, state.autoColor.strength, version, {
        exposure: state.autoColor.exposure,
        contrast: state.autoColor.contrast,
        temperature: state.autoColor.temperature,
        vibrance: state.autoColor.vibrance,
    });
}
