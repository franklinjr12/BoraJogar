import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { notificationApi, type Notification } from '../../api/client';

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
      .catch(() => setError('Could not load notifications.'));
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
        ← Home
      </Link>
      <p className="eyebrow">Notifications</p>
      <h1>Stay in the loop.</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <span>{unread} unread</span>
        <button className="text-button" onClick={readAll} disabled={unread === 0}>
          Mark all as read
        </button>
      </div>
      {items.length === 0 ? (
        <section className="card">
          <p>No notifications yet.</p>
        </section>
      ) : (
        <section className="choice-list">
          {items.map((item) => (
            <article className={item.readAt ? 'card' : 'card selected'} key={item.id}>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
              {item.actionUrl && (
                <p>
                  <Link className="text-link" to={item.actionUrl}>
                    Open
                  </Link>
                </p>
              )}
              {!item.readAt && (
                <button className="text-button" onClick={() => read(item.id)}>
                  Mark as read
                </button>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
