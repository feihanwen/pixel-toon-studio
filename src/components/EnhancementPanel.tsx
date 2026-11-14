import { useEffect, useRef, useState } from 'react';
import type { PhotoTab, EditorSnapshot } from '../types/document';
import { activeTask, type EnhancementResult, type EnhancementTask } from '../types/enhancement';
import { cleanResults, getResult } from '../storage/enhancementStore';
import type { EnhancementRequest } from '../enhancement/orchestrator';
import { ParameterSlider } from './ParameterSlider';
import { download } from '../imaging/export';
import { clearLocalModelCache, isLocalModelCached } from '../enhancement/local/LocalEnhancerClient';
import { localModels, localModel, type LocalProfile } from '../enhancement/local/modelManifest';
import './enhancement.css';
interface Props {
    tab: PhotoTab; snapshot: EditorSnapshot; task?: EnhancementTask; protectedIds: Set<string>;
    onRun: (request: EnhancementRequest) => void; onCancel: () => void;
    onEnable: (value: boolean) => void; onStrength: (value: number) => void; onCommit: () => void;
}
const choices: Record<LocalProfile, { title: string; description: string }> = {
    liveaction: { title: '纹理清晰', description: '保留头发、衣物与背景细节，适合大多数照片。' },
    denoise: { title: '颗粒降噪', description: '先去噪再放大，适合夜景和颗粒照片；细节会更柔和。' },
};
export function EnhancementPanel(props: Props) {
    const [profile, setProfile] = useState<LocalProfile>('liveaction'), chosen = useRef(false);
    const [cached, setCached] = useState(false), [message, setMessage] = useState('');
    const [result, setResult] = useState<EnhancementResult>();
    const model = localModel(profile), busy = activeTask(props.task), selection = props.snapshot.enhancement;
    const currentName = result?.localProfile === 'liveaction' ? 'LiveAction' : result?.localProfile === 'denoise' ? 'FFDNet' : result?.modelId;
    useEffect(() => {
        let live = true;
        isLocalModelCached(profile).then(value => { if (live) setCached(value); }).catch(() => { if (live) setCached(false); });
        return () => { live = false; };
    }, [profile, busy]);
    useEffect(() => {
        let live = true; setResult(undefined);
        if (selection.resultId) getResult(selection.resultId).then(value => {
            if (!live) return; setResult(value);
            if (!chosen.current && (value?.localProfile === 'liveaction' || value?.localProfile === 'denoise')) setProfile(value.localProfile);
        }).catch(() => {});
        return () => { live = false; };
    }, [selection.resultId]);
    const status = busy ? props.task?.message : props.task?.status === 'succeeded'
        ? props.task.message.includes('缓存') ? '已从缓存恢复' : '已完成并保存' : props.task?.message;
    const sameModel = result?.localProfile === profile;
    return <details className="enhancement-panel control-section"><summary><span>照片增强</span><small>{busy ? '处理中…' : currentName ? `${currentName} · ${selection.enabled ? '已应用' : '未应用'}` : '本机处理 · ×2'}</small></summary><div className="enhancement-body">
        <div className="enhance-model-picker" role="radiogroup" aria-label="增强方式">
            {localModels.map(item => <button key={item.profile} role="radio" aria-checked={profile === item.profile} disabled={busy} tabIndex={profile === item.profile ? 0 : -1} onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault(); chosen.current = true;
                const next = profile === 'liveaction' ? 'denoise' : 'liveaction'; setProfile(next); setMessage('');
                const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]');
                buttons?.[next === 'liveaction' ? 0 : 1]?.focus();
            }} onClick={() => { chosen.current = true; setProfile(item.profile); setMessage(''); }}>
                <strong>{choices[item.profile].title}</strong><small>{item.label}</small>
            </button>)}
        </div>
        <p className="enhance-description">{choices[profile].description}</p>
        <div className="enhance-actions"><button className="enhance-start" disabled={busy} onClick={() => props.onRun({ localProfile: profile, force: sameModel })}>{busy ? '正在增强…' : sameModel ? '重新生成' : '生成增强'}</button>{busy && <button onClick={props.onCancel}>取消</button>}</div>
        {props.task && <div data-status={props.task.status} aria-live="polite" className={`enhance-status ${props.task.status === 'failed' ? 'error' : ''}`}>{status}{busy && props.task.progress !== undefined && <progress max={100} value={props.task.progress} aria-label="增强进度"/>}</div>}
        {selection.resultId && <div className="enhance-result"><label className="toggle-row"><span><strong>应用增强</strong><small>{result ? `${currentName} · ${result.width} × ${result.height}` : '结果缺失，请重新生成'}</small></span><input type="checkbox" checked={selection.enabled} onChange={e => props.onEnable(e.target.checked)}/><span className="toggle-ui"/></label>{result && <button className="enhance-download" onClick={() => { void download(result.blob, `${props.tab.name.replace(/\.[^.]+$/, '')}-enhanced.png`).then(saved => { if (saved) setMessage('PNG 已保存'); }).catch(error => setMessage(`保存失败：${error instanceof Error ? error.message : '请重试'}`)); }}>下载底图 ↗</button>}</div>}
        <details className="enhance-settings"><summary>更多设置</summary>
            {selection.resultId && <ParameterSlider label="增强混合强度" value={selection.strength} min={0} max={100} unit="" defaultValue={100} onChange={props.onStrength} onCommit={props.onCommit} onReset={() => { props.onStrength(100); props.onCommit(); }}/>} 
            <p className="enhance-help">本机处理 · 输出 ×2 · 输入最多 {model.maxInputPixels / 1000000} MP<br/>{model.label} · {(model.bytes / 1000000).toFixed(2)} MB · {cached ? '已缓存' : '首次按需加载'}{result?.executionBackend ? ` · ${result.executionBackend === 'webgpu' ? 'GPU' : 'WASM'}` : ''}</p>
            <div className="enhance-actions"><button onClick={() => cleanResults(props.protectedIds, true).then(count => setMessage(`已清理 ${count} 个闲置结果`)).catch(() => setMessage('清理失败，请重试'))}>清理闲置结果</button><button disabled={busy} onClick={() => clearLocalModelCache().then(() => { setCached(false); setMessage('模型缓存已清除'); }).catch(() => setMessage('清理失败，请重试'))}>清除模型缓存</button></div>
        </details>
        {message && <p role="status" className="enhance-status">{message}</p>}
    </div></details>;
}
