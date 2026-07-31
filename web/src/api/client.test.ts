import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameApi, locationApi } from './client';

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
});
