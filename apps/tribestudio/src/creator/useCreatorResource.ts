import { useEffect, useState } from 'react';

/** Each section owns its request, error and retry; a failed section cannot hide another. */
export function useCreatorResource<T>(loader: (uid: string) => Promise<T>, uid?: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ uid?: string; data?: T; loading: boolean; failed: boolean }>({ loading: true, failed: false });
  useEffect(() => {
    if (!uid) return;
    let active = true;
    setState({ uid, loading: true, failed: false });
    void loader(uid).then(
      (data) => { if (active) setState({ uid, data, loading: false, failed: false }); },
      () => { if (active) setState({ uid, loading: false, failed: true }); },
    );
    return () => { active = false; };
  }, [uid, loader, attempt]);
  return {
    ...(state.uid === uid ? state : { data: undefined, loading: true, failed: false }),
    retry: () => setAttempt((value) => value + 1),
  };
}
