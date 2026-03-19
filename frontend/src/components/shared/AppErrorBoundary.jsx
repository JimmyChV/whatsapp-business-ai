import React from 'react';

function arraysShallowEqual(left = [], right = []) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
        if (String(left[i] ?? '') !== String(right[i] ?? '')) return false;
    }
    return true;
}

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            errorMessage: ''
        };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            errorMessage: String(error?.message || 'Error inesperado en la interfaz.')
        };
    }

    componentDidCatch(error, info) {
        if (typeof this.props.onError === 'function') {
            this.props.onError(error, info);
        }
    }

    componentDidUpdate(prevProps) {
        if (!this.state.hasError) return;
        const prevKeys = Array.isArray(prevProps.resetKeys) ? prevProps.resetKeys : [];
        const nextKeys = Array.isArray(this.props.resetKeys) ? this.props.resetKeys : [];
        if (!arraysShallowEqual(prevKeys, nextKeys)) {
            this.setState({ hasError: false, errorMessage: '' });
        }
    }

    handleRetry = () => {
        this.setState({ hasError: false, errorMessage: '' });
        if (typeof this.props.onRetry === 'function') {
            this.props.onRetry();
        }
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        const title = this.props.fallbackTitle || 'Se detecto un error en la interfaz';
        const message = this.props.fallbackMessage || 'Recarga este modulo para continuar trabajando.';

        return (
            <div style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                background: '#0e1d29',
                padding: '24px'
            }}>
                <div style={{
                    width: 'min(640px, 100%)',
                    borderRadius: '16px',
                    border: '1px solid rgba(0, 214, 170, 0.35)',
                    background: 'linear-gradient(180deg, #112332 0%, #0d1c28 100%)',
                    padding: '20px',
                    color: '#d9edf8'
                }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>{title}</h2>
                    <p style={{ margin: '0 0 12px', color: '#9cc1d8', lineHeight: 1.5 }}>{message}</p>
                    <p style={{ margin: '0 0 16px', color: '#ffb7b7', fontSize: '0.88rem' }}>
                        Detalle: {this.state.errorMessage}
                    </p>
                    <button
                        type='button'
                        onClick={this.handleRetry}
                        style={{
                            borderRadius: '10px',
                            border: '1px solid rgba(0, 214, 170, 0.45)',
                            background: 'rgba(0, 214, 170, 0.16)',
                            color: '#eafff8',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }
}

export default AppErrorBoundary;

