interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    unit: string;
    defaultValue: number;
    onChange: (value: number) => void;
    onCommit: () => void;
    onReset: () => void;
}
export function ParameterSlider({ label, value, min, max, unit, defaultValue, onChange, onCommit, onReset }: Props) { return <div className="parameter" onDoubleClick={onReset}><div className="parameter-head"><label>{label}</label><button type="button" title={`默认值 ${defaultValue}${unit}，双击复位`} onClick={onReset}>{value}{unit}</button></div><input aria-label={label} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit} style={{ background: `linear-gradient(90deg,var(--accent) ${(value - min) / (max - min) * 100}%,var(--range-track) ${(value - min) / (max - min) * 100}%)` }}/><div className="parameter-range"><span>{min}{unit}</span><span>默认 {defaultValue}{unit}</span><span>{max}{unit}</span></div></div>; }
