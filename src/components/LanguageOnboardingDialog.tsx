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
            className="inline-onboarding-card"
            role="region"
            aria-labelledby="lang-onboard-title"
            onKeyDown={e => {
                if (e.key === 'Enter') handleConfirm();
            }}
        >
            <div className="inline-onboarding-head">
                <span className="inline-onboarding-icon" aria-hidden="true">
                    <StudioIcon name="sparkles" size={18} />
                </span>
                <div>
                    <span className="eyebrow">WELCOME · 欢迎使用</span>
                    <h3 id="lang-onboard-title">选择语言 / Language</h3>
                </div>
            </div>
            <p className="lang-onboard-desc">
                请选择界面语言，可随时在右上角设置中切换。
                <br />
                Choose your interface language (changeable anytime in Settings).
            </p>

            <div className="lang-onboard-grid" role="radiogroup" aria-label="Language selection">
                <button
                    type="button"
                    role="radio"
                    aria-checked={selected === 'zh'}
                    className={`lang-onboard-card ${selected === 'zh' ? 'selected' : ''}`}
                    onClick={() => {
                        setSelected('zh');
                        setLanguage('zh');
                    }}
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
                    onClick={() => {
                        setSelected('en');
                        setLanguage('en');
                    }}
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

            <button type="button" className="inline-onboarding-confirm" onClick={handleConfirm}>
                {selected === 'zh' ? '确认进入' : 'Continue'}
            </button>
        </div>
    );
}
