import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityPage } from './AvailabilityPage';

describe('AvailabilityPage', () => {
  afterEach(cleanup);
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

  it('surfaces save failure while preserving form', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(new Response('{}', { status: 422 }));
      const body = url.includes('preferred-areas')
        ? [{ id: 'area-1', label: 'Near home', active: true }]
        : [];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <AvailabilityPage />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: /weekly availability/i });
    fireEvent.submit(screen.getAllByRole('button', { name: /add interval/i })[0]!.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
    expect(screen.getByLabelText(/preferred area/i)).toHaveValue('');
  });
});
