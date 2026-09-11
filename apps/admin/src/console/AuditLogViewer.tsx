import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuditLogs } from '../creators/data';

interface AuditReference {
  collection?: string;
  id?: string;
}

interface AuditLogEntry {
  id: string;
  occurredAt?: unknown;
  actor?: AuditReference | string;
  actorUid?: string;
  action?: string;
  target?: AuditReference;
  targetCollection?: string;
  targetId?: string;
  outcome?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

function referenceLabel(
  modern: AuditReference | string | undefined,
  legacyCollection?: string,
  legacyId?: string,
): string {
  if (typeof modern === 'string') return modern;
  const collection = modern?.collection ?? legacyCollection;
  const id = modern?.id ?? legacyId;
  return [collection, id].filter(Boolean).join(' / ') || '—';
}

function dateLabel(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'object' && value !== null) {
    if ('toDate' in value && typeof value.toDate === 'function') {
      return value.toDate().toLocaleString();
    }
    if ('seconds' in value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toLocaleString();
    }
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await fetchAuditLogs({ throwOnError: true }) as AuditLogEntry[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Audit records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(
    () => [...new Set(logs.map((log) => log.action).filter((action): action is string => Boolean(action)))].sort(),
    [logs],
  );
  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (filterAction !== 'ALL' && log.action !== filterAction) return false;
      if (!needle) return true;
      const actor = referenceLabel(log.actor, undefined, log.actorUid);
      const target = referenceLabel(log.target, log.targetCollection, log.targetId);
      return [log.action, log.outcome, actor, target]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
    });
  }, [filterAction, logs, search]);

  return (
    <div className="panel">
      <div className="tab-head audit-heading">
        <div>
          <p className="section-kicker">GOVERNANCE</p>
          <h1>Audit trail</h1>
          <p className="tiny muted">
            The latest 50 privileged actions, role changes and moderation decisions.
          </p>
        </div>
        <button type="button" className="button button--small" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="audit-controls">
        <label className="filter">
          Action type
          <select value={filterAction} onChange={(event) => setFilterAction(event.target.value)}>
            <option value="ALL">All actions ({logs.length})</option>
            {actions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </label>
        <label className="filter audit-search">
          Search actor, target or outcome
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. identity.set_role"
          />
        </label>
      </div>

      {error ? (
        <div className="dashboard-error" role="alert">
          <strong>Audit trail unavailable.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>Try again</button>
        </div>
      ) : loading && logs.length === 0 ? (
        <p className="muted">Loading audit records…</p>
      ) : filteredLogs.length === 0 ? (
        <p className="muted">No audit records match these filters.</p>
      ) : (
        <div className="audit-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Outcome</th>
                <th><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <tr key={log.id} className={isExpanded ? 'is-expanded' : ''}>
                    <td className="tiny">{dateLabel(log.occurredAt)}</td>
                    <td><code>{referenceLabel(log.actor, undefined, log.actorUid)}</code></td>
                    <td><span className="badge2 badge2--info">{log.action ?? 'unknown'}</span></td>
                    <td><code>{referenceLabel(log.target, log.targetCollection, log.targetId)}</code></td>
                    <td>{log.outcome ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="button button--small"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        {isExpanded ? 'Hide' : 'Inspect'}
                      </button>
                      {isExpanded ? (
                        <pre className="audit-json-box">{JSON.stringify(log, null, 2)}</pre>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
