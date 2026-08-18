import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameChat } from './GameChat';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const firstMessage = {
  id: 'message-1',
  gameId: 'game-1',
  userId: 'user-1',
  displayName: 'Ana',
  body: 'Bring a net',
  createdAt: '2026-08-18T12:00:00Z',
};

function page(items: (typeof firstMessage)[], overrides: Record<string, unknown> = {}) {
  return {
    items,
    hasMore: false,
    nextCursor: null,
    pageSize: 20,
    ...overrides,
  };
}

describe('GameChat', () => {
  it('loads latest messages and sends a new message', async () => {
    const sentMessage = {
      ...firstMessage,
      id: 'message-2',
      userId: 'user-2',
      body: 'I will be late 5 minutes',
    };
    const fetchMock = vi.fn((...args: [string, RequestInit?]) => {
      const init = args[1];
      return init?.method === 'POST'
        ? Promise.resolve(new Response(JSON.stringify(sentMessage), { status: 201 }))
        : Promise.resolve(new Response(JSON.stringify(page([firstMessage])), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GameChat gameId="game-1" isOnline canSend />);

    expect(await screen.findByText('Bring a net')).toBeInTheDocument();
    const input = screen.getByLabelText('Nova mensagem');
    fireEvent.change(input, { target: { value: sentMessage.body } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    expect(await screen.findByText(sentMessage.body)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/games/game-1/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: sentMessage.body }),
      }),
    );
  });

  it('loads older messages in batches and shows loading state', async () => {
    let resolveOlder: ((value: Response) => void) | undefined;
    const olderMessage = { ...firstMessage, id: 'message-0', body: 'Older detail' };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('before=')) {
        return new Promise<Response>((resolve) => {
          resolveOlder = resolve;
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(page([firstMessage], { hasMore: true, nextCursor: 'cursor-1' })),
          {
            status: 200,
          },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GameChat gameId="game-1" isOnline canSend />);
    const list = await screen.findByLabelText('Mensagens do chat');
    fireEvent.scroll(list);

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando mensagens anteriores');
    resolveOlder?.(new Response(JSON.stringify(page([olderMessage])), { status: 200 }));

    expect(await screen.findByText('Older detail')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/games/game-1/chat?before=cursor-1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejects empty messages and disables sending while offline', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(page([])), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<GameChat gameId="game-1" isOnline canSend />);
    await screen.findByText('Nenhuma mensagem ainda. Comece a conversa.');
    const input = screen.getByLabelText('Nova mensagem');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('entre 1 e 2.000 caracteres');

    cleanup();
    render(<GameChat gameId="game-1" isOnline={false} canSend />);
    await screen.findByText('Nenhuma mensagem ainda. Comece a conversa.');
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
