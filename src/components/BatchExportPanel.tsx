import { useEffect, useRef } from 'react';
import type { PhotoTab } from '../types/document';
import { snapshot } from '../types/document';
import { styleShortName } from '../config/styles';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import type { ExportFormat } from '../imaging/export';
import './caption-picker.css';

interface Props {
    tabs: PhotoTab[];
    activeId: string | null;
    selectedIds: readonly string[];
    format: ExportFormat;
    exporting: boolean;
    batchProgress: { done: number; total: number } | null;
    onToggleTab: (id: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    onFormatChange: (format: ExportFormat) => void;
    onExportSelected: () => void;
    onClose: () => void;
}

export function BatchExportPanel({
    tabs,
    activeId,
    selectedIds,
    format,
    exporting,
    batchProgress,
    onToggleTab,
    onSelectAll,
    onClearAll,
    onFormatChange,
    onExportSelected,
    onClose,
}: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const panelRef = useRef<HTMLDivElement>(null);
    const selectedSet = new Set(selectedIds);
    const allSelected = tabs.length > 0 && tabs.every(tab => selectedSet.has(tab.id));
    const fmtLabel = format === 'jpeg' ? 'JPEG' : 'PNG';

    useEffect(() => {
        panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    }, []);

    function handleKeyDown(event: React.KeyboardEvent) {
        if (event.key === 'Escape' && !exporting) {
            event.preventDefault();
            onClose();
        }
    }

    return (
        <div
            ref={panelRef}
            className="inline-picker batch-export-picker"
            role="region"
            aria-labelledby="batch-export-title"
            onKeyDown={handleKeyDown}
        >
            <div className="caption-dialog-heading">
                <div>
                    <span className="eyebrow">BATCH EXPORT</span>
                    <h2 id="batch-export-title">{t.batchDialogTitle}</h2>
                    <p>{t.batchDialogSub}</p>
                </div>
                <button
                    type="button"
                    className="caption-close"
                    aria-label={t.batchDialogCloseAria}
                    disabled={exporting}
                    onClick={onClose}
                >
                    ×
                </button>
            </div>

            <div className="batch-toolbar">
                <button
                    type="button"
                    className="batch-select-all-btn"
                    disabled={exporting || tabs.length === 0}
                    onClick={allSelected ? onClearAll : onSelectAll}
                >
                    {allSelected ? t.batchClearAll : t.batchSelectAll}
                </button>
                <span className="batch-count-label">{t.batchSelectedCount(selectedIds.length, tabs.length)}</span>
            </div>

            <div className="batch-format-row" role="group" aria-label={t.exportFormatLabel}>
                <button
                    type="button"
                    aria-pressed={format === 'png'}
                    disabled={exporting}
                    onClick={() => onFormatChange('png')}
                >
                    {t.exportFormatPng}
                </button>
                <button
                    type="button"
                    aria-pressed={format === 'jpeg'}
                    disabled={exporting}
                    onClick={() => onFormatChange('jpeg')}
                >
                    {t.exportFormatJpeg}
                </button>
            </div>

            <div className="caption-list batch-photo-list" role="group" aria-label={t.batchDialogTitle}>
                {tabs.map((tab, index) => {
                    const checked = selectedSet.has(tab.id);
                    const isActive = tab.id === activeId;
                    const s = snapshot(tab);
                    const styleName = styleShortName(s.styleId, language);
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            className={`batch-photo-item${checked ? ' selected' : ''}${isActive ? ' is-current' : ''}`}
                            disabled={exporting}
                            onClick={() => onToggleTab(tab.id)}
                        >
                            <span className={`batch-checkbox${checked ? ' checked' : ''}`} aria-hidden="true">
                                {checked ? '✓' : ''}
                            </span>
                            <div className="batch-photo-meta">
                                <div className="batch-photo-title-row">
                                    <span className="batch-photo-index">{String(index + 1).padStart(2, '0')}</span>
                                    <strong>{tab.name}</strong>
                                </div>
                                <small>
                                    {styleName} · {tab.width} × {tab.height}
                                    {s.frameEnabled ? ` · ${t.polaroidFrameTitle}` : ''}
                                </small>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="caption-dialog-footer">
                <button
                    type="button"
                    className="caption-confirm"
                    disabled={exporting || selectedIds.length === 0}
                    onClick={onExportSelected}
                >
                    {exporting && batchProgress
                        ? t.batchExportingBtn(batchProgress.done, batchProgress.total)
                        : t.batchExportStartBtn(selectedIds.length, fmtLabel)}
                </button>
            </div>
        </div>
    );
}
