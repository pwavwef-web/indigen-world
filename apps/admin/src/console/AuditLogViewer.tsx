import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuditLogs } from '../creators/data';
import { DataTable, type DataColumn } from '../ui/DataTable';
import {
  CopyId,
  PageHeader,
  Panel,
  SegmentedControl,
  Spinner,
  StatusPill,
  toneForStatus,
} from '../ui/primitives';

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

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null) {
    if ('toDate' in value && typeof value.toDate === 'function') return value.toDate() as Date;
    if ('seconds' in value && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value: unknown): string {
  const date = toDate(value);
  if (date) return date.toLocaleString();
  return value ? String(value) : '—';
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'ok' | 'other'>('ALL');
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

  // The action and outcome filters narrow the set; free-text search over that
  // set is the table's own job.
  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (filterAction !== 'ALL' && log.action !== filterAction) return false;
        if (outcomeFilter === 'ALL') return true;
        const succeeded = /^(ok|success|granted|approved|applied)/i.test(String(log.outcome ?? ''));
        return outcomeFilter === 'ok' ? succeeded : !succeeded;
      }),
    [filterAction, logs, outcomeFilter],
  );

  const columns: DataColumn<AuditLogEntry>[] = useMemo(
    () => [
      {
        id: 'when',
        header: 'When',
        width: '180px',
        mono: true,
        cell: (log) => dateLabel(log.occurredAt),
        sort: (log) => toDate(log.occurredAt),
        search: (log) => dateLabel(log.occurredAt),
      },
      {
        id: 'actor',
        header: 'Actor',
        cell: (log) => <CopyId value={referenceLabel(log.actor, undefined, log.actorUid)} label="actor" truncate={24} />,
        sort: (log) => referenceLabel(log.actor, undefined, log.actorUid),
        search: (log) => referenceLabel(log.actor, undefined, log.actorUid),
      },
      {
        id: 'action',
        header: 'Action',
        cell: (log) => <span className="badge2 badge2--info">{log.action ?? 'unknown'}</span>,
        sort: (log) => log.action ?? '',
        search: (log) => log.action ?? '',
      },
      {
        id: 'target',
        header: 'Target',
        cell: (log) => <CopyId value={referenceLabel(log.target, log.targetCollection, log.targetId)} label="target" truncate={28} />,
        sort: (log) => referenceLabel(log.target, log.targetCollection, log.targetId),
        search: (log) => referenceLabel(log.target, log.targetCollection, log.targetId),
      },
      {
        id: 'outcome',
        header: 'Outcome',
        cell: (log) =>
          log.outcome ? <StatusPill tone={toneForStatus(log.outcome)}>{log.outcome}</StatusPill> : <span className="muted">—</span>,
        sort: (log) => log.outcome ?? '',
        search: (log) => log.outcome ?? '',
      },
      {
        id: 'inspect',
        header: 'Record',
        align: 'end',
        cell: (log) => (
          <button
            type="button"
            className="button button--small"
            aria-expanded={expandedId === log.id}
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          >
            {expandedId === log.id ? 'Hide' : 'Inspect'}
          </button>
        ),
      },
    ],
    [expandedId],
  );

  return (
    <Panel>
      <PageHeader
        level="h1"
        kicker="Governance"
        title="Audit trail"
        body="The latest 50 privileged actions, role changes and moderation decisions, exactly as the append-only log recorded them."
        actions={
          <button type="button" className="button button--small" onClick={() => void load()} disabled={loading}>
            {loading ? <><Spinner /> Refreshing…</> : 'Refresh'}
          </button>
        }
      />

      <DataTable
        caption="Audit records"
        columns={columns}
        rows={filteredLogs}
        rowKey={(log) => log.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        searchable
        searchPlaceholder="Search actor, target or outcome…"
        initialSort={{ columnId: 'when', direction: 'desc' }}
        pageSize={20}
        expandedId={expandedId}
        renderDetail={(log) => <pre className="audit-json-box">{JSON.stringify(log, null, 2)}</pre>}
        empty={{
          title: 'No audit records match these filters',
          body: 'Privileged actions appear here within moments of being recorded.',
        }}
        filters={
          <>
            <label className="filter">
              <span className="sr-only">Action type</span>
              <select value={filterAction} onChange={(event) => setFilterAction(event.target.value)}>
                <option value="ALL">All actions ({logs.length})</option>
                {actions.map((action) => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </label>
            <SegmentedControl
              label="Filter by outcome"
              value={outcomeFilter}
              onChange={setOutcomeFilter}
              options={[
                { id: 'ALL', label: 'All' },
                { id: 'ok', label: 'Succeeded' },
                { id: 'other', label: 'Other' },
              ]}
            />
          </>
        }
      />
    </Panel>
  );
}
