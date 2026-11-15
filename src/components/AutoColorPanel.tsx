import type { AutoColorSelection } from '../imaging/autoColor';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import { ParameterSlider } from './ParameterSlider';
import './enhancement.css';

interface Props {
    selection: AutoColorSelection;
    onUpgrade: () => void;
    onEnable: (enabled: boolean) => void;
    onStrength: (strength: number) => void;
    onCommit: () => void;
}

export function AutoColorPanel({ selection, onUpgrade, onEnable, onStrength, onCommit }: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    return (
        <details className="control-section auto-color-panel" aria-label={t.autoColorTitle}>
            <summary>
                <span>{t.autoColorTitle}</span>
                <small>{selection.enabled ? t.autoColorEnabled : t.autoColorFree}</small>
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
                )}
            </div>
        </details>
    );
}
