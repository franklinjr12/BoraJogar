import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { InstallPrompt } from './InstallPrompt';
import { OfflineStatus } from './OfflineStatus';

afterEach(cleanup);

describe('mobile platform experience', () => {
  it('shows primary mobile navigation and hides admin by default', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Games' })).toHaveAttribute('href', '/games');
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('labels stale state and offers explicit retry while offline', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const retry = vi.fn();
    render(<OfflineStatus onRetry={retry} />);
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
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
    expect(await screen.findByRole('complementary', { name: /install/i })).toHaveTextContent(
      /install/i,
    );
  });
});
