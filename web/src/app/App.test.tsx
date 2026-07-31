import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('home screen', () => {
  it('shows foundation messaging and primary navigation', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: /beach volleyball/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/login');
  });
});

describe('login screen', () => {
  it('offers email account creation', async () => {
    const fetchMock = vi
      .spyOn(window, 'fetch')
      .mockRejectedValue(new Error('Stop before navigation.'));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/login']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Local Player' } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'local@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    const createButtons = screen.getAllByRole('button', { name: /^create account$/i });
    expect(createButtons).toHaveLength(2);
    const submitButton = createButtons[1];
    if (!submitButton) throw new Error('Create account submit button was not found.');
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/email/signup',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
