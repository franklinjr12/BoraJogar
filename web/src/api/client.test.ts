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
      message: 'Game is full.',
    });
  });

  it('routes venue loading through shared client with encoded query', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await locationApi.venues();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('city=S%C3%A3o+Paulo'),
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
});
