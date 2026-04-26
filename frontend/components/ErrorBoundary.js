import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReload = () => { if (typeof window !== 'undefined') window.location.reload(); };
  handleReset  = () => { this.setState({ hasError: false, error: null }); };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.handleReset);

    const isDev = process.env.NODE_ENV !== 'production';

    return (
      <div role="alert" className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center font-sans">
        <h1 className="text-3xl mb-2 font-semibold text-text-primary">Something went wrong</h1>
        <p className="text-text-secondary max-w-[480px] mb-6">
          An unexpected error occurred. You can try again, or reload the page.
        </p>
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="px-5 py-2.5 border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors cursor-pointer"
          >
            Try again
          </button>
          <button
            onClick={this.handleReload}
            className="px-5 py-2.5 rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors cursor-pointer"
          >
            Reload page
          </button>
        </div>
        {isDev && this.state.error && (
          <pre className="mt-8 p-4 bg-surface text-red-700 max-w-full overflow-auto text-left text-sm rounded">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
