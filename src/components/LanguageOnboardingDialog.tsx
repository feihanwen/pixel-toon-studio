import { useState } from 'react';
import { usePreferences, markLanguageChosen, type AppLanguage } from '../config/preferences';
import { StudioIcon } from './StudioIcon';

interface Props {
    onClose: () => void;
}

export function LanguageOnboardingDialog({ onClose }: Props) {
    const { language, setLanguage } = usePreferences();
    const [selected, setSelected] = useState<AppLanguage>(language);

    const handleConfirm = () => {
        setLanguage(selected);
        markLanguageChosen();
        onClose();
    };

    return (
        <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lang-onboard-title"
            onKeyDown={e => {
                if (e.key === 'Enter') handleConfirm();
            }}
        >
            <div className="modal lang-onboarding-modal">
                <div className="modal-icon">
                    <StudioIcon name="sparkles" size={26} />
                </div>
                <span className="eyebrow">WELCOME · 欢迎使用</span>
                <h2 id="lang-onboard-title">选择语言 / Language</h2>
                <p className="lang-onboard-desc">
                    请选择你偏好的界面语言，稍后可在右上角设置中随时调整。
                    <br />
                    Please choose your preferred language. You can change it anytime in Settings.
                </p>

                <div className="lang-onboard-grid" role="radiogroup" aria-label="Language selection">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={selected === 'zh'}
                        className={`lang-onboard-card ${selected === 'zh' ? 'selected' : ''}`}
                        onClick={() => setSelected('zh')}
                    >
                        <div className="lang-card-main">
                            <strong>简体中文</strong>
                            <small>Simplified Chinese</small>
                        </div>
                        <span className="lang-check" aria-hidden="true">
                            {selected === 'zh' ? '✓' : ''}
                        </span>
                    </button>

                    <button
                        type="button"
                        role="radio"
                        aria-checked={selected === 'en'}
                        className={`lang-onboard-card ${selected === 'en' ? 'selected' : ''}`}
                        onClick={() => setSelected('en')}
                    >
                        <div className="lang-card-main">
                            <strong>English</strong>
                            <small>英语</small>
                        </div>
                        <span className="lang-check" aria-hidden="true">
                            {selected === 'en' ? '✓' : ''}
                        </span>
                    </button>
                </div>

                <div className="modal-actions">
                    <button type="button" className="primary" onClick={handleConfirm} autoFocus>
                        {selected === 'zh' ? '进入应用' : 'Get Started'}
                    </button>
                </div>
            </div>
        </div>
    );
}
