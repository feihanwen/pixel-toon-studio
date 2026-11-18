import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLanguage } from '../config/preferences';
import { uiText } from '../config/i18n';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Uncaught editor error:', error, info);
    }

    render() {
        if (!this.state.error) {
            return this.props.children;
        }
        const t = uiText(getLanguage());
        return (
            <div className="error-boundary-shell" role="alert">
                <div className="error-boundary-card">
                    <div className="modal-icon" aria-hidden="true">
                        ◈
                    </div>
                    <span className="eyebrow">RECOVERY</span>
                    <h2>{t.errorBoundaryTitle}</h2>
                    <p>{t.errorBoundaryBody}</p>
                    {this.state.error.message && (
                        <pre className="error-boundary-detail">{this.state.error.message}</pre>
                    )}
                    <div className="error-boundary-actions">
                        <button type="button" onClick={() => this.setState({ error: null })}>
                            {t.errorBoundaryRetry}
                        </button>
                        <button
                            type="button"
                            className="primary"
                            onClick={() => window.location.reload()}
                        >
                            {t.errorBoundaryReload}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
