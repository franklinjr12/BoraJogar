import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { notificationApi, type Notification } from '../../api/client';
import { formatDate, notificationMessage } from '../../i18n/pt-BR';

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    notificationApi
      .list()
      .then((page) => {
        setItems(page.items);
        setUnread(page.unreadCount);
      })
      .catch(() => setError('Não foi possível carregar as notificações.'));
  }, []);
  const read = async (id: string) => {
    await notificationApi.markRead(id);
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
    setUnread((current) => Math.max(0, current - 1));
  };
  const readAll = async () => {
    await notificationApi.markAllRead();
    setItems((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
  };
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Início
      </Link>
      <p className="eyebrow">Notificações</p>
      <h1>Fique por dentro.</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <span>
          {unread} não lida{unread === 1 ? '' : 's'}
        </span>
        <button className="text-button" onClick={readAll} disabled={unread === 0}>
          Marcar todas como lidas
        </button>
      </div>
      {items.length === 0 ? (
        <section className="card">
          <p>Nenhuma notificação ainda.</p>
        </section>
      ) : (
        <section className="choice-list">
          {items.map((item) => (
            <article className={item.readAt ? 'card' : 'card selected'} key={item.id}>
              <h2>{notificationMessage(item.type)?.title ?? item.title}</h2>
              <p>{notificationMessage(item.type)?.body ?? item.body}</p>
              <small>
                {formatDate(item.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
              </small>
              {item.actionUrl && (
                <p>
                  <Link className="text-link" to={item.actionUrl}>
                    Abrir
                  </Link>
                </p>
              )}
              {!item.readAt && (
                <button className="text-button" onClick={() => read(item.id)}>
                  Marcar como lida
                </button>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
