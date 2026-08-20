import { useEffect, useState } from 'react';
import type { CreatorNotification } from '@indigen-world/contracts/creator-models';
import { useAuth } from '../../auth';
import { fetchMyNotifications, markNotificationRead } from '../data';
import { EmptyState, Skeleton, WhatsAppCard } from '../components';

export function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CreatorNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void fetchMyNotifications(user.uid).then((n) => { setItems(n); setLoading(false); });
  }, [user]);

  const markRead = async (n: CreatorNotification) => {
    if (n.read) return;
    await markNotificationRead(n);
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  };

  if (loading) return <div className="page"><h1>Notifications</h1><Skeleton lines={5} /></div>;

  return (
    <div className="page">
      <header className="page__head"><h1>Notifications</h1></header>
      {items.length === 0 ? (
        <EmptyState title="No notifications yet" body="Application updates, campaign openings and review decisions will appear here." />
      ) : (
        <ul className="notif-list">
          {items.map((n) => (
            <li key={n.id} className={n.read ? 'notif' : 'notif notif--unread'}>
              <div>
                <strong>{n.title}</strong>
                {n.body ? <p className="muted">{n.body}</p> : null}
                <span className="tiny">{n.lifecycle.createdAt ? new Date(n.lifecycle.createdAt).toLocaleString() : ''}</span>
              </div>
              {!n.read ? (
                <button type="button" className="button button--ghost-dark button--small" onClick={() => void markRead(n)}>Mark read</button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <WhatsAppCard compact />
    </div>
  );
}
