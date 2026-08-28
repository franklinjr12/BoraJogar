import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateGamePage, GameDetailsPage, GamesPage } from './GamesPage';

const googleMapsMock = vi.hoisted(() => ({ loadGoogleMaps: vi.fn() }));
vi.mock('../locations/googleMaps', () => googleMapsMock);

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
    expect(screen.getAllByRole('link', { name: /criar uma partida/i })[0]).toHaveAttribute(
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
    expect(await screen.findByRole('alert')).toHaveTextContent(/verifique sua conexão/i);
    expect(screen.queryByText(/nenhuma partida futura/i)).not.toBeInTheDocument();
  });

  it('shows closest games first and full games at the bottom', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'full-game',
                  startsAt: '2099-08-01T12:05:00Z',
                  endsAt: '2099-08-01T13:30:00Z',
                  venueId: 'venue-1',
                  venueName: 'Praia Central',
                  latitude: -25.4,
                  longitude: -49.3,
                  capacity: 4,
                  confirmedPlayers: 4,
                  openSlots: 0,
                  minimumSkillLevel: 'beginner',
                  maximumSkillLevel: 'advanced',
                  visibility: 'public',
                  status: 'scheduled',
                },
                {
                  id: 'far-open-game',
                  startsAt: '2099-08-01T12:20:00Z',
                  endsAt: '2099-08-01T13:45:00Z',
                  venueId: 'venue-2',
                  venueName: 'Praia Norte',
                  latitude: -25.4,
                  longitude: -49.3,
                  capacity: 4,
                  confirmedPlayers: 2,
                  openSlots: 2,
                  minimumSkillLevel: 'beginner',
                  maximumSkillLevel: 'advanced',
                  visibility: 'public',
                  status: 'scheduled',
                },
                {
                  id: 'near-open-game',
                  startsAt: '2099-08-01T12:10:00Z',
                  endsAt: '2099-08-01T13:35:00Z',
                  venueId: 'venue-3',
                  venueName: 'Praia Sul',
                  latitude: -25.4,
                  longitude: -49.3,
                  capacity: 4,
                  confirmedPlayers: 3,
                  openSlots: 1,
                  minimumSkillLevel: 'beginner',
                  maximumSkillLevel: 'advanced',
                  visibility: 'public',
                  status: 'scheduled',
                },
              ],
              page: 1,
              pageSize: 30,
              hasMore: false,
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );

    await screen.findByText(/partida lotada/i);
    const cards = screen.getAllByRole('link').filter((card) => {
      const href = card.getAttribute('href');
      return href?.startsWith('/games/') && href !== '/games/new';
    });
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/games/near-open-game',
      '/games/far-open-game',
      '/games/full-game',
    ]);
  });

  it('loads the next page without losing the current games', async () => {
    const pageOneGame = {
      id: 'page-one-game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Praia Central',
      latitude: -25.4,
      longitude: -49.3,
      capacity: 4,
      confirmedPlayers: 1,
      openSlots: 3,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'public',
      status: 'scheduled',
    };
    const pageTwoGame = { ...pageOneGame, id: 'page-two-game', venueName: 'Praia Norte' };
    const fetchMock = vi.fn((url: string) => {
      const page = new URL(url, window.location.origin).searchParams.get('page');
      return Promise.resolve(
        new Response(
          JSON.stringify(
            page === '2'
              ? { items: [pageTwoGame], page: 2, pageSize: 30, hasMore: false }
              : { items: [pageOneGame], page: 1, pageSize: 30, hasMore: true },
          ),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: /Praia Central/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /carregar mais partidas/i }));
    expect(await screen.findByRole('link', { name: /Praia Norte/ })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true);
    expect(screen.getByRole('link', { name: /Praia Central/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /carregar mais partidas/i }),
    ).not.toBeInTheDocument();
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
      if (requestUrl.includes('/api/v1/me/venues')) {
        return Promise.resolve(new Response(JSON.stringify(createdVenue), { status: 201 }));
      }
      if (requestUrl.includes('/api/v1/games') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(createdGame), { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const autocompleteInstances: Array<{ emit: (event: Event) => void }> = [];
    class MockAutocomplete extends HTMLElement {
      private listener?: EventListener;

      constructor() {
        super();
        autocompleteInstances.push({ emit: (event) => this.listener?.(event) });
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        if (type === 'gmp-select' && typeof listener === 'function') this.listener = listener;
      }
    }
    class MockSelectEvent extends Event {
      constructor(public placePrediction: { toPlace: () => typeof place }) {
        super('gmp-select');
      }
    }
    customElements.define('gmp-place-autocomplete', MockAutocomplete);
    googleMapsMock.loadGoogleMaps.mockResolvedValue({
      places: { PlaceAutocompleteElement: MockAutocomplete },
    });
    render(
      <MemoryRouter initialEntries={['/games/new']}>
        <CreateGamePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /configure uma partida/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^data$/i)).toHaveAttribute('lang', 'pt-BR');
    expect(screen.getByLabelText(/horário de início/i)).toHaveAttribute('lang', 'pt-BR');
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText(/nome personalizado/i), {
      target: { value: 'Nova Quadra' },
    });
    await waitFor(() => expect(autocompleteInstances).toHaveLength(1));
    const place = {
      id: 'google-place-1',
      displayName: 'Nova Quadra',
      formattedAddress: 'Rua das Areias, 10, Sao Paulo - SP',
      addressComponents: [{ types: ['administrative_area_level_2'], longText: 'Sao Paulo' }],
      location: { lat: () => -23.5, lng: () => -46.6 },
      fetchFields: vi.fn(),
    };
    autocompleteInstances[0]?.emit(new MockSelectEvent({ toPlace: () => place }));
    await waitFor(() => expect(place.fetchFields).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/venues',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"city":"Sao Paulo"'),
        }),
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
    const availableVenue = {
      ...savedVenue,
      id: 'venue-2',
      name: 'Praia Paulista',
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
      if (url.includes('/api/v1/venues')) {
        return Promise.resolve(new Response(JSON.stringify([availableVenue]), { status: 200 }));
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
    await waitFor(() => expect(screen.getByLabelText(/^quadra$/i)).toHaveValue('venue:venue-1'));
    expect(screen.queryByText(/pesquisar local no google maps/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText(/^quadra$/i), { target: { value: 'venue:venue-2' } });
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"venueId":"venue-2"'),
        }),
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

  it('creates games with waitlist disabled by default', async () => {
    const savedVenue = { id: 'venue-1', name: 'Praia Central' };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/me/favorite-venues')) {
        return Promise.resolve(new Response(JSON.stringify([savedVenue]), { status: 200 }));
      }
      if (url.includes('/api/v1/games') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'game-1', shareUrl: '/games/game-1' }), {
            status: 201,
          }),
        );
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
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/games', expect.anything()));
    const request = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/v1/games' && init?.method === 'POST',
    );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      waitlistEnabled: false,
      waitlistSize: 0,
    });
  });

  it('submits enabled waitlist size', async () => {
    const savedVenue = { id: 'venue-1', name: 'Praia Central' };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/me/favorite-venues')) {
        return Promise.resolve(new Response(JSON.stringify([savedVenue]), { status: 200 }));
      }
      if (url.includes('/api/v1/games') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'game-1', shareUrl: '/games/game-1' }), {
            status: 201,
          }),
        );
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
    fireEvent.click(screen.getByLabelText(/ativar lista de espera/i));
    fireEvent.change(screen.getByLabelText(/tamanho da lista de espera/i), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/horário de início/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/games', expect.anything()));
    const request = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/v1/games' && init?.method === 'POST',
    );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      waitlistEnabled: true,
      waitlistSize: 3,
    });
  });

  it('offers profile setup when game creation requires a profile', async () => {
    const savedVenue = { id: 'venue-1', name: 'Praia Central' };
    localStorage.setItem('borajogar_return_to', '/games/old-game');
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/me/favorite-venues')) {
        return Promise.resolve(new Response(JSON.stringify([savedVenue]), { status: 200 }));
      }
      if (url.includes('/api/v1/games') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'profile_required',
                message: 'Complete your profile before creating a game.',
                fields: {},
              },
            }),
            { status: 422 },
          ),
        );
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
    fireEvent.change(screen.getByLabelText(/^data$/i), { target: { value: futureGameDate } });
    fireEvent.change(screen.getByLabelText(/hor.rio de in.cio/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^criar partida$/i }));

    const link = await screen.findByRole('link', { name: /completar perfil/i });
    expect(screen.getByRole('alert')).toHaveTextContent(/complete seu perfil para continuar/i);
    expect(link).toHaveAttribute('href', '/onboarding?goal=create_game');
    fireEvent.click(link);
    expect(localStorage.getItem('borajogar_onboarding_goal')).toBe('create_game');
    expect(localStorage.getItem('borajogar_return_to')).toBeNull();
  });
});

describe('GameDetailsPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows link-only share link and organizer-only controls', async () => {
    const game = {
      id: 'game-1',
      title: 'Saturday game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 2,
      openSlots: 2,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'link-only',
      status: 'scheduled',
      currentUserStatus: 'confirmed',
      currentUserRole: 'organizer',
      players: [
        { id: 'host-1', displayName: 'Host', role: 'organizer' },
        { id: 'player-1', displayName: 'Bruno', role: 'player' },
        { id: 'player-2', displayName: 'Camila', role: 'player' },
      ],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve(
          new Response(JSON.stringify({ result: 'removed' }), { status: 200 }),
        );
      }
      if (init?.method === 'POST' && url.endsWith('/cancel')) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(JSON.stringify(game), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    render(
      <MemoryRouter initialEntries={['/games/game-1?access=secret']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByDisplayValue(`${window.location.origin}/games/game-1?access=secret`),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Gerenciar jogadores' })).toContainElement(
      screen.getByRole('button', { name: 'Remover Bruno' }),
    );
    expect(screen.getByRole('region', { name: 'Gerenciar jogadores' })).toContainElement(
      screen.getByRole('button', { name: 'Remover Camila' }),
    );
    fireEvent.click(screen.getByText(/abrir mapa do local/i));
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
    expect(screen.getByRole('button', { name: 'Remover Bruno' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar partida/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sair da partida/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover Bruno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover jogador' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games/game-1/players/player-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /cancelar partida/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar partida' })[1]!);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games/game-1/cancel',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it.each(['public', 'private'] as const)(
    'shows %s match link to organizer',
    async (visibility) => {
      const game = {
        id: 'game-1',
        title: 'Saturday game',
        startsAt: '2099-08-01T12:00:00Z',
        endsAt: '2099-08-01T13:30:00Z',
        venueId: 'venue-1',
        venueName: 'Central court',
        latitude: -23.5,
        longitude: -46.6,
        capacity: 4,
        confirmedPlayers: 1,
        openSlots: 3,
        minimumSkillLevel: 'beginner',
        maximumSkillLevel: 'advanced',
        visibility,
        status: 'scheduled',
        currentUserStatus: 'confirmed',
        currentUserRole: 'organizer',
        players: [{ id: 'host-1', displayName: 'Host', role: 'organizer' }],
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response(JSON.stringify(game), { status: 200 }))),
      );

      render(
        <MemoryRouter initialEntries={['/games/game-1']}>
          <Routes>
            <Route path="/games/:id" element={<GameDetailsPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(
        await screen.findByDisplayValue(`${window.location.origin}/games/game-1`),
      ).toBeInTheDocument();
    },
  );

  it('hides match link from non-organizers', async () => {
    const game = {
      id: 'game-1',
      title: 'Saturday game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 2,
      openSlots: 2,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'public',
      status: 'scheduled',
      currentUserStatus: 'confirmed',
      currentUserRole: 'player',
      players: [
        { id: 'host-1', displayName: 'Host', role: 'organizer' },
        { id: 'player-1', displayName: 'Bruno', role: 'player' },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(game), { status: 200 }))),
    );

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Saturday game' });
    expect(screen.queryByLabelText('Link da partida')).not.toBeInTheDocument();
  });

  it('shows unavailable state when a full game has no waitlist', async () => {
    const game = {
      id: 'game-1',
      title: 'Full game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 2,
      confirmedPlayers: 2,
      openSlots: 0,
      waitlistEnabled: false,
      waitlistSize: 0,
      waitlistCount: 0,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'public',
      status: 'scheduled',
      currentUserStatus: '',
      players: [{ id: 'host-1', displayName: 'Host', role: 'organizer' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(game), { status: 200 }))),
    );

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/está lotada e não tem lista de espera/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /entrar na lista de espera/i }),
    ).not.toBeInTheDocument();
  });

  it('lets a waitlisted player leave the waitlist', async () => {
    const game = {
      id: 'game-1',
      title: 'Full game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 2,
      confirmedPlayers: 2,
      openSlots: 0,
      waitlistEnabled: true,
      waitlistSize: 2,
      waitlistCount: 1,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'public',
      status: 'scheduled',
      currentUserStatus: 'waitlisted',
      waitlist: [{ id: 'player-1', displayName: 'Bruno' }],
    };
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? Promise.resolve(new Response(null, { status: 204 }))
        : Promise.resolve(new Response(JSON.stringify(game), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /tentar pegar a vaga/i })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /sair da lista de espera/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games/game-1/waitlist',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('lets a waitlisted player try to take an open slot', async () => {
    const game = {
      id: 'game-1',
      title: 'Game with an open slot',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 2,
      confirmedPlayers: 1,
      openSlots: 1,
      waitlistEnabled: true,
      waitlistSize: 2,
      waitlistCount: 1,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'public',
      status: 'scheduled',
      currentUserStatus: 'waitlisted',
      waitlist: [{ id: 'player-1', displayName: 'Bruno' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(game), { status: 200 }))),
    );

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: /tentar pegar a vaga/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /entrar na lista de espera/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the API reason when joining a shared-link game is rejected', async () => {
    const game = {
      id: 'game-1',
      title: 'Saturday game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 1,
      openSlots: 3,
      minimumSkillLevel: 'intermediate',
      maximumSkillLevel: 'advanced',
      visibility: 'link-only',
      status: 'scheduled',
      currentUserStatus: '',
      players: [{ id: 'host-1', displayName: 'Host', role: 'organizer' }],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/join')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'skill_out_of_range',
                message: 'Your skill level is outside this game range.',
                fields: {},
              },
            }),
            { status: 409 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(game), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/games/game-1?access=secret']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /participar da partida/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seu nível está fora da faixa desta partida.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/games/game-1/join',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('offers profile setup after join rejection and preserves the game link', async () => {
    const game = {
      id: 'game-1',
      title: 'Saturday game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 1,
      openSlots: 3,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'link-only',
      status: 'scheduled',
      currentUserStatus: '',
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/join')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'profile_required',
                message: 'Complete your profile before joining.',
                fields: {},
              },
            }),
            { status: 422 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(game), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/games/game-1?access=secret']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
          <Route path="/onboarding" element={<p>Onboarding</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /participar da partida/i }));

    const link = await screen.findByRole('link', { name: /configurar perfil/i });
    expect(screen.getByRole('alert')).toHaveTextContent(/informe seu nome e n.vel para entrar/i);
    expect(link).toHaveAttribute('href', '/onboarding?goal=join_game');
    fireEvent.click(link);
    expect(localStorage.getItem('borajogar_onboarding_goal')).toBe('join_game');
    expect(localStorage.getItem('borajogar_return_to')).toBe('/games/game-1?access=secret');
  });

  it('shows the conflicting game and links to its details after a join conflict', async () => {
    const game = {
      id: 'game-1',
      title: 'New game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'New court',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 1,
      openSlots: 3,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'public',
      status: 'scheduled',
      currentUserStatus: '',
    };
    const conflictID = 'game-conflict';
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/join')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'conflicting_game',
                message: 'You already have a conflicting confirmed game.',
                fields: {
                  gameId: conflictID,
                  title: 'Existing match',
                  startsAt: '2099-08-01T12:00:00Z',
                  endsAt: '2099-08-01T13:30:00Z',
                  venueName: 'Existing court',
                  addressLabel: 'Beach entrance',
                },
              },
            }),
            { status: 409 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(game), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /participar da partida/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você já tem uma partida nesse horário.',
    );
    expect(screen.getByText('Existing match')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver partida conflitante/i })).toHaveAttribute(
      'href',
      `/games/${conflictID}`,
    );
  });

  it('clearly marks cancelled games and hides active match actions', async () => {
    const game = {
      id: 'game-2',
      title: 'Cancelled game',
      startsAt: '2099-08-01T12:00:00Z',
      endsAt: '2099-08-01T13:30:00Z',
      venueId: 'venue-1',
      venueName: 'Central court',
      addressLabel: 'Beach entrance',
      latitude: -23.5,
      longitude: -46.6,
      capacity: 4,
      confirmedPlayers: 2,
      openSlots: 2,
      minimumSkillLevel: 'beginner',
      maximumSkillLevel: 'advanced',
      visibility: 'link-only',
      status: 'cancelled',
      currentUserStatus: 'confirmed',
      currentUserRole: 'player',
      players: [{ id: 'player-1', displayName: 'Bruno', role: 'player' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(game), { status: 200 }))),
    );

    render(
      <MemoryRouter initialEntries={['/games/game-2']}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert', { name: 'Partida cancelada' })).toHaveTextContent(
      'Esta partida não acontecerá.',
    );
    expect(screen.getByText('Central court')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /participar da partida/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sair da partida/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /adicionar ao calendário/i }),
    ).not.toBeInTheDocument();
  });
});
