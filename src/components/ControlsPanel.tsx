import { STYLES, GLOBAL, styleParams, type StyleId, type GlobalKey } from '../config/styles';
import type { EditorSnapshot, PhotoTab, ExifFields } from '../types/document';
import { captionText } from '../config/captions';
import { frameKind, type FrameContent } from '../imaging/frame';
import { ParameterSlider } from './ParameterSlider';
import { StudioIcon } from './StudioIcon';
import { duotonePalette } from '../worker/styles/duotone';
import type { ReactNode } from 'react';
interface Props {
    enhancementPanel?: ReactNode;
    outputSize?: { width: number; height: number };
    tab: PhotoTab | null;
    snapshot: EditorSnapshot | null;
    exif: ExifFields | null;
    exporting: boolean;
    exportProgress: string;
    onStyle: (style: StyleId) => void;
    onParam: (key: string, value: number) => void;
    onGlobal: (key: GlobalKey, value: number) => void;
    onCommit: () => void;
    onResetParam: (key: string) => void;
    onResetGlobal: (key: GlobalKey) => void;
    onFrame: (value: boolean) => void;
    onExif: (value: boolean) => void;
    onCaption: () => void;
    onOpenCaption: () => void;
    onExport: () => void;
    onUndo: () => void;
    onRedo: () => void;
}
export function ControlsPanel(props: Props) {
    const { tab, snapshot: s, exif } = props;
    const style = s ? STYLES[s.styleId] : null, content: FrameContent = { captionId: s?.captionId ?? '', showExif: s?.showExif ?? false, exif };
    const definitions = s ? styleParams(s.styleId) : null;
    return <aside className="controls" aria-label="照片编辑工具"><div className="controls-top"><div className="controls-title"><span className="controls-symbol"><StudioIcon name="sliders" size={20}/></span><h2>创作工具</h2></div><p>一点调整，让灵感自然发生。</p></div>{!tab || !s ? <div className="controls-empty"><div className="section-heading"><span>发现你的风格</span><span>8 种灵感</span></div><div className="style-preview-grid">{Object.entries(STYLES).map(([id, style]) => <div className={`style-preview ${id}`} key={id}><span aria-hidden="true">{style.icon}</span><strong>{style.short}</strong></div>)}</div><div className="empty-tools-note"><StudioIcon name="photo" size={22}/><p>准备好一张喜欢的照片<br/><span>导入后即可选择风格、调整细节</span></p></div><div className="tool-benefits"><span><StudioIcon name="sparkles" size={16}/>智能调色</span><span><StudioIcon name="photo" size={16}/>照片增强</span></div></div> : <>
        <section className="control-section"><div className="section-heading"><span>视觉风格</span><span>{Object.keys(STYLES).length} 种风格</span></div><div className="style-grid">{(Object.keys(STYLES) as StyleId[]).map(id => <button key={id} className={`style-card ${s.styleId === id ? 'selected' : ''}`} onClick={() => props.onStyle(id)} aria-pressed={s.styleId === id}><span aria-hidden="true" className={`style-icon ${id}`}>{STYLES[id].icon}</span><span className="style-name">{STYLES[id].short}</span><span className="style-en">{STYLES[id].en}</span></button>)}</div></section>
        <details className="control-section style-parameters"><summary><span>{style?.short}参数</span><small>双击复位</small></summary><div className="control-body">{s.styleId === 'duotone' && <div className="duotone-palette" aria-label="海报配色">{Object.entries(duotonePalette(s.params.duotone.shadowHue, s.params.duotone.highlightHue)).map(([key, rgb]) => <span key={key}><i style={{ backgroundColor: `rgb(${rgb.join(',')})` }}/>{key === 'dark' ? '暗部' : '亮部'}</span>)}</div>}{definitions && Object.entries(definitions).map(([key, p]) => <ParameterSlider key={`${s.styleId}-${key}`} label={p.label} value={s.params[s.styleId][key]} min={p.min} max={p.max} unit={p.unit} defaultValue={p.default} onChange={v => props.onParam(key, v)} onCommit={props.onCommit} onReset={() => props.onResetParam(key)}/>)}</div></details>
        {props.enhancementPanel}
        <details className="control-section global-adjustments"><summary><span>光色微调</span><small>亮度 · 对比 · 饱和</small></summary><div className="control-body">{(Object.keys(GLOBAL) as GlobalKey[]).map(key => <ParameterSlider key={key} label={GLOBAL[key].label} value={s.global[key]} min={GLOBAL[key].min} max={GLOBAL[key].max} unit={GLOBAL[key].unit} defaultValue={0} onChange={v => props.onGlobal(key, v)} onCommit={props.onCommit} onReset={() => props.onResetGlobal(key)}/>)}</div></details>
        <details className="control-section frame-panel"><summary><span>拍立得相框</span><small>{s.frameEnabled ? '已开启' : '未开启'}</small></summary><div className="control-body"><label className="toggle-row"><span><strong>添加相纸边框</strong><small>暖白相纸与留白签名</small></span><input type="checkbox" checked={s.frameEnabled} onChange={e => props.onFrame(e.target.checked)}/><span className="toggle-ui"/></label>{s.frameEnabled && <div className="frame-options">{tab.exifContainerPresent && <label className="toggle-row exif-toggle"><span><strong>读取并展示 EXIF</strong><small>仅设备、快门、光圈、ISO、日期</small></span><input type="checkbox" checked={s.showExif} onChange={e => props.onExif(e.target.checked)}/><span className="toggle-ui"/></label>}{frameKind(content) === '拍摄信息' ? <div className="caption-box"><span>拍摄信息</span><p>{[exif?.model, exif?.exposure, exif?.aperture, exif?.iso, exif?.date].filter(Boolean).join(' · ')}</p></div> : <div className="caption-box"><div><span>相框文案</span><button onClick={props.onCaption}>换一句 ↗</button></div><p>{captionText(s.captionId)}</p><button className="choose-caption" onClick={props.onOpenCaption}>浏览并选择文案</button></div>}</div>}</div></details>
        <div className="controls-footer"><div className="history-actions"><button onClick={props.onUndo} disabled={tab.history.cursor === 0}>↶ 撤销</button><button onClick={props.onRedo} disabled={tab.history.cursor >= tab.history.entries.length - 1}>↷ 重做</button></div><button className="export-button" onClick={props.onExport} disabled={props.exporting}>{props.exporting ? `正在导出 ${props.exportProgress}` : '导出高清 PNG'} <span>↗</span></button><div className="export-note">{s.frameEnabled ? `相框将印入：${frameKind(content)}` : '不添加相框'} · {props.outputSize?.width ?? tab.width} × {props.outputSize?.height ?? tab.height} px</div></div>
        </>}</aside>;
}
