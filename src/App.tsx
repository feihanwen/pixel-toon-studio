import { useEffect, useRef, useState } from 'react';
import { type AutoColorPlan } from './imaging/autoColor';
import { AutoColorPanel } from './components/AutoColorPanel';
import { StudioIcon } from './components/StudioIcon';
import { SettingsPanel } from './components/SettingsPanel';
import { GLOBAL, styleParams, styleShortName } from './config/styles';
import { CAPTIONS, pickRandomCaption, type Caption } from './config/captions';
import {
    DEFAULT_FRAME_STYLE_ID,
    FRAME_STYLES,
    pickRandomFrameStyle,
    type FrameStyle,
    type FrameStyleId,
} from './config/frames';
import { PreferencesProvider, usePreferences, isLanguageChosen } from './config/preferences';
import { uiText } from './config/i18n';
import type { EditorSnapshot, ExifFields, PhotoTab } from './types/document';
import { snapshot } from './types/document';
import { initialSnapshot, cloneSnapshot, applySharedSettings, commit, moveHistory } from './state/history';
import { decode, toImageData, imageDataCanvas, FILE_ACCEPT, prepareImageImport } from './imaging/decode';
import { detectExif, parseExif } from './imaging/exif';
import { WorkerClient } from './imaging/workerClient';
import { exportPng, exportFilename, download } from './imaging/export';
import { CanvasStage } from './components/CanvasStage';
import { ControlsPanel } from './components/ControlsPanel';
import { CaptionPickerDialog } from './components/CaptionPickerDialog';
import { FrameStylePickerDialog } from './components/FrameStylePickerDialog';
import { LanguageOnboardingDialog } from './components/LanguageOnboardingDialog';
import { EnhancementPanel } from './components/EnhancementPanel';
import { autoColorPlan, basePixels, resolveBase } from './enhancement/images';
import { cancelAllEnhancements, cancelEnhancement, runEnhancement, type EnhancementRequest } from './enhancement/orchestrator';
import { activeTask, type EnhancementTask } from './types/enhancement';
import { referencedResults } from './storage/enhancementStore';
import { PREVIEW_SIDE } from './config/limits';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { useDesktopIntegration } from './hooks/useDesktopIntegration';
import { useEditorShortcuts } from './hooks/useEditorShortcuts';

type Draft = {
    tabId: string;
    value: EditorSnapshot;
};

type CaptionPickerState = {
    tabId: string;
    originalId: string;
    previewId: string;
};

type FrameStylePickerState = {
    tabId: string;
    originalId: FrameStyleId;
    previewId: FrameStyleId;
};

export function App() {
    return (
        <PreferencesProvider>
            <AppContent />
        </PreferencesProvider>
    );
}

function AppContent() {
    const { language } = usePreferences();
    const t = uiText(language);
    const [enhancementTasks, setEnhancementTasks] = useState<Record<string, EnhancementTask>>({});
    const [loadedSourceKey, setLoadedSourceKey] = useState('');
    const [colorPlan, setColorPlan] = useState<AutoColorPlan | null>(null);
    const [outputSize, setOutputSize] = useState<{ width: number; height: number }>();
    const [tabs, setTabs] = useState<PhotoTab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [notice, setNotice] = useState('');
    const [importing, setImporting] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState('');
    const [showOriginal, setShowOriginal] = useState(false);
    const [dialog, setDialog] = useState<string | null>(null);
    const [showLanguageOnboarding, setShowLanguageOnboarding] = useState(() => !isLanguageChosen());
    const [captionPicker, setCaptionPicker] = useState<CaptionPickerState | null>(null);
    const [frameStylePicker, setFrameStylePicker] = useState<FrameStylePickerState | null>(null);
    const [exifData, setExifData] = useState<Record<string, ExifFields>>({});
    const [source, setSource] = useState<ImageData | null>(null);
    const [original, setOriginal] = useState<HTMLCanvasElement | null>(null);
    const [processed, setProcessed] = useState<HTMLCanvasElement | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);

    const fileInput = useRef<HTMLInputElement>(null);
    const worker = useRef<WorkerClient | null>(null);
    const revision = useRef(0);
    const draftRef = useRef<Draft | null>(null);
    const recentRandom = useRef<string[]>([]);
    const recentRandomFrames = useRef<FrameStyleId[]>([]);

    const active = tabs.find(item => item.id === activeId) ?? null;
    const current = active ? (draft?.tabId === active.id ? draft.value : snapshot(active)) : null;
    const content = {
        frameStyleId:
            active && frameStylePicker?.tabId === active.id
                ? frameStylePicker.previewId
                : (current?.frameStyleId ?? DEFAULT_FRAME_STYLE_ID),
        captionId: active && captionPicker?.tabId === active.id ? captionPicker.previewId : (current?.captionId ?? ''),
        showExif: current?.showExif ?? false,
        exif: active ? (exifData[active.id] ?? null) : null,
    };

    useEffect(() => {
        worker.current = new WorkerClient();
        return () => {
            worker.current?.dispose();
            cancelAllEnhancements();
        };
    }, []);

    const { ready, saveFailed, markDirty, hasDirty, removeTabFromStorage, flushWorkspace } = useWorkspaceSync({
        tabs,
        activeId,
        language,
        onLoaded: (loadedTabs, loadedActiveId) => {
            setTabs(loadedTabs);
            setActiveId(loadedActiveId);
        },
        onNotice: setNotice,
        onDispose: () => {},
    });

    useEffect(() => {
        if (!active) {
            setSource(null);
            setOriginal(null);
            setProcessed(null);
            return;
        }
        let cancelled = false;
        revision.current++;
        setSource(null);
        setOriginal(null);
        setProcessed(null);
        decode(active.blob)
            .then(bitmap => {
                if (cancelled) {
                    bitmap.close();
                    return;
                }
                const data = toImageData(bitmap);
                bitmap.close();
                setOriginal(imageDataCanvas(data));
            })
            .catch(e => setNotice(e.message));
        return () => {
            cancelled = true;
        };
    }, [active?.id]);

    const enhancementKey = JSON.stringify({
        enhancement: current?.enhancement,
        autoColor: current?.autoColor,
    });
    const sourceKey = active ? `${active.id}:${enhancementKey}` : '';

    useEffect(() => {
        if (!active || !current) return;
        let cancelled = false;
        revision.current++;
        setProcessing(true);
        Promise.all([basePixels(active, current, PREVIEW_SIDE), resolveBase(active, current), autoColorPlan(active, current)])
            .then(([pixels, base, plan]) => {
                if (!cancelled) {
                    setColorPlan(plan);
                    setLoadedSourceKey(sourceKey);
                    setSource(pixels);
                    setOutputSize({ width: base.width, height: base.height });
                }
            })
            .catch(error => {
                if (!cancelled) {
                    setSource(null);
                    setProcessing(false);
                    setNotice(error.message);
                }
            });
        return () => {
            cancelled = true;
            revision.current++;
        };
    }, [active?.id, enhancementKey]);

    const renderKey = current
        ? JSON.stringify({
              styleId: current.styleId,
              params: current.params[current.styleId],
              global: current.global,
          })
        : '';

    useEffect(() => {
        if (!source || !active || !current || !worker.current || loadedSourceKey !== sourceKey) return;
        const rev = ++revision.current;
        setProcessing(true);
        const timer = setTimeout(async () => {
            try {
                const bytes = new Uint8ClampedArray(source.data);
                const response = await worker.current!.render({
                    tabId: active.id,
                    revision: rev,
                    mode: 'preview',
                    width: source.width,
                    height: source.height,
                    originX: 0,
                    originY: 0,
                    fullWidth: source.width,
                    fullHeight: source.height,
                    scale: 1,
                    styleId: current.styleId,
                    params: current.params[current.styleId],
                    global: current.global,
                    autoColor: colorPlan,
                    buffer: bytes.buffer,
                });
                if (rev !== revision.current) return;
                if (response.kind === 'error') throw new Error(response.message);
                setProcessed(
                    imageDataCanvas(new ImageData(new Uint8ClampedArray(response.buffer), response.width, response.height)),
                );
                setProcessing(false);
            } catch (e) {
                if (rev === revision.current) {
                    setProcessing(false);
                    setNotice(t.previewFailed(e instanceof Error ? e.message : t.unknownError));
                }
            }
        }, 70);
        return () => clearTimeout(timer);
    }, [source, active?.id, renderKey, colorPlan, loadedSourceKey, sourceKey]);

    useEffect(() => {
        if (!active || !current || !current.frameEnabled || !current.showExif || !active.exifConsent) {
            if (active) {
                setExifData(prev => {
                    if (!(active.id in prev)) return prev;
                    const next = { ...prev };
                    delete next[active.id];
                    return next;
                });
            }
            return;
        }
        if (exifData[active.id]) return;
        let cancelled = false;
        parseExif(active.blob)
            .then(fields => {
                if (!cancelled) {
                    setExifData(prev => ({ ...prev, [active.id]: fields }));
                }
            })
            .catch(() => setNotice(t.exifReadFailed));
        return () => {
            cancelled = true;
        };
    }, [active?.id, active?.exifConsent, current?.frameEnabled, current?.showExif]);

    function finishDraft() {
        const d = draftRef.current;
        if (!d) return;
        draftRef.current = null;
        markDirty(d.tabId);
        setDraft(null);
        setTabs(prev => prev.map(item => (item.id === d.tabId ? { ...item, history: commit(item.history, d.value) } : item)));
    }

    function commitEdit(updater: (s: EditorSnapshot) => EditorSnapshot, id = activeId) {
        if (!id) return;
        finishDraft();
        markDirty(id);
        setTabs(prev =>
            prev.map(item =>
                item.id === id ? { ...item, history: commit(item.history, updater(cloneSnapshot(snapshot(item)))) } : item,
            ),
        );
    }

    function changeDraft(updater: (s: EditorSnapshot) => void) {
        if (!active) return;
        const base = draftRef.current?.tabId === active.id ? draftRef.current.value : cloneSnapshot(snapshot(active));
        const next = cloneSnapshot(base);
        updater(next);
        const d = { tabId: active.id, value: next };
        draftRef.current = d;
        setDraft(d);
    }

    function undo(delta: number) {
        if (!active) return;
        finishDraft();
        markDirty(active.id);
        setTabs(prev =>
            prev.map(item => (item.id === active.id ? { ...item, history: moveHistory(item.history, delta) } : item)),
        );
    }

    function syncAllTabs() {
        if (!active || !current || tabs.length <= 1) return;
        const sourceSnapshot = cloneSnapshot(current);
        finishDraft();
        let syncedCount = 0;
        setTabs(prev =>
            prev.map(item => {
                if (item.id === active.id) return item;
                const nextSnapshot = applySharedSettings(sourceSnapshot, snapshot(item));
                const nextHistory = commit(item.history, nextSnapshot);
                if (nextHistory !== item.history) {
                    markDirty(item.id);
                    syncedCount++;
                }
                return { ...item, history: nextHistory };
            }),
        );
        setNotice(
            syncedCount > 0
                ? t.syncNoticeUpdated(styleShortName(sourceSnapshot.styleId, language), tabs.length - 1)
                : t.syncNoticeUnchanged,
        );
    }

    function beginEnhancement(request: EnhancementRequest) {
        if (!active) return;
        setNotice('');
        finishDraft();
        const targetId = active.id;
        void runEnhancement(
            active,
            request,
            task => setEnhancementTasks(prev => ({ ...prev, [targetId]: task })),
            (result, persisted) => {
                // Read the latest snapshot, including edits made while the model was working.
                finishDraft();
                markDirty(targetId);
                setTabs(prev =>
                    prev.map(item =>
                        item.id === targetId
                            ? {
                                  ...item,
                                  history: commit(item.history, {
                                      ...cloneSnapshot(snapshot(item)),
                                      enhancement: { enabled: true, resultId: result.id, strength: 100, sharpen: 25 },
                                  }),
                              }
                            : item,
                    ),
                );
                if (!persisted) setNotice(t.enhanceNotPersisted);
            },
            referencedResults(tabs),
        ).catch(error => setNotice(error.message));
    }

    function pickCaption(candidates: readonly Caption[], currentId: string) {
        const id = pickRandomCaption(candidates, [...recentRandom.current.filter(item => item !== currentId), currentId]).id;
        recentRandom.current = [...recentRandom.current, id].slice(-10);
        return id;
    }

    function pickFrameStyle(candidates: readonly FrameStyle[], currentId: FrameStyleId) {
        const id = pickRandomFrameStyle(candidates, [
            ...recentRandomFrames.current.filter(item => item !== currentId),
            currentId,
        ]).id;
        recentRandomFrames.current = [...recentRandomFrames.current, id].slice(-10);
        return id;
    }

    function openFrameStylePicker() {
        if (!active || !current) return;
        finishDraft();
        setCaptionPicker(null);
        setFrameStylePicker({
            tabId: active.id,
            originalId: current.frameStyleId,
            previewId: current.frameStyleId,
        });
    }

    function confirmFrameStylePicker() {
        if (!frameStylePicker) return;
        const { tabId, originalId, previewId } = frameStylePicker;
        setFrameStylePicker(null);
        if (previewId !== originalId) {
            commitEdit(s => ({ ...s, frameStyleId: previewId }), tabId);
        }
    }

    function openCaptionPicker() {
        if (!active || !current) return;
        finishDraft();
        setFrameStylePicker(null);
        setCaptionPicker({
            tabId: active.id,
            originalId: current.captionId,
            previewId: current.captionId,
        });
    }

    function confirmCaptionPicker() {
        if (!captionPicker) return;
        const { tabId, originalId, previewId } = captionPicker;
        setCaptionPicker(null);
        if (previewId !== originalId) {
            commitEdit(s => ({ ...s, captionId: previewId }), tabId);
        }
    }

    async function importFiles(files: File[]) {
        if (!files.length) return;
        finishDraft();
        setImporting(true);
        for (const file of files) {
            try {
                const image = await prepareImageImport(file);
                const bitmap = await decode(image);
                const width = bitmap.width;
                const height = bitmap.height;
                bitmap.close();
                const present = await detectExif(image);
                const id = crypto.randomUUID();
                const tab: PhotoTab = {
                    id,
                    name: file.name,
                    mimeType: image.type,
                    blob: image,
                    width,
                    height,
                    createdAt: Date.now(),
                    exifContainerPresent: present,
                    exifConsent: false,
                    exifPrompted: false,
                    history: { entries: [initialSnapshot()], cursor: 0 },
                    savedAt: 0,
                };
                markDirty(id);
                setTabs(prev => [...prev, tab]);
                setCaptionPicker(null);
                setFrameStylePicker(null);
                setActiveId(id);
                setNotice('');
            } catch (e) {
                setNotice(e instanceof Error ? e.message : t.importFailed);
            }
        }
        setImporting(false);
    }

    function closeTab(id: string) {
        if (activeTask(enhancementTasks[id])) {
            if (!window.confirm(t.confirmCancelEnhanceClose)) return;
            cancelEnhancement(id);
        }
        finishDraft();
        if (hasDirty(id) && !window.confirm(t.confirmUnsavedClose)) return;
        setCaptionPicker(null);
        setFrameStylePicker(null);
        const index = tabs.findIndex(item => item.id === id);
        const next = tabs.filter(item => item.id !== id);
        setTabs(next);
        if (activeId === id) {
            setActiveId(next[Math.min(index, next.length - 1)]?.id ?? null);
        }
        setExifData(prev => {
            const n = { ...prev };
            delete n[id];
            return n;
        });
        removeTabFromStorage(id);
    }

    function frame(value: boolean) {
        if (!active) return;
        if (!value) {
            setCaptionPicker(null);
            setFrameStylePicker(null);
        }
        commitEdit(s => ({ ...s, frameEnabled: value }));
        if (value && active.exifContainerPresent && !active.exifPrompted) {
            setDialog(active.id);
        }
        if (!value) {
            setExifData(prev => {
                const n = { ...prev };
                delete n[active.id];
                return n;
            });
        }
    }

    function exif(value: boolean) {
        if (!active) return;
        if (value && !active.exifConsent) {
            setDialog(active.id);
            return;
        }
        commitEdit(s => ({ ...s, showExif: value }));
        if (!value) {
            setExifData(prev => {
                const n = { ...prev };
                delete n[active.id];
                return n;
            });
        }
    }

    function decideExif(allow: boolean) {
        const id = dialog;
        if (!id) return;
        setDialog(null);
        markDirty(id);
        setTabs(prev =>
            prev.map(item =>
                item.id === id
                    ? {
                          ...item,
                          exifConsent: allow,
                          exifPrompted: true,
                          history: allow
                              ? commit(item.history, { ...cloneSnapshot(snapshot(item)), showExif: true })
                              : item.history,
                      }
                    : item,
            ),
        );
        if (!allow) {
            setExifData(prev => {
                const n = { ...prev };
                delete n[id];
                return n;
            });
        }
    }

    async function doExport() {
        if (!active || !current || exporting) return;
        const exportTab = { ...active, history: commit(active.history, current) };
        finishDraft();
        setExporting(true);
        setExportProgress('0%');
        try {
            const blob = await exportPng(
                exportTab,
                {
                    ...content,
                    frameStyleId: current.frameStyleId,
                    captionId: current.captionId,
                    showExif: current.showExif,
                },
                (done, total) => setExportProgress(`${Math.round((done / total) * 100)}%`),
            );
            const saved = await download(
                blob,
                exportFilename(
                    active.name,
                    current.styleId,
                    current.enhancement.enabled && current.enhancement.strength > 0,
                ),
            );
            if (saved) {
                setNotice(window.pixelToonDesktop ? t.pngSavedDesktop : t.pngSavedBrowser);
            }
        } catch (e) {
            setNotice(t.exportFailed(e instanceof Error ? e.message : t.unknownError));
        } finally {
            setExporting(false);
        }
    }

    useDesktopIntegration({
        ready,
        importing,
        exporting,
        onImportTrigger: () => fileInput.current?.click(),
        onImportFiles: importFiles,
        onExport: doExport,
        onUndo: undo,
        onNotice: setNotice,
        onBeforeCloseFlush: async () => {
            cancelAllEnhancements();
            const pending = draftRef.current;
            const latest = pending
                ? tabs.map(tab => (tab.id === pending.tabId ? { ...tab, history: commit(tab.history, pending.value) } : tab))
                : tabs;
            await flushWorkspace(latest, activeId);
        },
        commandDeps: [active, current, exporting, tabs],
        closeDeps: [tabs, activeId, ready, importing, exporting],
    });

    useEditorShortcuts({
        onUndo: undo,
        onShowOriginalChange: setShowOriginal,
        onImportFiles: importFiles,
        onDraggingChange: setDragging,
        deps: [active, tabs],
    });

    const styleName = current ? styleShortName(current.styleId, language) : t.welcomeStyle;
    const platform = window.pixelToonDesktop?.platform;
    const platformClass = platform === 'darwin' ? 'desktop-mac' : platform === 'win32' ? 'desktop-win' : '';

    return (
        <div className={`app ${platformClass}`}>
            <header className="topbar">
                <div className="brand">
                    <div className="brand-mark">
                        <StudioIcon name="sparkles" size={23} />
                    </div>
                    <div>
                        <strong>Pixel & Toon</strong>
                        <small>{t.brandSubtitle}</small>
                    </div>
                </div>
                <div className="topbar-right">
                    {saveFailed && (
                        <div className="save-status failed">
                            <i />
                            {t.saveFailedStatus}
                        </div>
                    )}
                    <SettingsPanel />
                    <button className="top-import" onClick={() => fileInput.current?.click()}>
                        <StudioIcon name="plus" size={17} />
                        <span>{t.importButton}</span>
                    </button>
                </div>
            </header>

            <div className="tabs">
                <div className="tabs-scroll">
                    {tabs.map((item, i) => (
                        <div key={item.id} className={`tab ${item.id === activeId ? 'active' : ''}`}>
                            <button
                                className="tab-main"
                                onClick={() => {
                                    finishDraft();
                                    setCaptionPicker(null);
                                    setFrameStylePicker(null);
                                    setActiveId(item.id);
                                }}
                            >
                                <span className="tab-index">{String(i + 1).padStart(2, '0')}</span>
                                <span className="tab-name" title={item.name}>
                                    {item.name}
                                </span>
                            </button>
                            <button
                                className="tab-close"
                                aria-label={t.closeTabAria(item.name)}
                                onClick={() => closeTab(item.id)}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    {tabs.length === 0 && (
                        <div className="tab-placeholder">
                            <StudioIcon name="photo" size={16} /> {t.workspacePlaceholder}
                        </div>
                    )}
                </div>
                <div className="tab-count">{t.tabCount(tabs.length)}</div>
            </div>

            <main className="workspace">
                <div className="work-area">
                    {active && current ? (
                        <div className="canvas-wrap">
                            {original ? (
                                <CanvasStage
                                    heading={
                                        <div className="work-photo-info">
                                            <span className="eyebrow">
                                                {t.photoEyebrow(String(tabs.indexOf(active) + 1).padStart(2, '0'))}
                                            </span>
                                            <h1>{active.name.replace(/\.[^.]+$/, '')}</h1>
                                            <p>
                                                {styleName} <span>·</span> {outputSize?.width ?? active.width} ×{' '}
                                                {outputSize?.height ?? active.height} px
                                                {current.enhancement.enabled && current.enhancement.strength > 0
                                                    ? t.enhancedBadge
                                                    : ''}
                                            </p>
                                        </div>
                                    }
                                    resultKey={current.enhancement.resultId}
                                    original={original}
                                    processed={processed}
                                    width={source?.width ?? original.width}
                                    height={source?.height ?? original.height}
                                    frameEnabled={current.frameEnabled}
                                    content={content}
                                    showOriginal={showOriginal}
                                    processing={processing}
                                />
                            ) : (
                                <div className="loading-stage">{t.loadingPhoto}</div>
                            )}
                        </div>
                    ) : (
                        <div className="empty-stage">
                            <div className="empty-art" aria-hidden="true">
                                <div className="art-orbit" />
                                <div className="art-frame art-back" />
                                <div className="art-frame">
                                    <div className="art-sun" />
                                    <div className="art-hill a" />
                                    <div className="art-hill b" />
                                    <span className="art-caption">a little everyday magic</span>
                                </div>
                                <div className="art-float f1">
                                    <StudioIcon name="sparkles" size={24} />
                                </div>
                                <div className="art-float f2">
                                    <StudioIcon name="photo" size={22} />
                                </div>
                            </div>
                            <span className="eyebrow">{t.emptyEyebrow}</span>
                            <h1>
                                {t.emptyHeadingLine1}
                                <br />
                                <em>{t.emptyHeadingLine2}</em>
                            </h1>
                            <p>
                                {t.emptyDescriptionLine1}
                                <br />
                                {t.emptyDescriptionLine2}
                            </p>
                            <button className="empty-import" onClick={() => fileInput.current?.click()}>
                                <StudioIcon name="plus" size={20} />
                                {t.choosePhoto}
                                <StudioIcon name="arrow" size={18} />
                            </button>
                            <div className="empty-hint">
                                <span className="desktop-import-hint">{t.dropOrPasteHint}</span>
                                {t.supportedFormatsHint}
                            </div>
                            <div className="privacy-note">
                                <StudioIcon name="lock" size={13} />
                                {t.privacyNote}
                            </div>
                        </div>
                    )}
                </div>

                <ControlsPanel
                    tab={active}
                    tabCount={tabs.length}
                    snapshot={current}
                    outputSize={outputSize}
                    enhancementPanel={
                        active && current ? (
                            <>
                                <AutoColorPanel
                                    selection={current.autoColor}
                                    onUpgrade={() =>
                                        commitEdit(s => ({
                                            ...s,
                                            autoColor: { ...s.autoColor, algorithmVersion: 2 },
                                        }))
                                    }
                                    onEnable={enabled =>
                                        commitEdit(s => ({
                                            ...s,
                                            autoColor: { ...s.autoColor, enabled },
                                        }))
                                    }
                                    onStrength={strength =>
                                        changeDraft(s => {
                                            s.autoColor.strength = strength;
                                        })
                                    }
                                    onCommit={finishDraft}
                                />
                                <EnhancementPanel
                                    key={active.id}
                                    tab={active}
                                    snapshot={current}
                                    task={enhancementTasks[active.id]}
                                    protectedIds={referencedResults(tabs)}
                                    onRun={beginEnhancement}
                                    onCancel={() => cancelEnhancement(active.id)}
                                    onEnable={enabled =>
                                        commitEdit(s => ({
                                            ...s,
                                            enhancement: { ...s.enhancement, enabled },
                                        }))
                                    }
                                    onStrength={strength =>
                                        changeDraft(s => {
                                            s.enhancement.strength = strength;
                                        })
                                    }
                                    onSharpen={sharpen =>
                                        changeDraft(s => {
                                            if (sharpen > 0) s.enhancement.sharpen = sharpen;
                                            else delete s.enhancement.sharpen;
                                        })
                                    }
                                    onCommit={finishDraft}
                                />
                            </>
                        ) : null
                    }
                    exif={active ? (exifData[active.id] ?? null) : null}
                    exporting={exporting}
                    exportProgress={exportProgress}
                    onStyle={styleId => commitEdit(s => ({ ...s, styleId }))}
                    onParam={(key, value) =>
                        changeDraft(s => {
                            s.params[s.styleId][key] = value;
                        })
                    }
                    onGlobal={(key, value) =>
                        changeDraft(s => {
                            s.global[key] = value;
                        })
                    }
                    onCommit={finishDraft}
                    onResetParam={key =>
                        commitEdit(s => {
                            s.params[s.styleId][key] = (
                                styleParams(s.styleId) as Record<string, { default: number }>
                            )[key].default;
                            return s;
                        })
                    }
                    onResetGlobal={key =>
                        commitEdit(s => {
                            s.global[key] = GLOBAL[key].default;
                            return s;
                        })
                    }
                    onFrame={frame}
                    onFrameStyle={() => {
                        const id = pickFrameStyle(FRAME_STYLES, current?.frameStyleId ?? DEFAULT_FRAME_STYLE_ID);
                        commitEdit(s => ({ ...s, frameStyleId: id }));
                    }}
                    onOpenFrameStyle={openFrameStylePicker}
                    onExif={exif}
                    onCaption={() => {
                        const id = pickCaption(CAPTIONS, current?.captionId ?? '');
                        commitEdit(s => ({ ...s, captionId: id }));
                    }}
                    onOpenCaption={openCaptionPicker}
                    onSyncAll={syncAllTabs}
                    onExport={doExport}
                    onUndo={() => undo(-1)}
                    onRedo={() => undo(1)}
                />
            </main>

            <input
                ref={fileInput}
                type="file"
                accept={FILE_ACCEPT}
                multiple
                hidden
                onChange={e => {
                    void importFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                }}
            />

            {importing && <div className="toast">{t.importingToast}</div>}
            {notice && (
                <div className="toast" role="status">
                    <span>{notice}</span>
                    <button aria-label={t.closeNoticeAria} onClick={() => setNotice('')}>
                        ×
                    </button>
                </div>
            )}
            {dragging && (
                <div className="drop-overlay">
                    <div>
                        {t.dropOverlayTitle}
                        <br />
                        <span>HEIC · PNG · JPEG · WebP</span>
                    </div>
                </div>
            )}
            {frameStylePicker && frameStylePicker.tabId === activeId && (
                <FrameStylePickerDialog
                    selectedId={frameStylePicker.previewId}
                    photoWidth={outputSize?.width ?? active?.width}
                    photoHeight={outputSize?.height ?? active?.height}
                    onPreview={id => setFrameStylePicker(prev => (prev ? { ...prev, previewId: id } : prev))}
                    onConfirm={confirmFrameStylePicker}
                    onCancel={() => setFrameStylePicker(null)}
                    onRandom={pickFrameStyle}
                />
            )}
            {captionPicker && captionPicker.tabId === activeId && (
                <CaptionPickerDialog
                    selectedId={captionPicker.previewId}
                    onPreview={id => setCaptionPicker(prev => (prev ? { ...prev, previewId: id } : prev))}
                    onConfirm={confirmCaptionPicker}
                    onCancel={() => setCaptionPicker(null)}
                    onRandom={pickCaption}
                />
            )}
            {showLanguageOnboarding && (
                <LanguageOnboardingDialog onClose={() => setShowLanguageOnboarding(false)} />
            )}
            {dialog && (
                <div
                    className="modal-backdrop"
                    onMouseDown={e => {
                        if (e.target === e.currentTarget) decideExif(false);
                    }}
                >
                    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
                        <div className="modal-icon">◈</div>
                        <span className="eyebrow">PRIVACY FIRST</span>
                        <h2 id="privacy-title">{t.privacyModalTitle}</h2>
                        <p>{t.privacyModalBody}</p>
                        <div className="modal-actions">
                            <button onClick={() => decideExif(false)}>{t.privacyDecline}</button>
                            <button className="primary" onClick={() => decideExif(true)}>
                                {t.privacyAllow}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
