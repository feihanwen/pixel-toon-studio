export const FACE_SEG_MODEL = {
    id: 'face-seg-multiclass',
    version: '1.0.0',
    label: 'MediaPipe Face & Hair Seg',
    path: 'models/face-seg-multiclass/model.onnx',
    sha256: '13961350bb2099688eb96182ffe26f24eb12c77b1df278a2ec95bbdc923136e1',
    bytes: 16454497,
    inputSize: 256,
    inputName: 'input_29',
    outputName: 'Identity',
    license: 'Apache-2.0',
} as const;

export function faceSegModelUrl(baseUrl: string): string {
    const url = new URL(FACE_SEG_MODEL.path, baseUrl);
    url.searchParams.set('sha256', FACE_SEG_MODEL.sha256);
    return url.href;
}
