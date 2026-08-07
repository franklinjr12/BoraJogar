import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityPage } from './AvailabilityPage';

const area = {
  id: 'area-1',
  label: 'Near home',
  latitude: -25.4,
  longitude: -49.3,
  radiusMeters: 4000,
  priority: 0,
  active: true,
};
const venue = {
  id: 'venue-1',
  name: 'Parque Barigui',
  city: 'Curitiba',
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

describe('AvailabilityPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('preferred-areas')) return Promise.resolve(response([area]));
        if (url.includes('favorite-venues')) return Promise.resolve(response([venue]));
        return Promise.resolve(response([]));
      }),
    );
  });

  it('starts with fast preset choices and saved-location default', async () => {
    render(
      <MemoryRouter>
        <AvailabilityPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /quando você mais gostaria de jogar/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neste fim de semana/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /escolher uma quadra/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/qualquer um dos meus locais salvos/i)).toBeChecked();
  });

  it('creates a weekend availability rule for all saved locations', async () => {
    let saved = false;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        saved = true;
        return Promise.resolve(
          response({
            id: 'rule-1',
            weekday: 6,
            start: '09:00',
            end: '13:00',
            timezone: 'America/Sao_Paulo',
            validFrom: '2026-08-02',
            active: true,
            venueIds: ['venue-1'],
            preferredAreaIds: ['area-1'],
          }),
        );
      }
      if (url.includes('preferred-areas')) return Promise.resolve(response([area]));
      if (url.includes('favorite-venues')) return Promise.resolve(response([venue]));
      return Promise.resolve(
        response(
          saved
            ? [
                {
                  id: 'rule-1',
                  weekday: 6,
                  start: '09:00',
                  end: '13:00',
                  timezone: 'America/Sao_Paulo',
                  validFrom: '2026-08-02',
                  active: true,
                  venueIds: ['venue-1'],
                  preferredAreaIds: ['area-1'],
                },
              ]
            : [],
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <AvailabilityPage />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: /neste fim de semana/i });
    fireEvent.submit(
      screen.getByRole('button', { name: /adicionar horário disponível/i }).closest('form')!,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/availability/rules',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"weekday":6'),
        }),
      ),
    );
    expect(localStorage.getItem('borajogar_game_alert_prompt_ready')).toBe('true');
    expect(await screen.findByText('09:00-13:00')).toBeInTheDocument();
  });

  it('requires a saved location before saving availability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('preferred-areas') || url.includes('favorite-venues'))
          return Promise.resolve(response([]));
        return Promise.resolve(response([]));
      }),
    );
    render(
      <MemoryRouter>
        <AvailabilityPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/adicione primeiro um local para jogar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adicionar horário disponível/i })).toBeDisabled();
  });
});
