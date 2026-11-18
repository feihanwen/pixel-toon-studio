import { useEffect, useState } from 'react';
import { usePreferences } from '../config/preferences';
import { uiText } from '../config/i18n';
import type { ExportFormat } from '../imaging/export';

export interface MobileSaveItem {
    blob: Blob;
    url: string;
    filename: string;
    format: ExportFormat;
}

interface Props {
    items: MobileSaveItem[];
    canShare: boolean;
    onShareToPhotos: () => Promise<void>;
    onDownloadFiles: () => void;
    onClose: () => void;
}

export function MobileSaveModal({
    items,
    canShare,
    onShareToPhotos,
    onDownloadFiles,
    onClose,
}: Props) {
    const { language } = usePreferences();
    const t = uiText(language);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !sharing) {
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [sharing, onClose]);

    if (items.length === 0) return null;

    const isBatch = items.length > 1;
    const hintText = isBatch
        ? t.mobileSaveModalBatchLongPressHint
        : canShare
          ? t.mobileSaveModalShareHint
          : t.mobileSaveModalLongPressHint;

    return (
        <div
            className="modal-backdrop mobile-save-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-save-title"
            onClick={event => {
                if (event.target === event.currentTarget && !sharing) onClose();
            }}
        >
            <div className="modal mobile-save-modal">
                <div className="mobile-save-head">
                    <div>
                        <span className="eyebrow">SAVE TO PHOTOS</span>
                        <h2 id="mobile-save-title">{t.mobileSaveModalTitle}</h2>
                    </div>
                    <button
                        type="button"
                        className="settings-popover-close"
                        aria-label={t.mobileSaveCloseAria}
                        disabled={sharing}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>

                {isBatch ? (
                    <div className="mobile-save-batch-grid">
                        {items.map(item => (
                            <div key={item.filename} className="mobile-save-batch-card">
                                <img
                                    src={item.url}
                                    alt={item.filename}
                                    className="mobile-save-preview-img"
                                    draggable={false}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mobile-save-preview-wrap">
                        <img
                            src={items[0].url}
                            alt={items[0].filename}
                            className="mobile-save-preview-img"
                            draggable={false}
                        />
                    </div>
                )}

                <p className="mobile-save-hint">{hintText}</p>

                <div className="mobile-save-actions">
                    {canShare && (
                        <button
                            type="button"
                            className="primary"
                            disabled={sharing}
                            onClick={() => {
                                setSharing(true);
                                void onShareToPhotos().finally(() => setSharing(false));
                            }}
                        >
                            {t.mobileSaveToPhotosBtn(items.length)}
                        </button>
                    )}
                    <button type="button" disabled={sharing} onClick={onDownloadFiles}>
                        {t.mobileDownloadFileBtn}
                    </button>
                    <button type="button" disabled={sharing} onClick={onClose}>
                        {t.mobileSaveCloseBtn}
                    </button>
                </div>
            </div>
        </div>
    );
}
