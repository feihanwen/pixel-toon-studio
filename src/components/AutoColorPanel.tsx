import type { AutoColorSelection } from '../imaging/autoColor';
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
    return <details className="control-section auto-color-panel" aria-label="智能调色">
        <summary><span>智能调色</span><small>{selection.enabled ? '已开启' : '本机 · 免费'}</small></summary>
        <div className="auto-color-body">
        <label className="toggle-row"><strong>优化底图光色</strong><input type="checkbox" checked={selection.enabled} onChange={event => onEnable(event.target.checked)}/><span className="toggle-ui"/></label>
        {selection.algorithmVersion !== 2 && <div className="pop-version"><p>经典光色 · 保留已有调色结果</p><button onClick={onUpgrade}>升级温和光色</button></div>}
        {selection.enabled && <ParameterSlider label="调色强度" value={selection.strength} min={0} max={100} defaultValue={70} unit="%" onChange={onStrength} onCommit={onCommit} onReset={() => { onStrength(70); onCommit(); }}/>}
        </div>
    </details>;
}
