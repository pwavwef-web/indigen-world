import { useEffect, useState } from 'react';
import { fetchAuditLogs } from '../creators/data';

interface AuditLogEntry {
  id?: string;
  occurredAt?: string;
  timestamp?: string;
  actorUid?: string;
  actor?: string;
  action?: string;
  targetCollection?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void fetchAuditLogs()
      .then((l) => { setLogs(l as AuditLogEntry[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filteredLogs = logs.filter(
    (l) => filterAction === 'ALL' || l.action === filterAction
  );

  const actions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="panel">
      <div className="tab-head">
        <div>
          <h2>Append-Only Governance Audit Trail</h2>
          <p className="tiny muted">Chronological, tamper-evident record of privileged actions, status mutations, and role assignments.</p>
        </div>
        <label className="filter">
          Action Type:
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
            <option value="ALL">All Actions ({logs.length})</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading audit log entries…</p>
      ) : filteredLogs.length === 0 ? (
        <p className="muted">No audit log records found.</p>
      ) : (
        <div className="audit-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor UID</th>
                <th>Action</th>
                <th>Target Collection</th>
                <th>Target ID</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <tr key={log.id} className={isExpanded ? 'is-expanded' : ''}>
                    <td className="tiny">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                    <td><code>{log.actorUid || 'system'}</code></td>
                    <td><span className="badge2 badge2--info">{log.action}</span></td>
                    <td>{log.targetCollection || '—'}</td>
                    <td><code>{log.targetId || '—'}</code></td>
                    <td>
                      <button
                        type="button"
                        className="button button--small"
                        onClick={() => setExpandedId(isExpanded ? null : (log.id ?? 'entry'))}
                      >
                        {isExpanded ? '▲ Hide' : '▼ Diff'}
                      </button>
                      {isExpanded && (
                        <pre className="audit-json-box">
                          {JSON.stringify(log.metadata || log, null, 2)}
                        </pre>
                      )}
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
