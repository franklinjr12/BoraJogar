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
      screen.getByRole('heading', { name: /encontre pessoas para jogar vôlei de praia/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /começar/i })).toHaveAttribute('href', '/start');
    expect(await screen.findByRole('link', { name: /já tem uma conta/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('hides sign-in and links complete signed-in users to the dashboard', async () => {
    mockCurrentUser(signedInUser);
    renderApp();

    expect(screen.queryByRole('link', { name: /já tem uma conta/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /ir para o painel/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('hides sign-in and links incomplete signed-in users to setup', async () => {
    mockCurrentUser({ ...signedInUser, onboardingComplete: false });
    renderApp();

    expect(screen.queryByRole('link', { name: /já tem uma conta/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /começar/i })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('link', { name: /continuar configuração/i })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });

  it('persists the selected first goal', async () => {
    mockCurrentUser(null);
    renderApp(['/start']);
    fireEvent.click(await screen.findByRole('link', { name: /criar uma partida/i }));
    expect(localStorage.getItem('borajogar_onboarding_goal')).toBe('create_game');
  });

  it('routes complete signed-in users directly to game creation', async () => {
    mockCurrentUser(signedInUser);
    renderApp(['/start']);

    expect(await screen.findByRole('link', { name: /criar uma partida/i })).toHaveAttribute(
      'href',
      '/games/new',
    );
  });

  it('routes incomplete signed-in users to create-game onboarding', async () => {
    mockCurrentUser({ ...signedInUser, onboardingComplete: false });
    renderApp(['/start']);

    expect(await screen.findByRole('link', { name: /criar uma partida/i })).toHaveAttribute(
      'href',
      '/onboarding?goal=create_game',
    );
  });

  it('routes signed-out create-game users through login', async () => {
    mockCurrentUser(null);
    renderApp(['/start']);

    expect(await screen.findByRole('link', { name: /criar uma partida/i })).toHaveAttribute(
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

    fireEvent.change(screen.getByLabelText(/nome exibido/i), { target: { value: 'Local Player' } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'local@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'pw' } });
    const createButtons = screen.getAllByRole('button', { name: /^criar conta$/i });
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
