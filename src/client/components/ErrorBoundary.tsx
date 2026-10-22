import type { ReactNode } from 'react';
import { Component } from 'react';

/**
 * Shows a way out instead of a blank page when a view fails to load (offline, or
 * an old tab asking for code a new release replaced) or throws while rendering.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="title-text" role="alert">
        <h1 className="title">This page couldn’t load</h1>
        <p className="meta">
          Check your connection, then reload. Your plans are safe in this browser.
        </p>
        <p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload
          </button>
        </p>
      </div>
    );
  }
}
