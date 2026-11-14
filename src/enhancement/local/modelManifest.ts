// Only trusted bundled models can select a URL/hash. Stored result images remain reusable.
export type LocalProfile = 'liveaction' | 'denoise';
export type LocalBackend = 'webgpu' | 'wasm';
export interface LocalModelManifest {
    id: string; version: string; label: string; profile: LocalProfile; path: string;
    sha256: string; bytes: number; parameters: number; scale: 1 | 2; tileSize: number;
    overlap: number; blend: number; channels: 'RGB'; license: string; maxInputPixels: number;
}
export const localModels: readonly LocalModelManifest[] = [
    { id: 'liveaction-span-x2', version: '1.0.0', label: 'LiveAction', profile: 'liveaction',
        path: 'models/liveaction-span-x2/model.onnx',
        sha256: 'bfa72f3c6347076aed140d0836cee30c27ea434c047beeaf9466469483836ecc', bytes: 1654748, parameters: 410700,
        scale: 2, tileSize: 128, overlap: 48, blend: 8, channels: 'RGB', license: 'Apache-2.0', maxInputPixels: 6000000 },
    { id: 'ffdnet-color', version: '1.0.0', label: 'FFDNet', profile: 'denoise',
        path: 'models/ffdnet-color/model.onnx',
        sha256: 'b280d8ee55dac18e1a6a81a6b7ea7f8ab34fec816de9ef4e411a48eba817f4b4', bytes: 3419770, parameters: 852108,
        scale: 1, tileSize: 128, overlap: 32, blend: 8, channels: 'RGB', license: 'MIT', maxInputPixels: 6000000 },
];
export function localModel(profile: LocalProfile = 'liveaction'): LocalModelManifest {
    const model = localModels.find(item => item.profile === profile);
    if (!model) throw new Error('此模型已下架，请选择 LiveAction 或 FFDNet');
    return model;
}
export function localCacheDescriptor(profile: LocalProfile = 'liveaction') {
    const model = localModel(profile);
    // Preserve the existing LiveAction cache identity exactly.
    return { adapter: 'local-onnx', id: model.id, version: model.version, scale: 2,
        pipelineVersion: profile === 'liveaction' ? 3 : 4, profile };
}
export function checkLocalResources(width: number, height: number, model: LocalModelManifest) {
    if (width * height > model.maxInputPixels) throw new Error(`${model.label} 支持最多 ${model.maxInputPixels / 1000000} MP 输入，请先缩小照片`);
    const estimatedBytes = width * height * (model.scale ** 2 * 16 + 24) + 128 * 1048576;
    if (estimatedBytes > 768 * 1048576) throw new Error('图片超过本机内存预算，请先缩小照片');
    return estimatedBytes;
}
export function modelAssetUrl(model: LocalModelManifest, baseUrl: string) {
    const url = new URL(model.path, baseUrl); url.searchParams.set('sha256', model.sha256); return url.href;
}
