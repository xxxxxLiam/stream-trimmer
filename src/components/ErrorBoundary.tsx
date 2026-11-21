/**
 * File: ErrorBoundary.tsx
 * Path: src/components/ErrorBoundary.tsx
 * Description: Top-level React error boundary (F-10). A render throw anywhere in the shell
 *   (B-1, C-1, a malformed updater payload) used to unmount the whole tree and leave a
 *   blank window. This shows the error and two ways out: try again (re-render) or reload.
 *   Work is persisted by the settings store, so a reload does not lose saved state.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export function ErrorFallback({
  error,
  onRetry,
  onReload,
}: {
  error: Error;
  onRetry: () => void;
  onReload: () => void;
}) {
  return (
    <div
      role="alert"
      className="surface-ground flex h-screen w-full items-center justify-center p-6 text-fg"
    >
      <div className="surface-panel flex max-w-lg flex-col gap-3 p-6">
        <h1 className="m-0 text-title text-fg">Something went wrong</h1>
        <p className="m-0 text-body text-fg-dim">
          The window hit an error and stopped drawing. Your saved campaigns and settings are
          untouched. Try again, or reload the window.
        </p>
        <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-chip border border-hairline bg-raised p-2 font-mono text-meta text-fg-dim">
          {error.message || String(error)}
        </pre>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={onRetry} id="ui-error-retry">
            Try again
          </button>
          <button type="button" className="btn" onClick={onReload} id="ui-error-reload">
            Reload window
          </button>
        </div>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Renderer error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
          onReload={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
