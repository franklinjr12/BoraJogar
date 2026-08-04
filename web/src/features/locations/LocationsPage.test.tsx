import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationsPage } from './LocationsPage';

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
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
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
