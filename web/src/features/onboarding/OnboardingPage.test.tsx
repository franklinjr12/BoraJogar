import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingPage } from './OnboardingPage';

function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OnboardingPage', () => {
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
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: 'Franklin' },
    });
    fireEvent.click(screen.getByRole('button', { name: /intermediate/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

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
});
