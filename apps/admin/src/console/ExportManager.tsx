import { useState } from 'react';
import { fetchApplications, fetchCampaigns, fetchReviewQueue } from '../creators/data';
import { fetchPublicSubmissions } from '../interests/data';

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
    <div className="panel">
      <div className="tab-head">
        <div>
          <h2>Governed Data Export &amp; Research Exchange</h2>
          <p className="tiny muted">
            Generate permission-safe data packages for accredited educational institutions and research partners.
          </p>
        </div>
      </div>

      <div className="export-controls-card">
        <div className="export-settings-row">
          <label className="filter">
            Format:
            <select value={format} onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}>
              <option value="json">JSON (Structured Data)</option>
              <option value="csv">CSV (Spreadsheet)</option>
            </select>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeRestricted}
              onChange={(e) => setIncludeRestricted(e.target.checked)}
            />
            Include Restricted Cultural Permission records (Requires Elder Council Clearance)
          </label>
        </div>

        <div className="export-buttons-grid">
          <div className="export-card">
            <strong>Approved Creators Dataset</strong>
            <p className="tiny muted">Public profiles, dialect specialties, and membership credentials.</p>
            <button
              type="button"
              className="button button--primary button--small"
              disabled={exporting}
              onClick={() => void handleExport('creators')}
            >
              📥 Export Creators ({format.toUpperCase()})
            </button>
          </div>

          <div className="export-card">
            <strong>Campaigns &amp; Initiatives</strong>
            <p className="tiny muted">Governed bounty rules, categories, and initiative targets.</p>
            <button
              type="button"
              className="button button--primary button--small"
              disabled={exporting}
              onClick={() => void handleExport('campaigns')}
            >
              📥 Export Campaigns ({format.toUpperCase()})
            </button>
          </div>

          <div className="export-card">
            <strong>Validated Submissions</strong>
            <p className="tiny muted">Publicly licensed folklore, oral recordings metadata, and proverbs.</p>
            <button
              type="button"
              className="button button--primary button--small"
              disabled={exporting}
              onClick={() => void handleExport('submissions')}
            >
              📥 Export Submissions ({format.toUpperCase()})
            </button>
          </div>

          <div className="export-card">
            <strong>Submitted Interests (Get Involved)</strong>
            <p className="tiny muted">Community inquiries, volunteer registrations, and partner proposals.</p>
            <button
              type="button"
              className="button button--primary button--small"
              disabled={exporting}
              onClick={() => void handleExport('interests')}
            >
              📥 Export Interests ({format.toUpperCase()})
            </button>
          </div>
        </div>

        {exportStatus && <p className="notice notice--status">{exportStatus}</p>}
      </div>
    </div>
  );
}
