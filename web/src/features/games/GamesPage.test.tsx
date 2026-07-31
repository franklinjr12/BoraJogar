import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamesPage } from './GamesPage';

describe('GamesPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ items: [], page: 1, pageSize: 30, hasMore: false }), {
            status: 200,
          }),
        ),
      ),
    );
  });
  it('shows create action and empty state', async () => {
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /get on court/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /create a game/i })).toHaveAttribute(
      'href',
      '/games/new',
    );
    expect(screen.getByText(/no upcoming games/i)).toBeInTheDocument();
  });

  it('shows API failure instead of stale empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
    );
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in/i);
    expect(screen.queryByText(/no upcoming games/i)).not.toBeInTheDocument();
  });
});
