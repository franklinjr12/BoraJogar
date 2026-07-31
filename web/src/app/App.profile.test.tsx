import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

function renderApp(path: string) {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>);
}

describe('onboarding', () => {
  afterEach(cleanup);
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('validates display name before advancing', async () => {
    renderApp('/onboarding');
    fireEvent.click(screen.getByRole('button', { name: /let.?s go/i }));
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 2 characters/i);
    expect(screen.getByText(/step 2 of 9/i)).toBeInTheDocument();
  });

  it('persists progress locally across remounts', async () => {
    renderApp('/onboarding');
    fireEvent.click(screen.getByRole('button', { name: /let.?s go/i }));
    const input = await screen.findByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/step 3 of 9/i)).toBeInTheDocument());
    expect(localStorage.getItem('borajogar_onboarding')).toContain('"step":2');
  });

  it('sends profile and completion requests after final step', async () => {
    const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
    localStorage.setItem('borajogar_onboarding', JSON.stringify({ step: 8, profile: { displayName: 'Ana', timeZone: 'UTC', skillLevel: 'beginner', styles: ['mixed'], bio: '', preferredGameDurationMinutes: 90, minimumNoticeMinutes: 120, activeForMatchmaking: true } }));
    renderApp('/onboarding');
    fireEvent.click(screen.getByRole('button', { name: /finish onboarding/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /profile complete/i })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/profile', expect.objectContaining({ method: 'PUT' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/onboarding/complete', expect.objectContaining({ method: 'POST' }));
  });
});

describe('profile editing', () => {
  afterEach(cleanup);
  beforeEach(() => { vi.restoreAllMocks(); });

  it('loads and saves profile edits', async () => {
    const profile = { userId: 'user-1', displayName: 'Ana', timeZone: 'UTC', skillLevel: 'beginner', bio: '', styles: ['mixed'], preferredGameDurationMinutes: 90, minimumNoticeMinutes: 120, activeForMatchmaking: true };
    const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (_input, init) => init?.method === 'PUT' ? new Response(JSON.stringify({ ...profile, displayName: 'Bia' }), { status: 200 }) : new Response(JSON.stringify(profile), { status: 200 }));
    renderApp('/profile');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Bia' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Bia' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/profile', expect.objectContaining({ method: 'PUT' }));
  });
});
