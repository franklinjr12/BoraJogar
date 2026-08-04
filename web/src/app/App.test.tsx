import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { CurrentUser } from '../api/client';

const signedInUser: CurrentUser = {
  id: 'user-1',
  displayName: 'Local Player',
  email: 'local@example.com',
  timeZone: 'America/Sao_Paulo',
  onboardingComplete: true,
  isAdmin: false,
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function mockCurrentUser(user: CurrentUser | null) {
  return vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/api/v1/me')) {
      if (!user)
        return json({ error: { code: 'unauthorized', message: 'Sign in.', fields: {} } }, 401);
      return json(user);
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
}

function renderApp(initialEntries = ['/']) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('home screen', () => {
  beforeEach(() => localStorage.clear());

  it('shows outcome messaging and starts goal selection', async () => {
    mockCurrentUser(null);
    renderApp();
    expect(
      screen.getByRole('heading', { name: /find people to play beach volleyball/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/start');
    expect(await screen.findByRole('link', { name: /already have an account/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('hides sign-in and links complete signed-in users to the dashboard', async () => {
    mockCurrentUser(signedInUser);
    renderApp();

    expect(
      screen.queryByRole('link', { name: /already have an account/i }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('hides sign-in and links incomplete signed-in users to setup', async () => {
    mockCurrentUser({ ...signedInUser, onboardingComplete: false });
    renderApp();

    expect(
      screen.queryByRole('link', { name: /already have an account/i }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /get started/i })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('link', { name: /continue setup/i })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });

  it('persists the selected first goal', async () => {
    mockCurrentUser(null);
    renderApp(['/start']);
    fireEvent.click(await screen.findByRole('link', { name: /create a game/i }));
    expect(localStorage.getItem('borajogar_onboarding_goal')).toBe('create_game');
  });

  it('routes complete signed-in users directly to game creation', async () => {
    mockCurrentUser(signedInUser);
    renderApp(['/start']);

    expect(await screen.findByRole('link', { name: /create a game/i })).toHaveAttribute(
      'href',
      '/games/new',
    );
  });

  it('routes incomplete signed-in users to create-game onboarding', async () => {
    mockCurrentUser({ ...signedInUser, onboardingComplete: false });
    renderApp(['/start']);

    expect(await screen.findByRole('link', { name: /create a game/i })).toHaveAttribute(
      'href',
      '/onboarding?goal=create_game',
    );
  });

  it('routes signed-out create-game users through login', async () => {
    mockCurrentUser(null);
    renderApp(['/start']);

    expect(await screen.findByRole('link', { name: /create a game/i })).toHaveAttribute(
      'href',
      '/login?returnTo=/onboarding?goal=create_game',
    );
  });
});

describe('login screen', () => {
  beforeEach(() => localStorage.clear());

  it('offers email account creation with returnTo', async () => {
    const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/v1/me'))
        return json({ error: { code: 'unauthorized', message: 'Sign in.', fields: {} } }, 401);
      throw new Error('Stop before navigation.');
    });
    renderApp(['/login?returnTo=/games/game-1?access=token']);

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Local Player' } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'local@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    const createButtons = screen.getAllByRole('button', { name: /^create account$/i });
    const submitButton = createButtons[1];
    if (!submitButton) throw new Error('Create account submit button was not found.');
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/email/signup',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"returnTo":"/games/game-1?access=token"'),
        }),
      ),
    );
  });
});
