import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateGamePage, GamesPage } from './GamesPage';

const futureGameDate = '2099-08-01';

function todayForDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

describe('GamesPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ items: [], page: 1, pageSize: 30, hasMore: false }), {
            status: 200,
          }),
        ),
      ),
    );
  });
  it('shows create action and empty state', async () => {
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /vamos jogar/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /criar uma partida/i })).toHaveAttribute(
      'href',
      '/games/new',
    );
    expect(screen.getByText(/nenhuma partida futura/i)).toBeInTheDocument();
  });

  it('shows API failure instead of stale empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
    );
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/entre e tente novamente/i);
    expect(screen.queryByText(/nenhuma partida futura/i)).not.toBeInTheDocument();
  });
});

describe('CreateGamePage', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('creates a location and game in one submit when no venue exists', async () => {
    const createdVenue = {
      id: 'venue-1',
      name: 'Nova Quadra',
      city: 'Sao Paulo',
      latitude: -23.5,
      longitude: -46.6,
      lightingStatus: 'unknown',
      surfaceType: 'sand',
      accessType: 'unknown',
      active: true,
    };
    const createdGame = {
      id: 'game-1',
      startsAt: '2026-08-01T12:00:00Z',
      endsAt: '2026-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Nova Quadra',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 1,
      openSlots: 3,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'link-only',
      status: 'scheduled',
    };
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(url);
      if (requestUrl.includes('geocoding-api.open-meteo.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                {
                  id: 123,
                  name: 'Sao Paulo',
                  admin1: 'Sao Paulo',
                  country: 'Brasil',
                  latitude: -23.5,
                  longitude: -46.6,
                  timezone: 'America/Sao_Paulo',
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (requestUrl.includes('/api/v1/me/venues')) {
        return Promise.resolve(new Response(JSON.stringify(createdVenue), { status: 201 }));
      }
      if (requestUrl.includes('/api/v1/games') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(createdGame), { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/games/new']}>
        <CreateGamePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /configure uma partida/i }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText(/nome personalizado/i), {
      target: { value: 'Nova Quadra' },
    });
    fireEvent.change(screen.getByLabelText(/endereço da quadra/i), {
      target: { value: 'Rua das Areias, 10' },
    });
    fireEvent.change(screen.getByLabelText(/pesquisa de cidade/i), {
      target: { value: 'Sao Paulo' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /sao paulo/i }));
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/venues',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
  });

  it('uses an existing venue directly when selected', async () => {
    const savedVenue = {
      id: 'venue-1',
      name: 'Praia Central',
      city: 'Sao Paulo',
      latitude: -23.5,
      longitude: -46.6,
      lightingStatus: 'unknown',
      surfaceType: 'sand',
      accessType: 'unknown',
      active: true,
    };
    const createdGame = {
      id: 'game-1',
      startsAt: '2026-08-01T12:00:00Z',
      endsAt: '2026-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Praia Central',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 1,
      openSlots: 3,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'link-only',
      status: 'scheduled',
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/games') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(createdGame), { status: 201 }));
      }
      if (url.includes('/api/v1/me/favorite-venues')) {
        return Promise.resolve(new Response(JSON.stringify([savedVenue]), { status: 200 }));
      }
      if (url.includes('/api/v1/me/preferred-areas')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/games/new']}>
        <CreateGamePage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /configure uma partida/i });
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText(/^quadra$/i), { target: { value: 'venue:venue-1' } });
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/v1/me/venues',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses a saved preferred area without asking for a new location form', async () => {
    const savedArea = {
      id: 'area-1',
      label: 'Near beach',
      latitude: -23.5,
      longitude: -46.6,
      radiusMeters: 4000,
      priority: 0,
      active: true,
    };
    const createdVenue = {
      id: 'venue-1',
      name: 'Near beach',
      city: 'Sao Paulo',
      latitude: -23.5,
      longitude: -46.6,
      lightingStatus: 'unknown',
      surfaceType: 'sand',
      accessType: 'unknown',
      active: true,
    };
    const createdGame = {
      id: 'game-1',
      startsAt: '2026-08-01T12:00:00Z',
      endsAt: '2026-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Near beach',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 1,
      openSlots: 3,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'link-only',
      status: 'scheduled',
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/me/favorite-venues')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/me/preferred-areas')) {
        return Promise.resolve(new Response(JSON.stringify([savedArea]), { status: 200 }));
      }
      if (url.includes('/api/v1/venues')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/me/venues') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(createdVenue), { status: 201 }));
      }
      if (url.includes('/api/v1/games') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(createdGame), { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/games/new']}>
        <CreateGamePage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /configure uma partida/i });
    await waitFor(() => expect(screen.getByLabelText(/^quadra$/i)).toHaveValue('area:area-1'));
    expect(screen.getByText(/esta partida usará near beach/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nome personalizado/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/venues',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"Near beach"'),
        }),
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('blocks submitting a start time that is not safely in the future', async () => {
    const savedVenue = {
      id: 'venue-1',
      name: 'Praia Central',
      city: 'Sao Paulo',
      latitude: -23.5,
      longitude: -46.6,
      lightingStatus: 'unknown',
      surfaceType: 'sand',
      accessType: 'unknown',
      active: true,
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/v1/me/favorite-venues')) {
        return Promise.resolve(new Response(JSON.stringify([savedVenue]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/games/new']}>
        <CreateGamePage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /configure uma partida/i });
    await waitFor(() => expect(screen.getByLabelText(/^quadra$/i)).toHaveValue('venue:venue-1'));
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: todayForDateInput() } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '00:01' } });
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pelo menos 15 minutos/i);
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/v1/games',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
