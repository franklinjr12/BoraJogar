import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingPage } from './OnboardingPage';

function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OnboardingPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/v1/me')
          return Promise.resolve(
            response({
              id: 'user-1',
              displayName: 'Franklin',
              email: 'franklin@example.com',
              timeZone: 'America/Sao_Paulo',
              onboardingComplete: false,
              isAdmin: false,
            }),
          );
        if (url === '/api/v1/me/onboarding/readiness')
          return Promise.resolve(
            response({
              profile: false,
              location: false,
              availability: false,
              profileCount: 0,
              favoriteVenueCount: 0,
              preferredAreaCount: 0,
              availabilityCount: 0,
              canComplete: false,
              missing: ['profile', 'location', 'availability'],
            }),
          );
        if (url === '/api/v1/me/profile')
          return Promise.resolve(
            response({
              userId: 'user-1',
              displayName: 'Franklin',
              timeZone: 'America/Sao_Paulo',
              skillLevel: 'intermediate',
              styles: ['mixed'],
              preferredGameDurationMinutes: 90,
              minimumNoticeMinutes: 120,
              activeForMatchmaking: false,
            }),
          );
        if (url === '/api/v1/me/onboarding') return Promise.resolve(response({}));
        return Promise.resolve(response([]));
      }),
    );
  });

  it('saves only minimum profile fields with defaults', async () => {
    const fetchMock = vi.mocked(fetch);
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingPage />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText(/nome exibido/i), {
      target: { value: 'Franklin' },
    });
    fireEvent.click(screen.getByRole('button', { name: /intermediário/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /continuar/i }).at(-1)!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/profile',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"preferredGameDurationMinutes":90'),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/profile',
      expect.objectContaining({
        body: expect.stringContaining('"minimumNoticeMinutes":120'),
      }),
    );
  });

  it('continues after choosing current location without manual area setup', async () => {
    let locationReady = false;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) =>
        success({
          coords: { latitude: -25.4289, longitude: -49.2738 } as GeolocationCoordinates,
        } as GeolocationPosition),
      ),
    };
    vi.stubGlobal('navigator', { ...navigator, onLine: true, geolocation });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/me')
        return Promise.resolve(
          response({
            id: 'user-1',
            displayName: 'Franklin',
            email: 'franklin@example.com',
            timeZone: 'America/Sao_Paulo',
            onboardingComplete: false,
            isAdmin: false,
          }),
        );
      if (url === '/api/v1/me/onboarding/readiness')
        return Promise.resolve(
          response({
            profile: true,
            location: locationReady,
            availability: false,
            profileCount: 1,
            favoriteVenueCount: 0,
            preferredAreaCount: locationReady ? 1 : 0,
            availabilityCount: 0,
            canComplete: false,
            missing: locationReady ? ['availability'] : ['location', 'availability'],
          }),
        );
      if (url === '/api/v1/me/preferred-areas' && init?.method === 'POST') {
        locationReady = true;
        return Promise.resolve(
          response({
            id: 'area-1',
            label: 'Perto de você',
            latitude: -25.429,
            longitude: -49.274,
            radiusMeters: 4000,
            priority: 0,
            active: true,
          }),
        );
      }
      if (url.includes('favorite-venues') || url.includes('preferred-areas'))
        return Promise.resolve(response([]));
      if (url.startsWith('/api/v1/venues')) return Promise.resolve(response([]));
      return Promise.resolve(response({}));
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /usar minha localização atual/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/preferred-areas',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /continuar/i }).at(-1)).not.toBeDisabled(),
    );
    fireEvent.click(screen.getAllByRole('button', { name: /continuar/i }).at(-1)!);

    expect(await screen.findByText(/sua agenda/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/adicione uma quadra ou área antes de continuar/i),
    ).not.toBeInTheDocument();
  });

  it('returns join users to the saved game after completing setup', async () => {
    localStorage.setItem('borajogar_onboarding_goal', 'join_game');
    localStorage.setItem('borajogar_return_to', '/games/game-1?access=secret');
    let readinessCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/v1/me') {
          return Promise.resolve(
            response({
              id: 'user-1',
              displayName: 'Franklin',
              email: 'franklin@example.com',
              timeZone: 'America/Sao_Paulo',
              onboardingComplete: false,
              isAdmin: false,
            }),
          );
        }
        if (url === '/api/v1/me/onboarding/readiness') {
          readinessCalls += 1;
          return Promise.resolve(
            response(
              readinessCalls === 1
                ? {
                    profile: false,
                    location: false,
                    availability: false,
                    profileCount: 0,
                    favoriteVenueCount: 0,
                    preferredAreaCount: 0,
                    availabilityCount: 0,
                    canComplete: false,
                    missing: ['profile', 'location', 'availability'],
                  }
                : {
                    profile: true,
                    location: false,
                    availability: false,
                    profileCount: 1,
                    favoriteVenueCount: 0,
                    preferredAreaCount: 0,
                    availabilityCount: 0,
                    canComplete: false,
                    missing: ['location', 'availability'],
                  },
            ),
          );
        }
        if (url === '/api/v1/me/onboarding/complete' && init?.method === 'POST') {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(response({}));
      }),
    );

    render(
      <MemoryRouter initialEntries={['/onboarding?goal=join_game']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/games/:id" element={<p>Returned to game</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText(/nome exibido/i), {
      target: { value: 'Franklin' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(await screen.findByText('Returned to game')).toBeInTheDocument();
    expect(localStorage.getItem('borajogar_onboarding_goal')).toBeNull();
    expect(localStorage.getItem('borajogar_return_to')).toBeNull();
  });
});
