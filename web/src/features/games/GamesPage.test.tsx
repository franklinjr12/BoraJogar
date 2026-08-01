import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateGamePage, GamesPage } from './GamesPage';

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
      expect(screen.getByRole('heading', { name: /get on court/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /create a game/i })).toHaveAttribute(
      'href',
      '/games/new',
    );
    expect(screen.getByText(/no upcoming games/i)).toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in/i);
    expect(screen.queryByText(/no upcoming games/i)).not.toBeInTheDocument();
  });
});

describe('CreateGamePage', () => {
  afterEach(cleanup);

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

    expect(await screen.findByRole('heading', { name: /set up a game/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText(/personalized name/i), {
      target: { value: 'Nova Quadra' },
    });
    fireEvent.change(screen.getByLabelText(/court address/i), {
      target: { value: 'Rua das Areias, 10' },
    });
    fireEvent.change(screen.getByLabelText(/city search/i), {
      target: { value: 'Sao Paulo' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /sao paulo/i }));
    fireEvent.click(screen.getByRole('button', { name: /^create game$/i }));

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
      return Promise.resolve(new Response(JSON.stringify([savedVenue]), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/games/new']}>
        <CreateGamePage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /set up a game/i });
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText(/venue/i), { target: { value: 'venue-1' } });
    fireEvent.click(screen.getByRole('button', { name: /^create game$/i }));

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
});
