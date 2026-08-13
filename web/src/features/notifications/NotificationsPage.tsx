import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { notificationApi, type Notification } from '../../api/client';
import { formatDate, notificationMessage } from '../../i18n/pt-BR';
import { useOnlineStatus } from '../../platform/useOnlineStatus';
import { notifyNotificationsChanged } from './notificationEvents';

function internalActionUrl(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState('');
  const isOnline = useOnlineStatus();

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const result = await notificationApi.list(nextPage);
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setUnread(result.unreadCount);
      setHasMore(result.hasMore);
      setPage(result.page);
    } catch {
      setError('Não foi possível carregar as notificações. Tente novamente.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const read = async (id: string) => {
    if (!isOnline) {
      setError('Você está offline. Conecte-se para atualizar os avisos.');
      return;
    }
    const item = items.find((candidate) => candidate.id === id);
    if (!item || item.readAt) return;
    setBusyId(id);
    setError('');
    try {
      await notificationApi.markRead(id);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === id ? { ...candidate, readAt: new Date().toISOString() } : candidate,
        ),
      );
      setUnread((current) => Math.max(0, current - 1));
      notifyNotificationsChanged();
    } catch {
      setError('Não foi possível marcar esta notificação como lida. Tente novamente.');
    } finally {
      setBusyId(null);
    }
  };

  const readAll = async () => {
    if (unread === 0 || !isOnline) {
      if (!isOnline) setError('Você está offline. Conecte-se para atualizar os avisos.');
      return;
    }
    setMarkingAll(true);
    setError('');
    try {
      await notificationApi.markAllRead();
      setItems((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      );
      setUnread(0);
      notifyNotificationsChanged();
    } catch {
      setError('Não foi possível marcar as notificações como lidas. Tente novamente.');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <main className="shell">
      <Link className="text-link" to="/dashboard">
        ← Painel
      </Link>
      <p className="eyebrow">Notificações</p>
      <h1>Fique por dentro.</h1>
      {!isOnline && (
        <p className="hint">Você está offline. Os avisos podem estar desatualizados.</p>
      )}
      {error && (
        <div className="feedback-error" role="alert">
          <p className="error">{error}</p>
          <button className="text-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Carregando notificações...</p>
      ) : (
        <>
          <div className="actions">
            <span>
              {unread} não lida{unread === 1 ? '' : 's'}
            </span>
            <button
              className="text-button"
              type="button"
              onClick={() => void readAll()}
              disabled={unread === 0 || markingAll || !isOnline}
            >
              {markingAll ? 'Marcando...' : 'Marcar todas como lidas'}
            </button>
          </div>
          {items.length === 0 ? (
            <section className="card empty-state">
              <h2>Nenhuma notificação ainda.</h2>
              <p className="hint">Propostas, confirmações e lembretes aparecerão aqui.</p>
            </section>
          ) : (
            <section className="choice-list" aria-label="Lista de notificações">
              {items.map((item) => {
                const actionUrl = internalActionUrl(item.actionUrl);
                return (
                  <article className={item.readAt ? 'card' : 'card selected'} key={item.id}>
                    <h2>{notificationMessage(item.type)?.title ?? item.title}</h2>
                    <p>{notificationMessage(item.type)?.body ?? item.body}</p>
                    <small>
                      {formatDate(item.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                    </small>
                    {actionUrl && (
                      <p>
                        <Link className="text-link" to={actionUrl}>
                          Abrir
                        </Link>
                      </p>
                    )}
                    {!item.readAt && (
                      <button
                        className="text-button"
                        type="button"
                        disabled={busyId === item.id || !isOnline}
                        onClick={() => void read(item.id)}
                      >
                        {busyId === item.id ? 'Marcando...' : 'Marcar como lida'}
                      </button>
                    )}
                  </article>
                );
              })}
            </section>
          )}
          {hasMore && (
            <button
              className="button load-more-button"
              type="button"
              disabled={loadingMore}
              onClick={() => void load(page + 1, true)}
            >
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </button>
          )}
        </>
      )}
    </main>
  );
}
