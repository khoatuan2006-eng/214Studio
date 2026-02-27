import { Component, type ErrorInfo, type ReactNode } from 'react';
import { toast } from 'sonner';

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
    toast.error('Studio đã gặp lỗi', {
      description: error.message,
      duration: 8000,
      action: {
        label: 'Thử lại',
        onClick: () => this.setState({ hasError: false, error: null }),
      },
    });
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 bg-neutral-900 p-8 text-neutral-200">
            <div className="flex flex-col items-center gap-3 animate-fade-scale-in">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-red-400">Studio Error</h2>
              <p className="max-w-md text-sm text-neutral-400 text-center">{this.state.error.message}</p>
              <p className="text-xs text-neutral-500">Dữ liệu của bạn vẫn được auto-save. Nhấn nút bên dưới để thử lại.</p>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-medium transition-all hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95"
            >
              🔄 Thử lại
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
