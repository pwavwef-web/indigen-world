import './recovery.css';
import { useEffect, useRef, useState } from 'react';
import { draftKey, readDraft, writeDraft, type DraftEnvelope } from './store';

/** Local recovery is always an explicit choice. It never invokes a remote write. */
export function useRecovery<T>(uid: string, area: string, value: T, meaningful: boolean, restore: (value: T) => void, version = '') {
  const [recovery, setRecovery] = useState<DraftEnvelope<T> | null>(() => {
    try { return uid ? readDraft<T>(localStorage, uid, area) : null; } catch { return null; }
  });
  const [status, setStatus] = useState('');
  const latest = useRef({ value, meaningful, recovery, version, disabled: false });
  latest.current = { ...latest.current, value, meaningful, recovery, version };
  const persist = () => {
    const current = latest.current;
    if (!uid || current.recovery || current.disabled || !current.meaningful) return;
    try {
      writeDraft(localStorage, uid, area, current.value, current.version);
      setStatus('Saved on this device');
    } catch { setStatus('Draft recovery could not be saved. Keep this page open and retry.'); }
  };
  useEffect(() => { persist(); }, [value, meaningful, recovery, version]);
  useEffect(() => {
    const flush = () => persist();
    const discardOnSignOut = (event: Event) => { if ((event as CustomEvent).detail === uid) latest.current.disabled = true; };
    const changed = (event: StorageEvent) => {
      if (event.key !== draftKey(uid, area) || !event.newValue) return;
      try { const next = readDraft<T>(localStorage, uid, area); if (next) setRecovery(next); } catch { setStatus('Could not read the draft from another tab.'); }
    };
    window.addEventListener('pagehide', flush); window.addEventListener('studio:before-navigate', flush); window.addEventListener('storage', changed);
    window.addEventListener('studio:discard-drafts', discardOnSignOut);
    return () => { flush(); window.removeEventListener('pagehide', flush); window.removeEventListener('studio:before-navigate', flush); window.removeEventListener('storage', changed); window.removeEventListener('studio:discard-drafts', discardOnSignOut); };
  }, [uid, area]);
  const clear = () => {
    latest.current.disabled = true;
    try { localStorage.removeItem(draftKey(uid, area)); setStatus(''); } catch { setStatus('Could not remove the saved draft. Discard it before starting another.'); }
    latest.current.recovery = null; setRecovery(null);
  };
  return { recovery, status, conflict: Boolean(recovery && recovery.version !== version), persist, clear,
    continueDraft: () => { if (recovery) { restore(recovery.value); latest.current.disabled = false; latest.current.recovery = null; setRecovery(null); } },
    discard: () => { clear(); latest.current.disabled = false; },
    resumeSaving: () => { latest.current.disabled = false; },
  };
}

export function DraftRecovery({ draft }: { draft: { recovery: unknown; conflict: boolean; status: string; continueDraft: () => void; discard: () => void; persist: () => void } }) {
  return <div className="ts-panel ts-panel--tight draft-recovery">
    {draft.recovery ? <><p role="status"><strong>{draft.conflict ? 'The saved draft and current remote version differ.' : 'An unfinished draft is saved for this account.'}</strong> Continue to compare and edit it before saving. Nothing is submitted automatically. Unfinished file selections must be selected again; uploaded attachments keep their references.</p><div className="ts-cluster"><button type="button" className="ts-btn ts-btn--primary ts-btn--sm" onClick={draft.continueDraft}>Continue draft</button><button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" onClick={draft.discard}>Use current version / discard draft</button></div></> : <p role="status" aria-live="polite">{draft.status || 'Draft recovery is ready for this account.'}{draft.status.includes('could not') ? <button type="button" className="ts-btn ts-btn--sm" onClick={draft.persist}>Retry saving recovery</button> : null}</p>}
  </div>;
}
