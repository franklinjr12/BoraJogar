import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationsPage } from './LocationsPage';

const venue = {
  id: 'venue-1',
  name: 'Praia Central',
  city: 'São Paulo',
  latitude: -23.5,
  longitude: -46.6,
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
    vi.restoreAllMocks();
  });

  it('loads venues, hides large map fallback, and saves preferred area', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(response([venue]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response({
          id: 'area-1',
          label: 'Centro',
          latitude: -23.5,
          longitude: -46.6,
          radiusMeters: 2500,
          priority: 0,
          active: true,
        }),
      );
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Praia Central' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /where do you play/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/personalized name/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /map unavailable/i })).not.toBeInTheDocument();
    expect(screen.getByText(/map unavailable/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Centro' } });
    fireEvent.click(screen.getByRole('button', { name: /save preferred area/i }));
    expect(await screen.findByText(/preferred area saved/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/preferred-areas',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('handles empty venue list and favorites an approved venue', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(response([venue]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Praia Central' });
    fireEvent.click(screen.getByRole('button', { name: /add praia central favorite/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/favorite-venues/venue-1',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      screen.getByRole('button', { name: /remove praia central favorite/i }),
    ).toBeInTheDocument();
  });

  it('shows create-location controls when venue list is empty', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response({
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'venue-2',
            name: 'Nova Quadra',
            city: 'Sao Paulo',
            latitude: -23.5,
            longitude: -46.6,
            lightingStatus: 'unknown',
            surfaceType: 'sand',
            accessType: 'unknown',
            active: true,
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/no courts saved yet/i)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /^create location$/i }));
    expect(await screen.findByText(/ready for games/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/venues',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"city":"Sao Paulo"'),
      }),
    );
  });
});
