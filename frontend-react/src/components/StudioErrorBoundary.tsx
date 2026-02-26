import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class StudioErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Studio Error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 bg-neutral-900 p-8 text-neutral-200">
            <h2 className="text-lg font-semibold text-red-400">Studio Error</h2>
            <p className="max-w-md text-sm text-neutral-400">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600"
            >
              Thử lại
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
