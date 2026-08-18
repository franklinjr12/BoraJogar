import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, gameApi, type GameChatMessage } from '../../api/client';
import { formatDate } from '../../i18n/pt-BR';

const maxMessageLength = 2000;
const pollingIntervalMs = 10_000;
const nearBottomThreshold = 80;

interface GameChatProps {
  gameId: string;
  isOnline: boolean;
  canSend: boolean;
}

function messageOrder(left: GameChatMessage, right: GameChatMessage) {
  const createdAt = left.createdAt.localeCompare(right.createdAt);
  return createdAt !== 0 ? createdAt : left.id.localeCompare(right.id);
}

function mergeMessages(current: GameChatMessage[], incoming: GameChatMessage[]) {
  const byID = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byID.set(message.id, message);
  return [...byID.values()].sort(messageOrder);
}

export function GameChat({ gameId, isOnline, canSend }: GameChatProps) {
  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [newMessages, setNewMessages] = useState(0);
  const messagesRef = useRef<GameChatMessage[]>([]);
  const loadingMoreRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const updateMessages = useCallback((next: GameChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, []);

  const isNearBottom = useCallback(() => {
    const list = listRef.current;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= nearBottomThreshold;
  }, []);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await gameApi.chat(gameId);
      const next = mergeMessages([], result.items);
      updateMessages(next);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setNewMessages(0);
      window.requestAnimationFrame(scrollToBottom);
    } catch {
      setError('Não foi possível carregar o chat da partida.');
    } finally {
      setLoading(false);
    }
  }, [gameId, scrollToBottom, updateMessages]);

  useEffect(() => {
    messagesRef.current = [];
    setMessages([]);
    setNextCursor(null);
    setHasMore(false);
    void loadLatest();
  }, [gameId, loadLatest]);

  useEffect(() => {
    if (!isOnline) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const result = await gameApi.chat(gameId);
        if (!active) return;
        const current = messagesRef.current;
        const known = new Set(current.map((message) => message.id));
        const added = result.items.filter((message) => !known.has(message.id));
        if (added.length === 0) return;
        const stickToBottom = isNearBottom();
        updateMessages(mergeMessages(current, result.items));
        if (stickToBottom) {
          setNewMessages(0);
          window.requestAnimationFrame(scrollToBottom);
        } else {
          setNewMessages((count) => count + added.length);
        }
      } catch {
        // Keep existing chat visible when background refresh fails.
      }
    };
    const interval = window.setInterval(() => void poll(), pollingIntervalMs);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [gameId, isNearBottom, isOnline, scrollToBottom, updateMessages]);

  const loadOlder = async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    const list = listRef.current;
    const previousHeight = list?.scrollHeight ?? 0;
    const previousTop = list?.scrollTop ?? 0;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError('');
    try {
      const result = await gameApi.chat(gameId, nextCursor);
      updateMessages(mergeMessages(result.items, messagesRef.current));
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      window.requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight - previousHeight + previousTop;
        }
      });
    } catch {
      setError('Não foi possível carregar mensagens anteriores.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const handleScroll = () => {
    const list = listRef.current;
    if (list && list.scrollTop <= 48 && hasMore && !loadingMore) void loadOlder();
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length < 1 || trimmed.length > maxMessageLength) {
      setFormError('A mensagem deve ter entre 1 e 2.000 caracteres.');
      return;
    }
    if (!canSend) {
      setFormError('O chat desta partida foi encerrado.');
      return;
    }
    if (!isOnline) {
      setFormError('Você está offline. Conecte-se para enviar mensagens.');
      return;
    }
    setSending(true);
    setFormError('');
    setError('');
    try {
      const message = await gameApi.sendChatMessage(gameId, trimmed);
      updateMessages(mergeMessages(messagesRef.current, [message]));
      setBody('');
      setNewMessages(0);
      window.requestAnimationFrame(scrollToBottom);
    } catch (cause: unknown) {
      setFormError(
        cause instanceof ApiError ? cause.message : 'Não foi possível enviar a mensagem.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="game-chat inline-panel" aria-label="Chat da partida">
      <h2>Chat da partida</h2>
      <p className="hint">Combine detalhes do jogo com quem vai participar.</p>
      {loading ? (
        <p role="status">Carregando chat...</p>
      ) : error && messages.length === 0 ? (
        <div className="feedback-error" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={() => void loadLatest()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div
            className="game-chat-list"
            ref={listRef}
            onScroll={handleScroll}
            aria-label="Mensagens do chat"
          >
            {loadingMore && (
              <p className="game-chat-loading" role="status">
                Carregando mensagens anteriores...
              </p>
            )}
            {messages.length === 0 ? (
              <p className="hint">Nenhuma mensagem ainda. Comece a conversa.</p>
            ) : (
              messages.map((message) => (
                <article className="game-chat-message" key={message.id}>
                  <p>{message.body}</p>
                  <footer>
                    <strong>{message.displayName}</strong> ·{' '}
                    {formatDate(message.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                  </footer>
                </article>
              ))
            )}
          </div>
          {newMessages > 0 && (
            <button
              className="text-button game-chat-new"
              type="button"
              onClick={() => {
                setNewMessages(0);
                scrollToBottom();
              }}
            >
              {newMessages} nova{newMessages === 1 ? '' : 's'} mensagem
              {newMessages === 1 ? '' : 's'}
            </button>
          )}
          <form className="game-chat-form" onSubmit={sendMessage}>
            <label htmlFor="game-chat-body">Nova mensagem</label>
            {!canSend && <p className="hint">O chat está fechado para novas mensagens.</p>}
            <textarea
              id="game-chat-body"
              value={body}
              maxLength={maxMessageLength}
              rows={3}
              onChange={(event) => {
                setBody(event.target.value);
                if (formError) setFormError('');
              }}
              disabled={sending || !isOnline || !canSend}
            />
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button className="button" type="submit" disabled={sending || !isOnline || !canSend}>
              {sending ? 'Enviando...' : 'Enviar mensagem'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
