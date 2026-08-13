export type ClientErrorKind =
  'uncaught_error' | 'unhandled_rejection' | 'react_error' | 'api_error';

export interface ClientErrorReportInput {
  kind: ClientErrorKind;
  name?: string;
  message: string;
  stackTrace?: string;
  componentStack?: string;
  pagePath?: string;
  requestMethod?: string;
  requestPath?: string;
  requestId?: string;
  statusCode?: number;
  occurredAt?: string;
  appVersion?: string;
  locale?: string;
  timeZone?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  online?: boolean;
}

interface NormalizedError {
  name: string;
  message: string;
  stackTrace?: string;
}

interface CaptureOptions {
  componentStack?: string;
  fallbackMessage?: string;
  requestMethod?: string;
  requestPath?: string;
  requestId?: string;
  statusCode?: number;
}

const reportPath = '/api/v1/client-errors';
const appVersion = import.meta.env.VITE_APP_VERSION || 'unknown';
let globalHandlersInstalled = false;

export function normalizeError(value: unknown): NormalizedError {
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message || 'Unknown error',
      ...(value.stack ? { stackTrace: value.stack } : {}),
    };
  }
  if (typeof value === 'string') {
    return { name: 'Error', message: value || 'Unknown error' };
  }
  try {
    const serialized = JSON.stringify(value);
    return { name: 'NonErrorRejection', message: serialized || 'Unknown error' };
  } catch {
    return { name: 'NonErrorRejection', message: 'Unknown error' };
  }
}

export function captureClientError(
  kind: ClientErrorKind,
  value: unknown,
  options: CaptureOptions = {},
): void {
  const normalized = normalizeError(value);
  reportClientError({
    kind,
    name: normalized.name,
    message: options.fallbackMessage || normalized.message,
    ...(normalized.stackTrace ? { stackTrace: normalized.stackTrace } : {}),
    ...(options.componentStack ? { componentStack: options.componentStack } : {}),
    ...(options.requestMethod ? { requestMethod: options.requestMethod } : {}),
    ...(options.requestPath ? { requestPath: options.requestPath } : {}),
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(options.statusCode !== undefined ? { statusCode: options.statusCode } : {}),
  });
}

export function reportClientError(input: ClientErrorReportInput): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const payload: ClientErrorReportInput = {
      kind: input.kind,
      name: limitText(redactSensitiveText(input.name || 'Error'), 128),
      message: limitText(redactSensitiveText(input.message || 'Unknown error'), 4000),
      ...(input.stackTrace
        ? { stackTrace: limitText(redactSensitiveText(input.stackTrace), 16000) }
        : {}),
      ...(input.componentStack
        ? { componentStack: limitText(redactSensitiveText(input.componentStack), 16000) }
        : {}),
      pagePath: limitText(sanitizePath(input.pagePath || currentPagePath()), 512),
      ...(input.requestMethod
        ? { requestMethod: limitText(input.requestMethod.toUpperCase(), 16) }
        : {}),
      ...(input.requestPath
        ? { requestPath: limitText(sanitizePath(input.requestPath), 512) }
        : {}),
      ...(input.requestId
        ? { requestId: limitText(redactSensitiveText(input.requestId), 128) }
        : {}),
      ...(input.statusCode !== undefined ? { statusCode: input.statusCode } : {}),
      occurredAt: input.occurredAt || new Date().toISOString(),
      appVersion: limitText(input.appVersion || appVersion, 128),
      locale: limitText(input.locale || navigator.language || '', 64),
      timeZone: limitText(input.timeZone || browserTimeZone(), 128),
      viewportWidth: input.viewportWidth ?? window.innerWidth,
      viewportHeight: input.viewportHeight ?? window.innerHeight,
      online: input.online ?? navigator.onLine,
    };
    void fetch(reportPath, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch {
    // Error reporting must never create another application error.
  }
}

export function installGlobalErrorCapture(): () => void {
  if (globalHandlersInstalled || typeof window === 'undefined') return () => undefined;
  globalHandlersInstalled = true;

  const onError = (event: ErrorEvent) => {
    captureClientError('uncaught_error', event.error ?? event.message, {
      fallbackMessage: event.message || undefined,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    captureClientError('unhandled_rejection', event.reason);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    globalHandlersInstalled = false;
  };
}

function currentPagePath(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

function sanitizePath(value: string): string {
  if (!value) return '';
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    const queryIndex = value.search(/[?#]/);
    return queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  }
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function limitText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g, '$1')
    .replace(/([?&](?:access|token|code|state|password|secret)=[^&\s)]*)/gi, '[redacted-query]');
}
