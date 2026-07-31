import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityPage } from './AvailabilityPage';

describe('AvailabilityPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const body = url.includes('preferred-areas')
          ? [{ id: 'area-1', label: 'Near home', active: true }]
          : [];
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );
  });

  it('shows weekly editor and location requirement', async () => {
    render(
      <MemoryRouter>
        <AvailabilityPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /weekly availability/i })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/preferred area/i)).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Near home' })).toBeInTheDocument();
  });
});
