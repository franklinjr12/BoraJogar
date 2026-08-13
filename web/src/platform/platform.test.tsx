import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { InstallPrompt } from './InstallPrompt';
import { OfflineStatus } from './OfflineStatus';
import { GameAlertPrompt } from '../features/notifications/GameAlertPrompt';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('mobile platform experience', () => {
  it('shows primary mobile navigation and hides admin by default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url.endsWith('/api/v1/me')
                ? {
                    id: 'user-1',
                    displayName: 'Ana',
                    email: 'ana@example.com',
                    timeZone: 'America/Sao_Paulo',
                    onboardingComplete: true,
                    isAdmin: false,
                  }
                : { items: [], unreadCount: 0, hasMore: false, page: 1, pageSize: 1 },
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppShell>
            <p>content</p>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('navigation', { name: /navegação principal/i })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Partidas' })).toHaveAttribute('href', '/games');
    fireEvent.click(await screen.findByText('Mais'));
    expect(screen.getByRole('link', { name: 'Quadras' })).toHaveAttribute('href', '/locations');
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('labels stale state and offers explicit retry while offline', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const retry = vi.fn();
    render(<OfflineStatus onRetry={retry} />);
    expect(screen.getByRole('status')).toHaveTextContent(/você está offline/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar conexão novamente/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows install guidance only after contextual readiness', async () => {
    localStorage.setItem('borajogar_install_prompt_ready', 'true');
    render(<InstallPrompt />);
    const installEvent = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(installEvent, {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    window.dispatchEvent(installEvent);
    expect(
      await screen.findByRole('complementary', { name: /instalar o bora jogar/i }),
    ).toHaveTextContent(/instalar aplicativo/i);
  });

  it('routes game alerts to in-app notifications without requesting browser permission', () => {
    localStorage.clear();
    localStorage.setItem('borajogar_game_alert_prompt_ready', 'true');
    const requestPermission = vi.fn();
    vi.stubGlobal('Notification', { requestPermission });
    render(
      <MemoryRouter>
        <GameAlertPrompt />
      </MemoryRouter>,
    );
    expect(screen.getByRole('complementary', { name: /alertas de partidas/i })).toHaveTextContent(
      /acompanhe os avisos/i,
    );
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: /ver avisos/i }));
    expect(localStorage.getItem('borajogar_game_alert_prompt_dismissed')).toBe('true');
  });
});
