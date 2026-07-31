import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GamesPage } from './GamesPage';

describe('GamesPage', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 })))); });
  it('shows create action and empty state', async () => {
    render(<MemoryRouter><GamesPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { name: /get on court/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /create a game/i })).toHaveAttribute('href', '/games/new');
    expect(screen.getByText(/no upcoming games/i)).toBeInTheDocument();
  });
});
