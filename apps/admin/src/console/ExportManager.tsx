import { useState } from 'react';
import { fetchApplications, fetchCampaigns, fetchReviewQueue } from '../creators/data';
import { fetchPublicSubmissions } from '../interests/data';
import { Alert, PageHeader, Panel, SegmentedControl, Spinner } from '@indigen-world/console-ui';

const DATASETS = [
  {
    id: 'creators' as const,
    title: 'Approved creators',
    body: 'Public profiles, dialect specialities and membership credentials.',
  },
  {
    id: 'campaigns' as const,
    title: 'Campaigns & initiatives',
    body: 'Governed bounty rules, categories and initiative targets.',
  },
  {
    id: 'submissions' as const,
    title: 'Validated submissions',
    body: 'Publicly licensed folklore, oral recording metadata and proverbs.',
  },
  {
    id: 'interests' as const,
    title: 'Submitted interests',
    body: 'Community enquiries, volunteer registrations and partner proposals.',
  },
];

export function ExportManager() {
  const [exporting, setExporting] = useState(false);
  const [includeRestricted, setIncludeRestricted] = useState(false);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const handleExport = async (dataset: 'creators' | 'campaigns' | 'submissions' | 'interests') => {
    setExporting(true);
    setExportStatus(`Preparing governed export for ${dataset}…`);
    try {
      let data: unknown[] = [];
      if (dataset === 'creators') data = await fetchApplications('APPROVED');
      else if (dataset === 'campaigns') data = await fetchCampaigns();
      else if (dataset === 'submissions') data = await fetchReviewQueue();
      else if (dataset === 'interests') data = await fetchPublicSubmissions('get-involved');

      // Enforce cultural permission safety: strip restricted / sacred fields unless explicitly governed
      const safeData = data.map((item) => {
        const record = { ...(item as Record<string, unknown>) };
        if (!includeRestricted) {
          delete record.sacredMetadata;
          delete record.privateNotes;
        }
        return record;
      });

      let blob: Blob;
      let filename = `indigen-world-${dataset}-governed-export.${format}`;

      if (format === 'json') {
        blob = new Blob([JSON.stringify(safeData, null, 2)], { type: 'application/json' });
      } else {
        // Convert to CSV
        if (safeData.length === 0) {
          blob = new Blob(['No records found'], { type: 'text/csv' });
        } else {
          const keys = Object.keys(safeData[0] as object);
          const csvLines = [
            keys.join(','),
            ...safeData.map((row) =>
              keys
                .map((k) => {
                  const val = (row as Record<string, unknown>)[k];
                  return typeof val === 'object'
                    ? `"${JSON.stringify(val).replace(/"/g, '""')}"`
                    : `"${String(val ?? '').replace(/"/g, '""')}"`;
                })
                .join(',')
            ),
          ];
          blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
        }
      }

      const link = document.createElement('a');
      link.download = filename;
      link.href = URL.createObjectURL(blob);
      link.click();

      setExportStatus(`✓ Exported ${safeData.length} records safely as ${format.toUpperCase()}.`);
    } catch (err) {
      setExportStatus(`Export failed: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Panel>
      <PageHeader
        level="h1"
        kicker="Governance"
        title="Governed data export"
        body="Permission-safe data packages for accredited institutions and research partners. Restricted cultural records are stripped unless an Elder Council clearance is recorded against this export."
        actions={
          <SegmentedControl
            label="Export format"
            value={format}
            onChange={setFormat}
            options={[
              { id: 'json', label: 'JSON' },
              { id: 'csv', label: 'CSV' },
            ]}
          />
        }
      />

      <div className="export-controls-card">
        <div className="export-settings-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeRestricted}
              onChange={(e) => setIncludeRestricted(e.target.checked)}
            />
            Include restricted cultural-permission records (requires Elder Council clearance)
          </label>
        </div>

        {includeRestricted ? (
          <Alert tone="warning" title="Restricted records will be included.">
            Sacred metadata and private notes travel with this package. Only send it where a
            recorded clearance covers it.
          </Alert>
        ) : null}

        <div className="export-buttons-grid">
          {DATASETS.map((dataset) => (
            <div className="export-card" key={dataset.id}>
              <strong>{dataset.title}</strong>
              <p className="tiny muted">{dataset.body}</p>
              <button
                type="button"
                className="button button--primary button--small"
                disabled={exporting}
                onClick={() => void handleExport(dataset.id)}
              >
                {exporting ? <Spinner /> : null}
                Export as {format.toUpperCase()}
              </button>
            </div>
          ))}
        </div>

        {exportStatus ? <p className="notice notice--status" role="status">{exportStatus}</p> : null}
      </div>
    </Panel>
  );
}
