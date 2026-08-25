"use client";

import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("🚨 ErrorBoundary caught an error:", error);
    console.error("📍 Error info:", errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent
            error={this.state.error!}
            resetError={this.resetError}
          />
        );
      }

      return (
        <div className="p-6 bg-red-50 rounded-lg border border-red-200 m-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-red-500 rounded-full"></div>
              <h2 className="text-red-700 font-semibold">
                Something went wrong
              </h2>
            </div>

            <div className="space-y-2">
              <p className="text-red-600">
                An error occurred while rendering this component.
              </p>

              {this.state.error && (
                <details className="bg-red-100 p-3 rounded border">
                  <summary className="text-red-700 font-medium cursor-pointer">
                    Error Details
                  </summary>
                  <div className="mt-2 space-y-2 text-sm">
                    <div>
                      <strong>Message:</strong> {this.state.error.message}
                    </div>
                    <div>
                      <strong>Stack:</strong>
                      <pre className="text-xs mt-1 overflow-auto">
                        {this.state.error.stack}
                      </pre>
                    </div>
                    {this.state.errorInfo && (
                      <div>
                        <strong>Component Stack:</strong>
                        <pre className="text-xs mt-1 overflow-auto">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>

            <button
              onClick={this.resetError}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useErrorHandler() {
  return (error: Error, errorInfo?: React.ErrorInfo) => {
    console.error("🚨 Error caught by useErrorHandler:", error);
    if (errorInfo) {
      console.error("📍 Error info:", errorInfo);
    }
  };
}
