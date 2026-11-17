export const PENCIL_LINEART_MODEL = {
    id: 'pencil-lineart',
    version: '1.0.0',
    label: 'Informative Drawings Line Art',
    path: 'models/pencil-lineart/model.onnx',
    sha256: '1fef40b8f7126d827e30fbebccf95ae9b0b391795df926bf9366a821bad4f498',
    bytes: 17193338,
    maxSide: 640,
    inputName: 'input',
    outputName: 'output',
    license: 'MIT',
} as const;

export function pencilLineartModelUrl(baseUrl: string): string {
    const url = new URL(PENCIL_LINEART_MODEL.path, baseUrl);
    url.searchParams.set('sha256', PENCIL_LINEART_MODEL.sha256);
    return url.href;
}
