import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationsPage } from './LocationsPage';

type MockMapEvent = { lngLat: { lat: number; lng: number } };
type MockMapHandler = (event?: MockMapEvent) => void;

interface MockMapInstance {
  handlers: Record<string, MockMapHandler>;
  remove: ReturnType<typeof vi.fn>;
  setCenter: ReturnType<typeof vi.fn>;
}

const maplibreMock = vi.hoisted(() => {
  const instances: MockMapInstance[] = [];
  class MockMap implements MockMapInstance {
    handlers: Record<string, MockMapHandler> = {};
    remove = vi.fn();
    setCenter = vi.fn();

    constructor() {
      instances.push(this);
    }

    addControl() {
      return undefined;
    }

    on(event: string, handler: MockMapHandler) {
      this.handlers[event] = handler;
      return this;
    }

    getCenter() {
      return { lat: -25.429, lng: -49.274 };
    }
  }

  return {
    instances,
    Map: MockMap,
    NavigationControl: vi.fn(),
  };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: maplibreMock.Map,
    NavigationControl: maplibreMock.NavigationControl,
  },
}));

const venue = {
  id: 'venue-1',
  name: 'Parque Barigui',
  city: 'Curitiba',
  addressLabel: 'Rua Example',
  latitude: -25.4,
  longitude: -49.3,
  lightingStatus: 'has_lighting',
  surfaceType: 'sand',
  accessType: 'public',
  active: true,
};

function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('locations page', () => {
  beforeEach(() => {
    maplibreMock.instances.length = 0;
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts list-first and hides coordinates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('favorite-venues')) return Promise.resolve(response([venue]));
        if (url.includes('preferred-areas'))
          return Promise.resolve(
            response([
              {
                id: 'area-1',
                label: 'Near home',
                latitude: -25.4,
                longitude: -49.3,
                radiusMeters: 4000,
                priority: 0,
                active: true,
              },
            ]),
          );
        return Promise.resolve(response([venue]));
      }),
    );
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /where can you play/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Parque Barigui' })).toBeInTheDocument();
    expect(screen.getByText(/within 4 km/i)).toBeInTheDocument();
    expect(screen.queryByText(/-25\.4/)).not.toBeInTheDocument();
  });

  it('saves a known court from the chooser', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(new Response(null, { status: 204 }));
      if (url.includes('favorite-venues')) return Promise.resolve(response([]));
      if (url.includes('preferred-areas')) return Promise.resolve(response([]));
      return Promise.resolve(response([venue]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose a court/i }));
    fireEvent.click(screen.getByRole('button', { name: /parque barigui/i }));
    fireEvent.click(screen.getByRole('button', { name: /save court/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/favorite-venues/venue-1',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText(/court saved/i)).toBeInTheDocument();
  });

  it('requests current location only after explicit click and uses radius presets', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) =>
        success({
          coords: { latitude: -25.4289, longitude: -49.2738 } as GeolocationCoordinates,
        } as GeolocationPosition),
      ),
    };
    vi.stubGlobal('navigator', { ...navigator, geolocation });
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Promise.resolve(
          response({
            id: 'area-1',
            label: 'Near my area',
            latitude: -25.429,
            longitude: -49.274,
            radiusMeters: 7000,
            priority: 0,
            active: true,
          }),
        );
      if (url.includes('favorite-venues') || url.includes('preferred-areas'))
        return Promise.resolve(response([]));
      return Promise.resolve(response([venue]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }));
    expect(await screen.findByText(/area set from your device location/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7 km' }));
    fireEvent.click(screen.getByRole('button', { name: /save area/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/preferred-areas',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"radiusMeters":7000'),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/preferred-areas',
      expect.objectContaining({
        body: expect.stringContaining('"latitude":-25.429'),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/preferred-areas',
      expect.objectContaining({
        body: expect.stringContaining('"longitude":-49.274'),
      }),
    );
  });

  it('explains insecure local phone access without requesting location', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    const geolocation = {
      getCurrentPosition: vi.fn(),
    };
    vi.stubGlobal('navigator', { ...navigator, geolocation });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('favorite-venues') || url.includes('preferred-areas'))
          return Promise.resolve(response([]));
        return Promise.resolve(response([venue]));
      }),
    );
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }));

    expect(await screen.findByText(/location requires https/i)).toBeInTheDocument();
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('shows browser-settings guidance when location permission is blocked', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) =>
        error({
          code: 1,
          message: 'denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError),
      ),
    };
    vi.stubGlobal('navigator', { ...navigator, geolocation });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('favorite-venues') || url.includes('preferred-areas'))
          return Promise.resolve(response([]));
        return Promise.resolve(response([venue]));
      }),
    );
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }));

    expect(await screen.findByText(/enable it in browser settings/i)).toBeInTheDocument();
  });

  it('keeps search fallback available when geolocation is missing', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('favorite-venues') || url.includes('preferred-areas'))
          return Promise.resolve(response([]));
        return Promise.resolve(response([venue]));
      }),
    );
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }));
    fireEvent.click(screen.getByRole('button', { name: /search for a neighborhood or address/i }));

    expect(await screen.findByText(/browser location is unavailable/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/neighborhood or address search/i)).toBeInTheDocument();
  });

  it('renders the dev map fallback when no map style URL is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('favorite-venues') || url.includes('preferred-areas'))
          return Promise.resolve(response([]));
        return Promise.resolve(response([venue]));
      }),
    );
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));

    expect(screen.getByLabelText(/area selection map/i)).toBeInTheDocument();
    expect(screen.queryByText(/map unavailable/i)).not.toBeInTheDocument();
  });

  it('shows the map fallback message when map loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('favorite-venues') || url.includes('preferred-areas'))
          return Promise.resolve(response([]));
        return Promise.resolve(response([venue]));
      }),
    );
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    await waitFor(() => expect(maplibreMock.instances.length).toBeGreaterThan(0));

    maplibreMock.instances[0]?.handlers.error?.();

    expect(await screen.findByText(/map unavailable/i)).toBeInTheDocument();
  });

  it('searches for an area and saves the selected result', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('geocoding-api.open-meteo.com'))
        return Promise.resolve(
          response({
            results: [
              {
                id: 123,
                name: 'Batel',
                latitude: -25.4412,
                longitude: -49.2877,
                admin1: 'Parana',
                country: 'Brazil',
              },
            ],
          }),
        );
      if (init?.method === 'POST')
        return Promise.resolve(
          response({
            id: 'area-1',
            label: 'Near Batel',
            latitude: -25.441,
            longitude: -49.288,
            radiusMeters: 4000,
            priority: 0,
            active: true,
          }),
        );
      if (href.includes('favorite-venues') || href.includes('preferred-areas'))
        return Promise.resolve(response([]));
      return Promise.resolve(response([venue]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    fireEvent.click(screen.getByRole('button', { name: /search for a neighborhood or address/i }));
    fireEvent.change(screen.getByLabelText(/neighborhood or address search/i), {
      target: { value: 'Batel' },
    });

    fireEvent.click(await screen.findByRole('option', { name: /batel/i }));
    fireEvent.click(screen.getByRole('button', { name: /save area/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/preferred-areas',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"label":"Near Batel"'),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/preferred-areas',
      expect.objectContaining({
        body: expect.stringContaining('"latitude":-25.441'),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/preferred-areas',
      expect.objectContaining({
        body: expect.stringContaining('"longitude":-49.288'),
      }),
    );
  });

  it('shows a message when area search has no matches', async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('geocoding-api.open-meteo.com'))
        return Promise.resolve(response({ results: [] }));
      if (href.includes('favorite-venues') || href.includes('preferred-areas'))
        return Promise.resolve(response([]));
      return Promise.resolve(response([venue]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    fireEvent.click(screen.getByRole('button', { name: /search for a neighborhood or address/i }));
    fireEvent.change(screen.getByLabelText(/neighborhood or address search/i), {
      target: { value: 'Nopeville' },
    });

    expect(await screen.findByText(/neighborhood or address not found/i)).toBeInTheDocument();
  });

  it('shows a retry message when area search fails', async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('geocoding-api.open-meteo.com'))
        return Promise.reject(new Error('search unavailable'));
      if (href.includes('favorite-venues') || href.includes('preferred-areas'))
        return Promise.resolve(response([]));
      return Promise.resolve(response([venue]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/choose where you could play/i);
    fireEvent.click(screen.getByRole('button', { name: /choose an area/i }));
    fireEvent.click(screen.getByRole('button', { name: /search for a neighborhood or address/i }));
    fireEvent.change(screen.getByLabelText(/neighborhood or address search/i), {
      target: { value: 'Batel' },
    });

    expect(await screen.findByText(/could not search area/i)).toBeInTheDocument();
  });
});
