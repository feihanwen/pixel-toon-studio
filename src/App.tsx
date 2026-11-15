import { useEffect, useRef, useState } from 'react';
import { type AutoColorPlan } from './imaging/autoColor';
import { AutoColorPanel } from './components/AutoColorPanel';
import { StudioIcon } from './components/StudioIcon';
import { STYLES, GLOBAL, styleParams } from './config/styles';
import { CAPTIONS, pickRandomCaption, type Caption } from './config/captions';
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

export function App() {
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
    const [captionPicker, setCaptionPicker] = useState<CaptionPickerState | null>(null);
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

    const active = tabs.find(t => t.id === activeId) ?? null;
    const current = active ? (draft?.tabId === active.id ? draft.value : snapshot(active)) : null;
    const content = {
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

    const { ready, saveFailed, status, markDirty, hasDirty, removeTabFromStorage, flushWorkspace } = useWorkspaceSync({
        tabs,
        activeId,
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
                    setNotice(`预览处理失败：${e instanceof Error ? e.message : '未知错误'}`);
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
            .catch(() => setNotice('EXIF 信息读取失败，已使用文案'));
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
        setTabs(prev => prev.map(t => (t.id === d.tabId ? { ...t, history: commit(t.history, d.value) } : t)));
    }

    function commitEdit(updater: (s: EditorSnapshot) => EditorSnapshot, id = activeId) {
        if (!id) return;
        finishDraft();
        markDirty(id);
        setTabs(prev =>
            prev.map(t => (t.id === id ? { ...t, history: commit(t.history, updater(cloneSnapshot(snapshot(t)))) } : t)),
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
        setTabs(prev => prev.map(t => (t.id === active.id ? { ...t, history: moveHistory(t.history, delta) } : t)));
    }

    function syncAllTabs() {
        if (!active || !current || tabs.length <= 1) return;
        const sourceSnapshot = cloneSnapshot(current);
        finishDraft();
        let syncedCount = 0;
        setTabs(prev =>
            prev.map(t => {
                if (t.id === active.id) return t;
                const nextSnapshot = applySharedSettings(sourceSnapshot, snapshot(t));
                const nextHistory = commit(t.history, nextSnapshot);
                if (nextHistory !== t.history) {
                    markDirty(t.id);
                    syncedCount++;
                }
                return { ...t, history: nextHistory };
            }),
        );
        setNotice(
            syncedCount > 0
                ? `已将「${STYLES[sourceSnapshot.styleId].short}」风格与参数同步到其余 ${tabs.length - 1} 张照片`
                : '其余照片已是相同风格与参数',
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
                    prev.map(t =>
                        t.id === targetId
                            ? {
                                  ...t,
                                  history: commit(t.history, {
                                      ...cloneSnapshot(snapshot(t)),
                                      enhancement: { enabled: true, resultId: result.id, strength: 100 },
                                  }),
                              }
                            : t,
                    ),
                );
                if (!persisted) setNotice('增强结果未保存到本机，请在关闭页面前导出');
            },
            referencedResults(tabs),
        ).catch(error => setNotice(error.message));
    }

    function pickCaption(candidates: readonly Caption[], currentId: string) {
        const id = pickRandomCaption(candidates, [...recentRandom.current.filter(item => item !== currentId), currentId]).id;
        recentRandom.current = [...recentRandom.current, id].slice(-10);
        return id;
    }

    function openCaptionPicker() {
        if (!active || !current) return;
        finishDraft();
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
                setActiveId(id);
                setNotice('');
            } catch (e) {
                setNotice(e instanceof Error ? e.message : '图片导入失败');
            }
        }
        setImporting(false);
    }

    function closeTab(id: string) {
        if (activeTask(enhancementTasks[id])) {
            if (!window.confirm('这张照片正在清晰化，关闭将尝试取消任务。确定关闭吗？')) return;
            cancelEnhancement(id);
        }
        finishDraft();
        if (hasDirty(id) && !window.confirm('这张照片的最新编辑尚未成功保存到本机。确定要关闭吗？')) return;
        setCaptionPicker(null);
        const index = tabs.findIndex(t => t.id === id);
        const next = tabs.filter(t => t.id !== id);
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
        if (!value) setCaptionPicker(null);
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
            prev.map(t =>
                t.id === id
                    ? {
                          ...t,
                          exifConsent: allow,
                          exifPrompted: true,
                          history: allow
                              ? commit(t.history, { ...cloneSnapshot(snapshot(t)), showExif: true })
                              : t.history,
                      }
                    : t,
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
                { ...content, captionId: current.captionId, showExif: current.showExif },
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
                setNotice(window.pixelToonDesktop ? 'PNG 已保存到所选位置' : 'PNG 已导出到下载文件夹');
            }
        } catch (e) {
            setNotice(`导出失败：${e instanceof Error ? e.message : '未知错误'}`);
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

    const styleName = current ? STYLES[current.styleId].short : '欢迎使用';

    return (
        <div className={`app ${window.pixelToonDesktop?.platform === 'darwin' ? 'desktop-mac' : ''}`}>
            <header className="topbar">
                <div className="brand">
                    <div className="brand-mark">
                        <StudioIcon name="sparkles" size={23} />
                    </div>
                    <div>
                        <strong>Pixel & Toon</strong>
                        <small>你的随身创作室</small>
                    </div>
                </div>
                <div className="topbar-right">
                    <div className={`save-status ${saveFailed ? 'failed' : ''}`}>
                        <i />
                        {ready ? status : '正在读取工作区'}
                    </div>
                    <button className="top-import" onClick={() => fileInput.current?.click()}>
                        <StudioIcon name="plus" size={17} />
                        <span>导入图片</span>
                    </button>
                </div>
            </header>

            <div className="tabs">
                <div className="tabs-scroll">
                    {tabs.map((t, i) => (
                        <div key={t.id} className={`tab ${t.id === activeId ? 'active' : ''}`}>
                            <button
                                className="tab-main"
                                onClick={() => {
                                    finishDraft();
                                    setCaptionPicker(null);
                                    setActiveId(t.id);
                                }}
                            >
                                <span className="tab-index">{String(i + 1).padStart(2, '0')}</span>
                                <span className="tab-name" title={t.name}>
                                    {t.name}
                                </span>
                            </button>
                            <button className="tab-close" aria-label={`关闭 ${t.name}`} onClick={() => closeTab(t.id)}>
                                ×
                            </button>
                        </div>
                    ))}
                    {tabs.length === 0 && (
                        <div className="tab-placeholder">
                            <StudioIcon name="photo" size={16} /> 照片工作区
                        </div>
                    )}
                </div>
                <div className="tab-count">{tabs.length} 张照片</div>
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
                                                照片 / {String(tabs.indexOf(active) + 1).padStart(2, '0')}
                                            </span>
                                            <h1>{active.name.replace(/\.[^.]+$/, '')}</h1>
                                            <p>
                                                {styleName} <span>·</span> {outputSize?.width ?? active.width} ×{' '}
                                                {outputSize?.height ?? active.height} px
                                                {current.enhancement.enabled && current.enhancement.strength > 0
                                                    ? ' · 已增强'
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
                                <div className="loading-stage">正在打开图片…</div>
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
                            <span className="eyebrow">灵感，从一张照片开始</span>
                            <h1>
                                把日常，
                                <br />
                                <em>变成心动的画面。</em>
                            </h1>
                            <p>
                                动漫、像素、水彩，发现照片的另一种可能。
                                <br />
                                一点光色，一点想象，刚刚好的创作。
                            </p>
                            <button className="empty-import" onClick={() => fileInput.current?.click()}>
                                <StudioIcon name="plus" size={20} />
                                选择图片
                                <StudioIcon name="arrow" size={18} />
                            </button>
                            <div className="empty-hint">
                                <span className="desktop-import-hint">拖入图片，或按 ⌘ / Ctrl + V 粘贴 · </span>
                                支持 HEIC、PNG、JPEG、WebP
                            </div>
                            <div className="privacy-note">
                                <StudioIcon name="lock" size={13} />
                                照片留在本机，安心创作
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

            {importing && <div className="toast">正在导入图片…</div>}
            {notice && (
                <div className="toast" role="status">
                    <span>{notice}</span>
                    <button aria-label="关闭提示" onClick={() => setNotice('')}>
                        ×
                    </button>
                </div>
            )}
            {dragging && (
                <div className="drop-overlay">
                    <div>
                        将图片放在这里
                        <br />
                        <span>HEIC · PNG · JPEG · WebP</span>
                    </div>
                </div>
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
                        <h2 id="privacy-title">读取拍摄信息？</h2>
                        <p>
                            读取 EXIF 可能会有泄露个人设备与拍摄时间等信息的风险。我们只读取设备型号、快门、光圈、ISO
                            和拍摄日期，并将你选择展示的信息印在相框上。原图与信息不会上传。
                        </p>
                        <div className="modal-actions">
                            <button onClick={() => decideExif(false)}>不读取，使用文案</button>
                            <button className="primary" onClick={() => decideExif(true)}>
                                同意读取并展示
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
