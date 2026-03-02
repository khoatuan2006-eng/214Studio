import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches React errors and displays fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`[ErrorBoundary:${this.props.name || 'Unnamed'}]`, error, errorInfo);
        
        this.setState({ errorInfo });
        
        // Report to error tracking service
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }

        // Log to analytics
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('app-error', {
                detail: {
                    component: this.props.name,
                    error: error.message,
                    stack: error.stack,
                }
            }));
        }
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[200px] flex items-center justify-center p-6 bg-red-950/20 border border-red-500/30 rounded-lg">
                    <div className="max-w-md text-center">
                        <div className="flex items-center justify-center mb-4">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                        </div>
                        
                        <h3 className="text-lg font-semibold text-red-400 mb-2">
                            {this.props.name ? `${this.props.name} Error` : 'Something went wrong'}
                        </h3>
                        
                        <p className="text-sm text-neutral-400 mb-4">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>

                        {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                            <details className="text-left mb-4 bg-black/20 rounded p-3">
                                <summary className="text-xs text-neutral-500 cursor-pointer mb-2">
                                    Error Details (Development)
                                </summary>
                                <pre className="text-xs text-red-300 overflow-auto max-h-40">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </details>
                        )}

                        <div className="flex items-center justify-center gap-2">
                            <button
                                onClick={this.handleReset}
                                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                            
                            <button
                                onClick={this.handleReload}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Functional Error Boundary with simpler API
 */
export function ErrorFallback({
    children,
    name,
}: {
    children: ReactNode;
    name?: string;
}) {
    const [hasError, setHasError] = React.useState(false);
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
        const errorHandler = (error: ErrorEvent) => {
            console.error('[ErrorFallback]', error);
            setHasError(true);
            setError(error.error);
        };

        window.addEventListener('error', errorHandler);
        return () => window.removeEventListener('error', errorHandler);
    }, []);

    if (hasError) {
        return (
            <div className="p-4 bg-yellow-950/20 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                    <Bug className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-yellow-400 mb-1">
                            {name ? `${name} encountered an issue` : 'Component Error'}
                        </h4>
                        <p className="text-xs text-neutral-400 mb-2">
                            {error?.message || 'An unexpected error occurred'}
                        </p>
                        <button
                            onClick={() => {
                                setHasError(false);
                                setError(null);
                            }}
                            className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}

/**
 * Higher Order Component for error boundaries
 */
export function withErrorBoundary<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    name?: string
) {
    return function WithErrorBoundary(props: P) {
        return (
            <ErrorBoundary name={name || WrappedComponent.displayName || WrappedComponent.name}>
                <WrappedComponent {...props} />
            </ErrorBoundary>
        );
    };
}
