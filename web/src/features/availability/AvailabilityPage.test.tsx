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

  it('surfaces API save failure while preserving form', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'availability_rule_conflict',
                message: 'This interval overlaps an existing availability rule.',
                fields: {},
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
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
    expect(await screen.findByRole('alert')).toHaveTextContent(/overlaps an existing/i);
    expect(screen.getByLabelText(/preferred area/i)).toHaveValue('');
  });

  it('adds saved interval to weekly summary after successful save', async () => {
    const rule = {
      id: 'rule-1',
      weekday: 6,
      Start: '07:00',
      End: '09:00',
      Timezone: 'America/Sao_Paulo',
      ValidFrom: '2026-08-01',
      active: true,
      venueIds: [],
      preferredAreaIds: ['area-1'],
    };
    let saved = false;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        saved = true;
        return Promise.resolve(new Response(JSON.stringify(rule), { status: 200 }));
      }
      const body = url.includes('preferred-areas')
        ? [{ id: 'area-1', label: 'Near home', active: true }]
        : saved
          ? [rule]
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
    fireEvent.change(screen.getByLabelText(/preferred area/i), { target: { value: 'area-1' } });
    fireEvent.submit(screen.getByRole('button', { name: /add interval/i }).closest('form')!);

    expect(await screen.findByText('07:00-09:00')).toBeInTheDocument();
    expect(screen.getAllByText('Near home')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats empty rules response as no recurring intervals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.includes('availability/rules')
            ? new Response(null, { status: 204 })
            : new Response(JSON.stringify([]), { status: 200 }),
        ),
      ),
    );
    render(
      <MemoryRouter>
        <AvailabilityPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no recurring intervals yet/i)).toBeInTheDocument();
  });

  it('points users to locations before adding availability without areas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
    );
    render(
      <MemoryRouter>
        <AvailabilityPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/add a preferred area first/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create preferred area/i })).toHaveAttribute(
      'href',
      '/locations',
    );
    expect(screen.getByRole('button', { name: /add interval/i })).toBeDisabled();
  });
});
