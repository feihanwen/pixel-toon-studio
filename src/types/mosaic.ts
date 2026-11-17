export interface MosaicPoint {
    x: number;
    y: number;
}

export interface MosaicStroke {
    mode: 'paint' | 'erase';
    /** Normalized brush radius relative to min(imageWidth, imageHeight). */
    radius: number;
    /** Normalized [0..1] polyline points in image coordinates. */
    points: MosaicPoint[];
}

export interface MosaicSelection {
    strength: number;
    aiFaceFit: boolean;
    strokes: MosaicStroke[];
}

export function defaultMosaic(): MosaicSelection {
    return {
        strength: 75,
        aiFaceFit: true,
        strokes: [],
    };
}
