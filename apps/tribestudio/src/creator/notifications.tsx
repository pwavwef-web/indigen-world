import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CreatorNotification } from '@indigen-world/contracts/creator-models';
import { fetchMyNotifications, markNotificationRead } from './data';

/**
 * The creator's notifications, read once for the whole studio session: the
 * header bell, the overview and the notifications page share one request
 * instead of each fetching fifty documents.
 */
interface NotificationsState {
  items: CreatorNotification[];
  loading: boolean;
  failed: boolean;
  unread: number;
  retry: () => void;
  markRead: (notification: CreatorNotification) => Promise<void>;
}

const Context = createContext<NotificationsState | null>(null);

export function CreatorNotificationsProvider({ uid, children }: { uid?: string; children: ReactNode }) {
  const [items, setItems] = useState<CreatorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    void fetchMyNotifications(uid)
      .then((next) => { if (active) { setItems(next); setLoading(false); } })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [uid, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const markRead = useCallback(async (notification: CreatorNotification) => {
    if (notification.read) return;
    await markNotificationRead(notification);
    setItems((current) => current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
  }, []);

  const value = useMemo<NotificationsState>(() => ({
    items, loading, failed, retry, markRead, unread: items.filter((item) => !item.read).length,
  }), [items, loading, failed, retry, markRead]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCreatorNotifications(): NotificationsState {
  const value = useContext(Context);
  if (!value) throw new Error('useCreatorNotifications must be used inside the creator studio.');
  return value;
}
