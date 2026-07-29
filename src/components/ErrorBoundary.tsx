import { logger } from '@/lib/logger';
('use client');

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, eventId: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const eventId = Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    this.setState({ eventId: eventId ?? null });
    this.props.onError?.(error, info);
    logger.error('ErrorBoundary', { componentStack: info.componentStack }, error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, eventId: null });
  };

  handleReport = () => {
    if (this.state.eventId) {
      Sentry.showReportDialog({ eventId: this.state.eventId });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center min-h-[200px] p-8 border border-red-500/30 bg-red-500/5 text-center gap-4"
      >
        <p className="text-red-400 font-medium">Something went wrong</p>
        <p className="text-[#888] text-sm max-w-sm">
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="px-4 py-2 text-sm border border-[#333] text-[#ccc] hover:border-[#555] transition-colors"
          >
            Try again
          </button>
          {this.state.eventId && (
            <button
              onClick={this.handleReport}
              className="px-4 py-2 text-sm border border-[#333] text-[#888] hover:border-[#555] transition-colors"
            >
              Report issue
            </button>
          )}
        </div>
      </div>
    );
  }
}
