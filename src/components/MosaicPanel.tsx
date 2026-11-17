import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import type { MosaicSelection } from '../types/mosaic';
import { ParameterSlider } from './ParameterSlider';

export type MosaicToolMode = 'paint' | 'erase' | null;

interface Props {
    mosaic: MosaicSelection;
    tool: MosaicToolMode;
    brushSize: number;
    fitting: boolean;
    matchedFaces: number;
    onToolChange: (tool: MosaicToolMode) => void;
    onBrushSizeChange: (size: number) => void;
    onStrengthChange: (value: number) => void;
    onCommitStrength: () => void;
    onResetStrength: () => void;
    onAiFaceFitChange: (value: boolean) => void;
    onUndoStroke: () => void;
    onClearAll: () => void;
}

export function MosaicPanel({
    mosaic,
    tool,
    brushSize,
    fitting,
    matchedFaces,
    onToolChange,
    onBrushSizeChange,
    onStrengthChange,
    onCommitStrength,
    onResetStrength,
    onAiFaceFitChange,
    onUndoStroke,
    onClearAll,
}: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const hasStrokes = mosaic.strokes.length > 0;

    return (
        <details className="control-section mosaic-panel" open={tool !== null || hasStrokes}>
            <summary>
                <span>{t.mosaicTitle}</span>
                <small>{hasStrokes ? t.mosaicSummaryCount(mosaic.strokes.length) : t.mosaicSummaryIdle}</small>
            </summary>
            <div className="control-body">
                <div className="mosaic-tool-row">
                    <button
                        type="button"
                        className={`mosaic-tool-btn${tool === 'paint' ? ' active' : ''}`}
                        aria-pressed={tool === 'paint'}
                        onClick={() => onToolChange(tool === 'paint' ? null : 'paint')}
                    >
                        {tool === 'paint' ? t.mosaicExitToolBtn : t.mosaicPaintBtn}
                    </button>
                    <button
                        type="button"
                        className={`mosaic-tool-btn${tool === 'erase' ? ' active' : ''}`}
                        aria-pressed={tool === 'erase'}
                        disabled={!hasStrokes}
                        onClick={() => onToolChange(tool === 'erase' ? null : 'erase')}
                    >
                        {t.mosaicEraseBtn}
                    </button>
                </div>

                {tool !== null && <p className="mosaic-status-note is-active">{t.mosaicDrawHint}</p>}

                <ParameterSlider
                    label={t.mosaicBrushSizeLabel}
                    value={brushSize}
                    min={8}
                    max={120}
                    unit=""
                    defaultValue={36}
                    onChange={onBrushSizeChange}
                    onCommit={() => {}}
                    onReset={() => onBrushSizeChange(36)}
                />

                <ParameterSlider
                    label={t.mosaicStrengthLabel}
                    value={mosaic.strength}
                    min={0}
                    max={100}
                    unit="%"
                    defaultValue={75}
                    onChange={onStrengthChange}
                    onCommit={onCommitStrength}
                    onReset={onResetStrength}
                />

                <label className="toggle-row">
                    <span>
                        <strong>{t.mosaicAiFitTitle}</strong>
                        <small>{t.mosaicAiFitSub}</small>
                    </span>
                    <input
                        type="checkbox"
                        checked={mosaic.aiFaceFit}
                        onChange={e => onAiFaceFitChange(e.target.checked)}
                    />
                    <span className="toggle-ui" />
                </label>

                {fitting ? (
                    <p className="mosaic-status-note is-fitting">{t.mosaicFittingHint}</p>
                ) : hasStrokes ? (
                    <p className="mosaic-status-note">
                        {mosaic.aiFaceFit && matchedFaces > 0 ? t.mosaicMatchedHint(matchedFaces) : t.mosaicNonFaceHint}
                    </p>
                ) : null}

                {hasStrokes && (
                    <div className="mosaic-actions-row">
                        <button type="button" className="mosaic-action-btn" onClick={onUndoStroke}>
                            {t.mosaicUndoStrokeBtn}
                        </button>
                        <button type="button" className="mosaic-action-btn danger" onClick={onClearAll}>
                            {t.mosaicClearBtn}
                        </button>
                    </div>
                )}
            </div>
        </details>
    );
}
