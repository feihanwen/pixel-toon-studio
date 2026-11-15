import { useEffect, useRef, useState } from 'react';
import type { PhotoTab, EditorSnapshot } from '../types/document';
import { activeTask, enhancementSharpen, type EnhancementResult, type EnhancementTask } from '../types/enhancement';
import { cleanResults, getResult } from '../storage/enhancementStore';
import type { EnhancementRequest } from '../enhancement/orchestrator';
import { ParameterSlider } from './ParameterSlider';
import { download } from '../imaging/export';
import { clearLocalModelCache, isLocalModelCached } from '../enhancement/local/LocalEnhancerClient';
import { isLocalProfile, localModels, localModel, type LocalProfile } from '../enhancement/local/modelManifest';
import { usePreferences } from '../config/preferences';
import { ENHANCEMENT_CHOICES, uiText } from '../config/i18n';
import './enhancement.css';

interface Props {
    tab: PhotoTab;
    snapshot: EditorSnapshot;
    task?: EnhancementTask;
    protectedIds: Set<string>;
    onRun: (request: EnhancementRequest) => void;
    onCancel: () => void;
    onEnable: (value: boolean) => void;
    onStrength: (value: number) => void;
    onSharpen: (value: number) => void;
    onCommit: () => void;
}

const profileLabels: Record<LocalProfile, string> = {
    liveaction: 'LiveAction',
    omnisr: 'OmniSR',
    anime: 'RealESR-Anime',
    denoise: 'NAFNet',
};

export function EnhancementPanel(props: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const choices = ENHANCEMENT_CHOICES[language];
    const [profile, setProfile] = useState<LocalProfile>('liveaction');
    const chosen = useRef(false);
    const [cached, setCached] = useState(false);
    const [message, setMessage] = useState('');
    const [result, setResult] = useState<EnhancementResult>();
    const model = localModel(profile);
    const busy = activeTask(props.task);
    const selection = props.snapshot.enhancement;
    const sharpen = enhancementSharpen(selection);
    const currentName =
        result?.modelId === 'ffdnet-color'
            ? 'FFDNet'
            : isLocalProfile(result?.localProfile)
              ? profileLabels[result.localProfile]
              : result?.modelId;

    useEffect(() => {
        let live = true;
        isLocalModelCached(profile)
            .then(value => {
                if (live) setCached(value);
            })
            .catch(() => {
                if (live) setCached(false);
            });
        return () => {
            live = false;
        };
    }, [profile, busy]);

    useEffect(() => {
        let live = true;
        setResult(undefined);
        if (selection.resultId)
            getResult(selection.resultId)
                .then(value => {
                    if (!live) return;
                    setResult(value);
                    if (!chosen.current && isLocalProfile(value?.localProfile)) setProfile(value.localProfile);
                })
                .catch(() => {});
        return () => {
            live = false;
        };
    }, [selection.resultId]);

    const status = busy
        ? props.task?.message
        : props.task?.status === 'succeeded'
          ? props.task.message.includes('缓存') || props.task.message.toLowerCase().includes('cache')
              ? t.enhanceRestoredCache
              : t.enhanceDoneSaved
          : props.task?.message;
    const sameModel = result?.localProfile === profile && result?.modelId === model.id;

    return (
        <details className="enhancement-panel control-section">
            <summary>
                <span>{t.enhanceTitle}</span>
                <small>
                    {busy
                        ? t.enhanceBusy
                        : currentName
                          ? `${currentName} · ${selection.enabled ? t.enhanceApplied : t.enhanceNotApplied}`
                          : t.enhanceDefaultSummary}
                </small>
            </summary>
            <div className="enhancement-body">
                <div className="enhance-model-picker" role="radiogroup" aria-label={t.enhanceModeAria}>
                    {localModels.map(item => (
                        <button
                            key={item.profile}
                            role="radio"
                            aria-checked={profile === item.profile}
                            disabled={busy}
                            tabIndex={profile === item.profile ? 0 : -1}
                            onKeyDown={event => {
                                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                                event.preventDefault();
                                chosen.current = true;
                                const currentIdx = localModels.findIndex(m => m.profile === profile);
                                const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
                                const nextIdx = (currentIdx + step + localModels.length) % localModels.length;
                                const next = localModels[nextIdx].profile;
                                setProfile(next);
                                setMessage('');
                                const buttons =
                                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]');
                                buttons?.[nextIdx]?.focus();
                            }}
                            onClick={() => {
                                chosen.current = true;
                                setProfile(item.profile);
                                setMessage('');
                            }}
                        >
                            <strong>{choices[item.profile].title}</strong>
                            <small>{item.label}</small>
                        </button>
                    ))}
                </div>
                <p className="enhance-description">{choices[profile].description}</p>
                <div className="enhance-actions">
                    <button
                        className="enhance-start"
                        disabled={busy}
                        onClick={() => props.onRun({ localProfile: profile, force: sameModel })}
                    >
                        {busy ? t.enhanceRunningBtn : sameModel ? t.enhanceRegenerateBtn : t.enhanceStartBtn}
                    </button>
                    {busy && <button onClick={props.onCancel}>{t.cancelBtn}</button>}
                </div>
                {props.task && (
                    <div
                        data-status={props.task.status}
                        aria-live="polite"
                        className={`enhance-status ${props.task.status === 'failed' ? 'error' : ''}`}
                    >
                        {status}
                        {busy && props.task.progress !== undefined && (
                            <progress max={100} value={props.task.progress} aria-label={t.enhanceProgressAria} />
                        )}
                    </div>
                )}
                {selection.resultId && (
                    <div className="enhance-result">
                        <label className="toggle-row">
                            <span>
                                <strong>{t.applyEnhanceToggle}</strong>
                                <small>
                                    {result
                                        ? `${currentName} · ${result.width} × ${result.height}`
                                        : t.enhanceMissingResult}
                                </small>
                            </span>
                            <input
                                type="checkbox"
                                checked={selection.enabled}
                                onChange={e => props.onEnable(e.target.checked)}
                            />
                            <span className="toggle-ui" />
                        </label>
                        {result && (
                            <button
                                className="enhance-download"
                                onClick={() => {
                                    void download(result.blob, `${props.tab.name.replace(/\.[^.]+$/, '')}-enhanced.png`)
                                        .then(saved => {
                                            if (saved) setMessage(t.pngSavedShort);
                                        })
                                        .catch(error =>
                                            setMessage(
                                                t.saveFailedShort(
                                                    error instanceof Error ? error.message : t.unknownError,
                                                ),
                                            ),
                                        );
                                }}
                            >
                                {t.downloadBaseBtn}
                            </button>
                        )}
                    </div>
                )}
                {selection.resultId && (
                    <div className="enhance-sliders">
                        <ParameterSlider
                            label={t.blendStrengthLabel}
                            value={selection.strength}
                            min={0}
                            max={100}
                            unit=""
                            defaultValue={100}
                            onChange={props.onStrength}
                            onCommit={props.onCommit}
                            onReset={() => {
                                props.onStrength(100);
                                props.onCommit();
                            }}
                        />
                        <ParameterSlider
                            label={t.usmSharpenLabel}
                            value={sharpen}
                            min={0}
                            max={100}
                            unit=""
                            defaultValue={25}
                            onChange={props.onSharpen}
                            onCommit={props.onCommit}
                            onReset={() => {
                                props.onSharpen(25);
                                props.onCommit();
                            }}
                        />
                    </div>
                )}
                <details className="enhance-settings">
                    <summary>{t.moreSettingsSummary}</summary>
                    <p className="enhance-help">
                        {t.enhanceHelpLine1(model.maxInputPixels / 1000000)}
                        <br />
                        {model.label} · {(model.bytes / 1000000).toFixed(2)} MB ·{' '}
                        {cached ? t.enhanceCached : t.enhanceOnDemand}
                        {result?.executionBackend
                            ? ` · ${result.executionBackend === 'webgpu' ? 'GPU' : 'WASM'}`
                            : ''}
                    </p>
                    <div className="enhance-actions">
                        <button
                            onClick={() =>
                                cleanResults(props.protectedIds, true)
                                    .then(count => setMessage(t.cleanedIdleResultsMsg(count)))
                                    .catch(() => setMessage(t.cleanFailedMsg))
                            }
                        >
                            {t.cleanIdleResultsBtn}
                        </button>
                        <button
                            disabled={busy}
                            onClick={() =>
                                clearLocalModelCache()
                                    .then(() => {
                                        setCached(false);
                                        setMessage(t.clearedModelCacheMsg);
                                    })
                                    .catch(() => setMessage(t.cleanFailedMsg))
                            }
                        >
                            {t.clearModelCacheBtn}
                        </button>
                    </div>
                </details>
                {message && (
                    <p role="status" className="enhance-status">
                        {message}
                    </p>
                )}
            </div>
        </details>
    );
}
