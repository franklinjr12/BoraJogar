import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureClientError,
  installGlobalErrorCapture,
  normalizeError,
  reportClientError,
} from './errorReporting';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('remote error reporting', () => {
  it('normalizes Error, string, and unknown rejection values', () => {
    expect(normalizeError(new Error('boom'))).toMatchObject({ name: 'Error', message: 'boom' });
    expect(normalizeError('rejected')).toMatchObject({ name: 'Error', message: 'rejected' });
    expect(normalizeError({ reason: 'unknown' })).toMatchObject({
      name: 'NonErrorRejection',
      message: '{"reason":"unknown"}',
    });
  });

  it('sends safe diagnostics and strips query strings and emails', () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    reportClientError({
      kind: 'uncaught_error',
      message: 'Failed for player@example.com',
      pagePath: '/games/game-1?access=secret',
      stackTrace: 'at https://example.test/app.js?token=secret:1:2',
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/client-errors',
      expect.objectContaining({ method: 'POST', credentials: 'include', keepalive: true }),
    );
    expect(payload.pagePath).toBe('/games/game-1');
    expect(payload.message).not.toContain('player@example.com');
    expect(payload.stackTrace).not.toContain('token=secret');
  });

  it('drops reports offline and swallows reporting failures', () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('report endpoint unavailable')));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    expect(() => reportClientError({ kind: 'api_error', message: 'offline' })).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    expect(() => captureClientError('api_error', new Error('network'))).not.toThrow();
  });

  it('captures global uncaught errors', () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const cleanup = installGlobalErrorCapture();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'global boom', error: new Error('global boom') }),
    );
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: 'rejected boom' });
    window.dispatchEvent(rejection);
    cleanup();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/client-errors');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/client-errors');
  });
});
