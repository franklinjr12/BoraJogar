import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { CurrentUser } from '../api/client';

const currentUser: CurrentUser = {
  id: 'user-1',
  displayName: 'Signup Name',
  email: 'player@example.com',
  timeZone: 'UTC',
  onboardingComplete: false,
  isAdmin: false,
};

function renderApp(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const incompleteReadiness = {
  profile: false,
  location: false,
  availability: false,
  profileCount: 0,
  favoriteVenueCount: 0,
  preferredAreaCount: 0,
  availabilityCount: 0,
  canComplete: false,
  missing: ['profile', 'location', 'availability'],
};

const profileReadyReadiness = {
  ...incompleteReadiness,
  profile: true,
  profileCount: 1,
  missing: ['location', 'availability'],
};

describe('onboarding', () => {
  afterEach(cleanup);
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('validates display name before saving profile', async () => {
    renderApp('/onboarding');
    fireEvent.change(await screen.findByLabelText(/display name/i), { target: { value: 'A' } });
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 2 characters/i);
  });

  it('prefills display name from current signed-in user', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/v1/me')) {
        return json(currentUser);
      }
      if (String(input).endsWith('/api/v1/me/onboarding/readiness')) {
        return json(incompleteReadiness);
      }
      return json({});
    });
    renderApp('/onboarding');
    const input = await screen.findByLabelText(/display name/i);
    await waitFor(() => expect(input).toHaveValue('Signup Name'));
  });

  it('recovers stale legacy onboarding progress instead of showing a blank setup page', async () => {
    localStorage.setItem(
      'borajogar_onboarding',
      JSON.stringify({ step: 8, profile: { displayName: 'Old State' } }),
    );
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/v1/me')) return json(currentUser);
      if (String(input).endsWith('/api/v1/me/onboarding/readiness'))
        return json(incompleteReadiness);
      return json({});
    });

    renderApp('/onboarding');

    expect(
      await screen.findByRole('heading', { name: /tell us about your game/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it('sends an existing incomplete user with a profile to the location step', async () => {
    localStorage.setItem('borajogar_onboarding', JSON.stringify({ step: 8, profile: currentUser }));
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/v1/me')) return json(currentUser);
      if (url.endsWith('/api/v1/me/onboarding/readiness')) return json(profileReadyReadiness);
      if (url.startsWith('/api/v1/venues')) return json([]);
      if (url.endsWith('/api/v1/me/favorite-venues')) return json([]);
      if (url.endsWith('/api/v1/me/preferred-areas')) return json([]);
      return json({});
    });

    renderApp('/onboarding');

    expect((await screen.findAllByText(/playing locations/i)).length).toBeGreaterThan(0);
    expect(
      await screen.findByRole('button', { name: /add my first location/i }),
    ).toBeInTheDocument();
  });

  it('keeps create-game users in onboarding until location and availability are complete', async () => {
    let readinessCalls = 0;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/v1/me')) return json(currentUser);
      if (url.endsWith('/api/v1/me/profile') && init?.method === 'PUT') return json({});
      if (url.endsWith('/api/v1/me/onboarding') && init?.method === 'PUT') return json({});
      if (url.endsWith('/api/v1/me/onboarding/readiness')) {
        readinessCalls += 1;
        return json(readinessCalls === 1 ? incompleteReadiness : profileReadyReadiness);
      }
      if (url.startsWith('/api/v1/venues')) return json([]);
      if (url.endsWith('/api/v1/me/favorite-venues')) return json([]);
      if (url.endsWith('/api/v1/me/preferred-areas')) return json([]);
      return json({});
    });

    renderApp('/onboarding?goal=create_game');
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: 'Signup Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect((await screen.findAllByText(/playing locations/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /set up a game/i })).not.toBeInTheDocument();
  });
});

describe('profile editing', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and saves profile edits', async () => {
    const profile = {
      userId: 'user-1',
      displayName: 'Ana',
      timeZone: 'UTC',
      skillLevel: 'beginner',
      bio: '',
      styles: ['mixed'],
      preferredGameDurationMinutes: 90,
      minimumNoticeMinutes: 120,
      activeForMatchmaking: true,
    };
    const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/v1/me')) return json({ ...currentUser, onboardingComplete: true });
      if (url.endsWith('/api/v1/me/profile') && init?.method === 'PUT')
        return json({ ...profile, displayName: 'Bia' });
      if (url.endsWith('/api/v1/me/profile')) return json(profile);
      return json({});
    });
    renderApp('/profile');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Bia' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Bia' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/profile',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('signs out from the profile page and sends the user to login', async () => {
    const profile = {
      userId: 'user-1',
      displayName: 'Ana',
      timeZone: 'UTC',
      skillLevel: 'beginner',
      bio: '',
      styles: ['mixed'],
      preferredGameDurationMinutes: 90,
      minimumNoticeMinutes: 120,
      activeForMatchmaking: true,
    };
    let loggedOut = false;
    const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/logout') && init?.method === 'POST') {
        loggedOut = true;
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/api/v1/me')) {
        return loggedOut
          ? json({ error: { code: 'unauthorized', message: 'Sign in.', fields: {} } }, 401)
          : json({ ...currentUser, onboardingComplete: true });
      }
      if (url.endsWith('/api/v1/me/profile')) return json(profile);
      return json({});
    });

    renderApp('/profile');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByRole('heading', { name: /sign in to play/i })).toBeInTheDocument();
  });

  it('does not stay loading when profile response is empty', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/v1/me')) {
        return json({ error: { code: 'unauthorized', message: 'Sign in.', fields: {} } }, 401);
      }
      return new Response(null, { status: 204 });
    });
    renderApp('/profile');
    expect(await screen.findByText(/sign in to view your profile/i)).toBeInTheDocument();
  });

  it('sends signed-in users without a profile back to setup', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/v1/me')) return json(currentUser);
      if (url.endsWith('/api/v1/me/profile')) {
        return json(
          { error: { code: 'profile_missing', message: 'Profile missing.', fields: {} } },
          404,
        );
      }
      return json({});
    });
    renderApp('/profile');

    expect(await screen.findByText(/complete your profile setup/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue setup/i })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });
});
