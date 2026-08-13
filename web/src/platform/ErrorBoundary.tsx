import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureClientError } from './errorReporting';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    captureClientError('react_error', error, {
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="shell" role="alert">
        <p className="eyebrow">Bora Jogar</p>
        <h1>Algo deu errado.</h1>
        <p className="lead">O problema foi registrado. Tente recarregar a página.</p>
        <button className="button" type="button" onClick={() => window.location.reload()}>
          Recarregar página
        </button>
      </main>
    );
  }
}
