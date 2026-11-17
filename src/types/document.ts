import type { GlobalKey, ParamsByStyle, StyleId } from '../config/styles';
import type { FrameStyleId } from '../config/frames';
import type { EnhancementSelection } from './enhancement';
import type { MosaicSelection } from './mosaic';
export interface EditorSnapshot {
    autoColor: import('../imaging/autoColor').AutoColorSelection;
    enhancement: EnhancementSelection;
    mosaic?: MosaicSelection;
    styleId: StyleId;
    params: ParamsByStyle;
    global: Record<GlobalKey, number>;
    frameEnabled: boolean;
    frameStyleId: FrameStyleId;
    showExif: boolean;
    captionId: string;
}
export interface History {
    entries: EditorSnapshot[];
    cursor: number;
}
export interface PhotoTab {
    id: string;
    name: string;
    mimeType: string;
    blob: Blob;
    width: number;
    height: number;
    createdAt: number;
    exifContainerPresent: boolean;
    exifConsent: boolean;
    exifPrompted: boolean;
    history: History;
    savedAt: number;
}
export interface ExifFields {
    model?: string;
    exposure?: string;
    aperture?: string;
    iso?: string;
    date?: string;
}
export function snapshot(tab: PhotoTab) { return tab.history.entries[tab.history.cursor]; }
