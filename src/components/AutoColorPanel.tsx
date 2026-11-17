import type { AutoColorDiagnostics, AutoColorSelection } from '../imaging/autoColor';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import { ParameterSlider } from './ParameterSlider';
import './enhancement.css';

export type AutoColorOffsetKey = 'exposure' | 'contrast' | 'temperature' | 'vibrance';

interface Props {
    selection: AutoColorSelection;
    diagnostics?: AutoColorDiagnostics | null;
    onUpgrade: () => void;
    onEnable: (enabled: boolean) => void;
    onStrength: (strength: number) => void;
    onOffset: (key: AutoColorOffsetKey, value: number) => void;
    onResetTuning: () => void;
    onCommit: () => void;
}

export function AutoColorPanel({
    selection,
    diagnostics,
    onUpgrade,
    onEnable,
    onStrength,
    onOffset,
    onResetTuning,
    onCommit,
}: Props) {
    const { language } = usePreferences();
    const t = uiText(language);

    const diagTags: string[] = [];
    if (diagnostics) {
        if (diagnostics.exposureNote === 'lifted') diagTags.push(t.autoColorDiagLifted);
        else if (diagnostics.exposureNote === 'recovered') diagTags.push(t.autoColorDiagRecovered);
        if (diagnostics.contrastNote === 'expanded') diagTags.push(t.autoColorDiagContrast);
        if (diagnostics.whiteBalanceNote === 'warmed') diagTags.push(t.autoColorDiagWarmed);
        else if (diagnostics.whiteBalanceNote === 'cooled') diagTags.push(t.autoColorDiagCooled);
    }

    const exposure = selection.exposure ?? 0;
    const contrast = selection.contrast ?? 0;
    const temperature = selection.temperature ?? 0;
    const vibrance = selection.vibrance ?? 0;
    const hasCustomTuning = exposure !== 0 || contrast !== 0 || temperature !== 0 || vibrance !== 0;

    return (
        <details className="control-section auto-color-panel" aria-label={t.autoColorTitle}>
            <summary>
                <span>{t.autoColorTitle}</span>
                <small>{selection.enabled ? `${t.autoColorEnabled} · ${selection.strength}%` : t.autoColorFree}</small>
            </summary>
            <div className="auto-color-body">
                <label className="toggle-row">
                    <strong>{t.autoColorToggle}</strong>
                    <input
                        type="checkbox"
                        checked={selection.enabled}
                        onChange={event => onEnable(event.target.checked)}
                    />
                    <span className="toggle-ui" />
                </label>
                {selection.algorithmVersion !== 2 && (
                    <div className="pop-version">
                        <p>{t.autoColorLegacyNote}</p>
                        <button onClick={onUpgrade}>{t.autoColorUpgradeBtn}</button>
                    </div>
                )}
                {selection.enabled && (
                    <>
                        {selection.algorithmVersion === 2 && diagnostics && (
                            <p className="diag-note" aria-live="polite">
                                {diagTags.length > 0 ? diagTags.join(' · ') : t.autoColorDiagBalanced}
                            </p>
                        )}
                        <ParameterSlider
                            label={t.autoColorStrength}
                            value={selection.strength}
                            min={0}
                            max={100}
                            defaultValue={70}
                            unit="%"
                            onChange={onStrength}
                            onCommit={onCommit}
                            onReset={() => {
                                onStrength(70);
                                onCommit();
                            }}
                        />
                        {selection.algorithmVersion === 2 && (
                            <>
                                {hasCustomTuning && (
                                    <div className="tune-head">
                                        <span>{t.autoColorTuningLabel}</span>
                                        <button type="button" onClick={onResetTuning}>
                                            {t.autoColorResetTuning}
                                        </button>
                                    </div>
                                )}
                                <ParameterSlider
                                    label={t.autoColorExposure}
                                    value={exposure}
                                    min={-50}
                                    max={50}
                                    defaultValue={0}
                                    unit=""
                                    onChange={value => onOffset('exposure', value)}
                                    onCommit={onCommit}
                                    onReset={() => {
                                        onOffset('exposure', 0);
                                        onCommit();
                                    }}
                                />
                                <ParameterSlider
                                    label={t.autoColorContrast}
                                    value={contrast}
                                    min={-50}
                                    max={50}
                                    defaultValue={0}
                                    unit=""
                                    onChange={value => onOffset('contrast', value)}
                                    onCommit={onCommit}
                                    onReset={() => {
                                        onOffset('contrast', 0);
                                        onCommit();
                                    }}
                                />
                                <ParameterSlider
                                    label={t.autoColorTemperature}
                                    value={temperature}
                                    min={-50}
                                    max={50}
                                    defaultValue={0}
                                    unit=""
                                    onChange={value => onOffset('temperature', value)}
                                    onCommit={onCommit}
                                    onReset={() => {
                                        onOffset('temperature', 0);
                                        onCommit();
                                    }}
                                />
                                <ParameterSlider
                                    label={t.autoColorVibrance}
                                    value={vibrance}
                                    min={-50}
                                    max={50}
                                    defaultValue={0}
                                    unit=""
                                    onChange={value => onOffset('vibrance', value)}
                                    onCommit={onCommit}
                                    onReset={() => {
                                        onOffset('vibrance', 0);
                                        onCommit();
                                    }}
                                />
                            </>
                        )}
                    </>
                )}
            </div>
        </details>
    );
}
