import type { StyleId } from '../config/styles';
export interface RenderRequest {
    kind: 'render';
    id: number;
    tabId: string;
    revision: number;
    mode: 'preview' | 'export';
    width: number;
    height: number;
    // Tile origin and full image size are in this render's coordinate system.
    // Preview uses its downscaled image; export uses the original image.
    originX: number;
    originY: number;
    fullWidth: number;
    fullHeight: number;
    // max(1, full image long edge / PREVIEW_SIDE), for visual texture scale.
    scale: number;
    output?: 'effect' | 'base';
    styleId: StyleId;
    params: Record<string, number>;
    global: {
        brightness: number;
        contrast: number;
        saturation: number;
    };
    autoColor?: import('../imaging/autoColor').AutoColorPlan | null;
    buffer: ArrayBuffer;
}
export interface RenderResult {
    kind: 'result';
    id: number;
    tabId: string;
    revision: number;
    width: number;
    height: number;
    buffer: ArrayBuffer;
}
export interface RenderError {
    kind: 'error';
    id: number;
    tabId: string;
    revision: number;
    message: string;
}
export type WorkerResponse = RenderResult | RenderError;
