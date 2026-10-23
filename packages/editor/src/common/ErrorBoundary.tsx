import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[vibe3d] render error', error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-sm font-medium text-error">{this.props.title ?? '界面渲染出错'}</div>
        <pre className="max-h-40 max-w-lg overflow-auto rounded-box bg-base-300/60 p-3 text-left text-[11px] leading-relaxed text-base-content/60">
          {error.message}
        </pre>
        <button type="button" className="btn btn-xs" onClick={this.reset}>
          重试
        </button>
      </div>
    );
  }
}
