export interface DraftEnvelope<T> { schema: 1; owner: string; version: string; savedAt: number; value: T }
export function draftKey(uid: string, area: string): string {
  if (!uid) throw new Error('Sign in before keeping a draft.');
  return `tribestudio:recovery:v1:${encodeURIComponent(uid)}:${encodeURIComponent(area)}`;
}
export function readDraft<T>(storage: Storage, uid: string, area: string): DraftEnvelope<T> | null {
  const raw = storage.getItem(draftKey(uid, area));
  if (!raw) return null;
  const record = JSON.parse(raw) as DraftEnvelope<T>;
  return record && typeof record === 'object' && record.schema === 1 && record.owner === uid && Number.isFinite(record.savedAt)
    && typeof record.version === 'string' && record.value && typeof record.value === 'object' ? record : null;
}
export function writeDraft<T>(storage: Storage, uid: string, area: string, value: T, version: string): DraftEnvelope<T> {
  const record: DraftEnvelope<T> = { schema: 1, owner: uid, version, savedAt: Date.now(), value };
  storage.setItem(draftKey(uid, area), JSON.stringify(record));
  return record;
}
