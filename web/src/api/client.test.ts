import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameApi, locationApi, notificationApi, userApi } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('typed API client', () => {
  it('parses structured errors and preserves request IDs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'game_full', message: 'Game is full.', fields: {} },
              requestId: 'req-123',
            }),
            { status: 409 },
          ),
        ),
      ),
    );

    await expect(gameApi.join('game-1')).rejects.toMatchObject({
      status: 409,
      code: 'game_full',
      requestId: 'req-123',
      message: 'Esta partida está lotada.',
    });
  });

  it('reports failed API requests with safe request context', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return String(input).includes('/client-errors')
        ? Promise.resolve(new Response(null, { status: 204 }))
        : Promise.resolve(
            new Response(
              JSON.stringify({
                error: { code: 'server_error', message: 'Failed.', fields: {} },
                requestId: 'request-503',
              }),
              { status: 503, headers: { 'X-Request-ID': 'request-503' } },
            ),
          );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(gameApi.list()).rejects.toMatchObject({ status: 503 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const reportInit = fetchMock.mock.calls[1]?.[1];
    const report = JSON.parse(String(reportInit?.body)) as Record<string, unknown>;
    expect(report).toMatchObject({
      kind: 'api_error',
      requestMethod: 'GET',
      requestPath: '/api/v1/games',
      requestId: 'request-503',
      statusCode: 503,
    });
  });

  it('routes venue loading through shared client with encoded query', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await locationApi.venues();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('city=Curitiba'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('handles empty success responses and fallback HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    await expect(notificationApi.markAllRead()).resolves.toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not json', { status: 503 }))),
    );
    await expect(gameApi.list()).rejects.toMatchObject({
      status: 503,
      code: 'http_503',
    });
  });

  it('uses specific user routes for profiles and blocking', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);

    await userApi.block('user/1');
    await userApi.unblock('user/1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/users/user%2F1/block',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/users/user%2F1/block',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });

  it('uses host game-management routes', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ result: 'removed' }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await gameApi.removePlayer('game/1', 'user/2');
    await gameApi.cancel('game-1');
    await gameApi.joinWaitlist('game-1');
    await gameApi.leaveWaitlist('game-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/games/game%2F1/players/user%2F2',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/games/game-1/cancel',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/games/game-1/waitlist',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/games/game-1/waitlist',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });
});
