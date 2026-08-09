import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationsPage } from './LocationsPage';

const googleMapsMock = vi.hoisted(() => ({ loadGoogleMaps: vi.fn() }));
vi.mock('./googleMaps', () => googleMapsMock);

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
    googleMapsMock.loadGoogleMaps.mockRejectedValue(new Error('Google Maps unavailable'));
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

    expect(
      await screen.findByRole('heading', { name: /onde você pode jogar/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Parque Barigui' })).toBeInTheDocument();
    expect(screen.getByText(/em um raio de 4 km/i)).toBeInTheDocument();
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

    await screen.findByText(/escolha onde você poderia jogar/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher uma quadra/i }));
    fireEvent.click(screen.getByRole('button', { name: /parque barigui/i }));
    fireEvent.click(screen.getByRole('button', { name: /salvar quadra/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/favorite-venues/venue-1',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText(/quadra salva/i)).toBeInTheDocument();
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

    await screen.findByText(/escolha onde você poderia jogar/i);
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /escolher uma área/i }));
    fireEvent.click(screen.getByRole('button', { name: /usar minha localização atual/i }));
    expect(
      await screen.findByText(/área definida pela localização do seu dispositivo/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7 km' }));
    fireEvent.click(screen.getByRole('button', { name: /salvar área/i }));

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

    await screen.findByText(/escolha onde você poderia jogar/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher uma área/i }));
    fireEvent.click(screen.getByRole('button', { name: /usar minha localização atual/i }));

    expect(await screen.findByText(/localização exige https/i)).toBeInTheDocument();
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

    await screen.findByText(/escolha onde você poderia jogar/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher uma área/i }));
    fireEvent.click(screen.getByRole('button', { name: /usar minha localização atual/i }));

    expect(await screen.findByText(/ative-a nas configurações do navegador/i)).toBeInTheDocument();
  });

  it('uses Google search without alternate address search when geolocation is missing', async () => {
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

    await screen.findByText(/escolha onde você poderia jogar/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher uma área/i }));
    fireEvent.click(screen.getByRole('button', { name: /usar minha localização atual/i }));
    expect(await screen.findByText(/a localização do navegador está indisponível/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /pesquisar no google maps/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pesquisa google indisponível/i);
    expect(screen.queryByLabelText(/pesquisa de bairro ou endereço/i)).not.toBeInTheDocument();
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

    await screen.findByText(/escolha onde você poderia jogar/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher uma área/i }));

    expect(screen.getByLabelText(/mapa para selecionar área/i)).toBeInTheDocument();
    expect(screen.queryByText(/mapa indisponível/i)).not.toBeInTheDocument();
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

    await screen.findByText(/escolha onde você poderia jogar/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher uma área/i }));
    await waitFor(() => expect(maplibreMock.instances.length).toBeGreaterThan(0));

    maplibreMock.instances[0]?.handlers.error?.();

    expect(await screen.findByText(/mapa indisponível/i)).toBeInTheDocument();
  });

  it('uses Google place selection to create a preferred area', async () => {
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

    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Promise.resolve(
          response({
            id: 'area-1',
            label: 'Perto de Curitiba',
            latitude: -25.441,
            longitude: -49.276,
            radiusMeters: 4000,
            priority: 0,
            active: true,
          }),
        );
      if (String(url).includes('favorite-venues') || String(url).includes('preferred-areas'))
        return Promise.resolve(response([]));
      return Promise.resolve(response([venue]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/escolha onde você poderia jogar/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher uma área/i }));
    fireEvent.click(screen.getByRole('button', { name: /pesquisar no google maps/i }));
    await waitFor(() => expect(autocompleteInstances).toHaveLength(1));

    const place = {
      id: 'google-place-1',
      displayName: 'Praça Oswaldo Cruz',
      formattedAddress: 'Praça Oswaldo Cruz, S/n - Centro, Curitiba - PR',
      addressComponents: [{ types: ['administrative_area_level_2'], longText: 'Curitiba' }],
      location: { lat: () => -25.4405, lng: () => -49.276 },
      fetchFields: vi.fn(),
    };
    autocompleteInstances[0]?.emit(new MockSelectEvent({ toPlace: () => place }));

    await waitFor(() => expect(place.fetchFields).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /salvar área/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/preferred-areas',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"latitude":-25.44'),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/preferred-areas',
      expect.objectContaining({ body: expect.stringContaining('"longitude":-49.276') }),
    );
  });

});
