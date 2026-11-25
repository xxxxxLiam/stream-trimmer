/**
 * File: ErrorBoundary.tsx
 * Path: src/renderer/src/shared/components/ErrorBoundary.tsx
 * Description: Top-level React error boundary (F-10). A render throw anywhere in the shell
 *   (B-1, C-1, a malformed updater payload) used to unmount the whole tree and leave a
 *   blank window. It now hands the error to the crash screen it is given. Work is persisted
 *   by the settings store, so reopening does not lose saved state.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; /** The crash screen, given the error (it goes into the report, never on screen). */ fallback: (error: Error) => ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Renderer error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}
