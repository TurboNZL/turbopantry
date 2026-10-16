import { Component, type ReactNode } from 'react';

/** A screen that throws shows what went wrong (and a way back) instead of a blank page; the message is what to send when reporting it. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card space-y-3 p-4" role="alert">
        <p className="font-semibold">{this.props.label ?? 'This screen'} hit a problem.</p>
        <p className="break-words font-mono text-xs text-muted">{error.name}: {error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
