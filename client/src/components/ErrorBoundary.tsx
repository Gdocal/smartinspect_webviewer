/**
 * ErrorBoundary - Catches React errors and shows a friendly message
 * Prevents white screen on crashes (e.g., network changes, HMR failures)
 */

import { Component, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }

    handleRefresh = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen flex items-center justify-center bg-slate-900">
                    <div className="text-center p-8 max-w-md">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h1 className="text-xl font-semibold text-white mb-2">
                            Something went wrong
                        </h1>
                        <p className="text-slate-400 text-sm mb-6">
                            The application encountered an error. This can happen due to network changes or connection issues.
                        </p>
                        <button
                            onClick={this.handleRefresh}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
                        >
                            Refresh Page
                        </button>
                        {this.state.error && (
                            <details className="mt-6 text-left">
                                <summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-400">
                                    Technical details
                                </summary>
                                <pre className="mt-2 p-3 bg-slate-800 rounded text-xs text-red-400 overflow-auto max-h-32">
                                    {this.state.error.message}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
