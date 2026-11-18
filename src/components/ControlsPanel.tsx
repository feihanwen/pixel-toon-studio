import {
    CORE_PARAM_KEYS,
    GLOBAL,
    STYLES,
    STYLE_PRESETS,
    matchingStylePresetId,
    styleParams,
    styleShortName,
    type GlobalKey,
    type StyleId,
} from '../config/styles';
import type { EditorSnapshot, PhotoTab, ExifFields } from '../types/document';
import { captionText } from '../config/captions';
import { frameCategoryLabel, frameStyleName, getFrameStyle } from '../config/frames';
import { frameKind, type FrameContent } from '../imaging/frame';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import type { ExportFormat } from '../imaging/export';
import { ParameterSlider } from './ParameterSlider';
import { StudioIcon } from './StudioIcon';
import { duotonePalette } from '../worker/styles/duotone';
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
    topBanner?: ReactNode;
    enhancementPanel?: ReactNode;
    mosaicPanel?: ReactNode;
    pickerPanel?: ReactNode;
    outputSize?: { width: number; height: number };
    tab: PhotoTab | null;
    tabCount?: number;
    snapshot: EditorSnapshot | null;
    exif: ExifFields | null;
    exportFormat: ExportFormat;
    exporting: boolean;
    exportProgress: string;
    onStyle: (style: StyleId) => void;
    onApplyPreset: (params: Record<string, number>) => void;
    onParam: (key: string, value: number) => void;
    onGlobal: (key: GlobalKey, value: number) => void;
    onCommit: () => void;
    onResetParam: (key: string) => void;
    onResetGlobal: (key: GlobalKey) => void;
    onFrame: (value: boolean) => void;
    onFrameStyle: () => void;
    onOpenFrameStyle: () => void;
    onExif: (value: boolean) => void;
    onCaption: () => void;
    onOpenCaption: () => void;
    onExportFormatChange: (format: ExportFormat) => void;
    onOpenBatchExport: () => void;
    onExport: () => void;
    onUndo: () => void;
    onRedo: () => void;
}

export function ControlsPanel(props: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const { tab, snapshot: s, exif, pickerPanel } = props;
    const isPicking = Boolean(tab && s && pickerPanel);
    const asideRef = useRef<HTMLElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const wasPickingRef = useRef(false);
    const frameStyle = getFrameStyle(s?.frameStyleId);
    const content: FrameContent = {
        frameStyleId: s?.frameStyleId,
        captionId: s?.captionId ?? '',
        showExif: s?.showExif ?? false,
        exif,
    };
    const definitions = s ? styleParams(s.styleId) : null;
    const coreKeys: readonly string[] = s ? CORE_PARAM_KEYS[s.styleId] : [];
    const advancedEntries = definitions
        ? Object.entries(definitions).filter(([key]) => !coreKeys.includes(key))
        : [];
    const presets = s ? STYLE_PRESETS[s.styleId] : [];
    const activePresetId = s ? matchingStylePresetId(s.styleId, s.params[s.styleId]) : null;
    const isExifContent = Boolean(content.showExif && content.exif && Object.values(content.exif).some(Boolean));

    useEffect(() => {
        if ((isPicking || props.topBanner) && asideRef.current) {
            asideRef.current.scrollTop = 0;
        }
        if (wasPickingRef.current && !isPicking) {
            returnFocusRef.current?.focus();
            returnFocusRef.current = null;
        }
        wasPickingRef.current = isPicking;
    }, [isPicking, Boolean(props.topBanner)]);

    function openFrameStylePicker() {
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        props.onOpenFrameStyle();
    }

    function openCaptionPicker() {
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        props.onOpenCaption();
    }

    return (
        <aside ref={asideRef} className={`controls${isPicking ? ' is-picking' : ''}`} aria-label={t.controlsAria}>
            {isPicking ? pickerPanel : null}
            {!isPicking ? props.topBanner : null}
            <div className="controls-top">
                <div className="controls-title">
                    <span className="controls-symbol">
                        <StudioIcon name="sliders" size={20} />
                    </span>
                    <h2>{t.controlsTitle}</h2>
                </div>
                <p>{t.controlsSubtitle}</p>
            </div>
            {!tab || !s ? (
                <div className="controls-empty">
                    <div className="section-heading">
                        <span>{t.discoverStyle}</span>
                        <span>{t.eightInspirations}</span>
                    </div>
                    <div className="style-preview-grid">
                        {(Object.keys(STYLES) as StyleId[]).map(id => (
                            <div className={`style-preview ${id}`} key={id}>
                                <span aria-hidden="true">{STYLES[id].icon}</span>
                                <strong>{styleShortName(id, language)}</strong>
                            </div>
                        ))}
                    </div>
                    <div className="empty-tools-note">
                        <StudioIcon name="photo" size={22} />
                        <p>
                            {t.emptyToolsLine1}
                            <br />
                            <span>{t.emptyToolsLine2}</span>
                        </p>
                    </div>
                    <div className="tool-benefits">
                        <span>
                            <StudioIcon name="sparkles" size={16} />
                            {t.benefitSmartColor}
                        </span>
                        <span>
                            <StudioIcon name="photo" size={16} />
                            {t.benefitEnhance}
                        </span>
                    </div>
                </div>
            ) : (
                <>
                    <section className="control-section">
                        <div className="section-heading">
                            <span>{t.visualStyleTitle}</span>
                            <span>{t.stylesCount(Object.keys(STYLES).length)}</span>
                        </div>
                        <div className="style-grid">
                            {(Object.keys(STYLES) as StyleId[]).map(id => (
                                <button
                                    key={id}
                                    className={`style-card ${s.styleId === id ? 'selected' : ''}`}
                                    onClick={() => props.onStyle(id)}
                                    aria-pressed={s.styleId === id}
                                >
                                    <span aria-hidden="true" className={`style-icon ${id}`}>
                                        {STYLES[id].icon}
                                    </span>
                                    <span className="style-name">{styleShortName(id, language)}</span>
                                    {language !== 'en' && <span className="style-en">{STYLES[id].en}</span>}
                                </button>
                            ))}
                        </div>
                        <div className="style-presets-block">
                            <span className="style-presets-label">{t.stylePresetsLabel}</span>
                            <div className="preset-pills" role="group" aria-label={t.stylePresetsLabel}>
                                {presets.map(preset => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        aria-pressed={activePresetId === preset.id}
                                        onClick={() => props.onApplyPreset(preset.params)}
                                    >
                                        {language === 'en' ? preset.labelEn : preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <details className="control-section style-parameters">
                        <summary>
                            <span>{t.styleParamsTitle(styleShortName(s.styleId, language))}</span>
                            <small>{t.doubleClickReset}</small>
                        </summary>
                        <div className="control-body">
                            {s.styleId === 'duotone' && (
                                <div className="duotone-palette" aria-label={t.duotonePaletteAria}>
                                    {Object.entries(
                                        duotonePalette(s.params.duotone.shadowHue, s.params.duotone.highlightHue),
                                    ).map(([key, rgb]) => (
                                        <span key={key}>
                                            <i style={{ backgroundColor: `rgb(${rgb.join(',')})` }} />
                                            {key === 'dark' ? t.duotoneDark : t.duotoneLight}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {definitions &&
                                coreKeys.map(key => {
                                    const p = definitions[key];
                                    if (!p) return null;
                                    return (
                                        <ParameterSlider
                                            key={`${s.styleId}-${key}`}
                                            label={language === 'en' ? p.labelEn : p.label}
                                            value={s.params[s.styleId][key]}
                                            min={p.min}
                                            max={p.max}
                                            unit={language === 'en' ? (p.unitEn ?? p.unit) : p.unit}
                                            defaultValue={p.default}
                                            onChange={v => props.onParam(key, v)}
                                            onCommit={props.onCommit}
                                            onReset={() => props.onResetParam(key)}
                                        />
                                    );
                                })}
                            {advancedEntries.length > 0 && (
                                <details className="enhance-settings style-advanced-tuning">
                                    <summary>{t.advancedTuningSummary}</summary>
                                    <div className="style-advanced-body">
                                        {advancedEntries.map(([key, p]) => (
                                            <ParameterSlider
                                                key={`${s.styleId}-${key}`}
                                                label={language === 'en' ? p.labelEn : p.label}
                                                value={s.params[s.styleId][key]}
                                                min={p.min}
                                                max={p.max}
                                                unit={language === 'en' ? (p.unitEn ?? p.unit) : p.unit}
                                                defaultValue={p.default}
                                                onChange={v => props.onParam(key, v)}
                                                onCommit={props.onCommit}
                                                onReset={() => props.onResetParam(key)}
                                            />
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    </details>

                    {props.enhancementPanel}
                    {props.mosaicPanel}

                    <details className="control-section global-adjustments">
                        <summary>
                            <span>{t.globalAdjustmentsTitle}</span>
                            <small>{t.globalAdjustmentsSub}</small>
                        </summary>
                        <div className="control-body">
                            {(Object.keys(GLOBAL) as GlobalKey[]).map(key => (
                                <ParameterSlider
                                    key={key}
                                    label={language === 'en' ? GLOBAL[key].labelEn : GLOBAL[key].label}
                                    value={s.global[key]}
                                    min={GLOBAL[key].min}
                                    max={GLOBAL[key].max}
                                    unit={language === 'en' ? GLOBAL[key].unitEn : GLOBAL[key].unit}
                                    defaultValue={0}
                                    onChange={v => props.onGlobal(key, v)}
                                    onCommit={props.onCommit}
                                    onReset={() => props.onResetGlobal(key)}
                                />
                            ))}
                        </div>
                    </details>

                    <details className="control-section frame-panel">
                        <summary>
                            <span>{t.polaroidFrameTitle}</span>
                            <small>{s.frameEnabled ? frameStyleName(frameStyle, language) : t.frameOff}</small>
                        </summary>
                        <div className="control-body">
                            <label className="toggle-row">
                                <span>
                                    <strong>{t.addFrameToggleTitle}</strong>
                                    <small>{t.addFrameToggleSub}</small>
                                </span>
                                <input
                                    type="checkbox"
                                    checked={s.frameEnabled}
                                    onChange={e => props.onFrame(e.target.checked)}
                                />
                                <span className="toggle-ui" />
                            </label>
                            {s.frameEnabled && (
                                <div className="frame-options">
                                    <div className="caption-box frame-style-box">
                                        <div>
                                            <span>{t.frameStyleLabel}</span>
                                            <button onClick={props.onFrameStyle}>{t.shuffleFrameStyle}</button>
                                        </div>
                                        <div className="frame-style-summary">
                                            <i
                                                className="frame-swatch"
                                                style={{ background: frameStyle.previewBackground }}
                                                aria-hidden="true"
                                            />
                                            <div>
                                                <strong>
                                                    {frameStyle.code} {frameStyleName(frameStyle, language)}
                                                </strong>
                                                <small> · {frameCategoryLabel(frameStyle.category, language)}</small>
                                            </div>
                                        </div>
                                        <button className="choose-caption" onClick={openFrameStylePicker}>
                                            {t.browseFrameStyles}
                                        </button>
                                    </div>
                                    {tab.exifContainerPresent && (
                                        <label className="toggle-row exif-toggle">
                                            <span>
                                                <strong>{t.readExifTitle}</strong>
                                                <small>{t.readExifSub}</small>
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={s.showExif}
                                                onChange={e => props.onExif(e.target.checked)}
                                            />
                                            <span className="toggle-ui" />
                                        </label>
                                    )}
                                    {isExifContent ? (
                                        <div className="caption-box">
                                            <span>{t.exifBoxTitle}</span>
                                            <p>
                                                {[exif?.model, exif?.exposure, exif?.aperture, exif?.iso, exif?.date]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="caption-box">
                                            <div>
                                                <span>{t.captionBoxTitle}</span>
                                                <button onClick={props.onCaption}>{t.shuffleCaption}</button>
                                            </div>
                                            <p>{captionText(s.captionId)}</p>
                                            <button className="choose-caption" onClick={openCaptionPicker}>
                                                {t.browseCaptions}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </details>

                    <div className="controls-footer">
                        <div className="history-actions">
                            <button onClick={props.onUndo} disabled={tab.history.cursor === 0}>
                                {t.undoButton}
                            </button>
                            <button
                                onClick={props.onRedo}
                                disabled={tab.history.cursor >= tab.history.entries.length - 1}
                            >
                                {t.redoButton}
                            </button>
                        </div>
                        {(props.tabCount ?? 0) >= 1 && (
                            <button
                                type="button"
                                className="sync-tabs-button"
                                onClick={props.onOpenBatchExport}
                                disabled={props.exporting}
                            >
                                {t.batchExportOpenBtn(props.tabCount ?? 0)}
                            </button>
                        )}
                        <div className="export-format-toggle" role="group" aria-label={t.exportFormatLabel}>
                            <button
                                type="button"
                                aria-pressed={props.exportFormat === 'png'}
                                disabled={props.exporting}
                                onClick={() => props.onExportFormatChange('png')}
                            >
                                {t.exportFormatPng}
                            </button>
                            <button
                                type="button"
                                aria-pressed={props.exportFormat === 'jpeg'}
                                disabled={props.exporting}
                                onClick={() => props.onExportFormatChange('jpeg')}
                            >
                                {t.exportFormatJpeg}
                            </button>
                        </div>
                        <button className="export-button" onClick={props.onExport} disabled={props.exporting}>
                            {props.exporting
                                ? t.exportingButton(props.exportProgress)
                                : t.exportButtonWithFormat(props.exportFormat === 'jpeg' ? 'JPEG' : 'PNG')}{' '}
                            <span>↗</span>
                        </button>
                        <div className="export-note">
                            {s.frameEnabled
                                ? t.exportNoteWithFrame(frameStyleName(frameStyle, language), frameKind(content, language))
                                : t.exportNoteNoFrame}{' '}
                            · {props.outputSize?.width ?? tab.width} × {props.outputSize?.height ?? tab.height} px
                        </div>
                    </div>
                </>
            )}
        </aside>
    );
}
