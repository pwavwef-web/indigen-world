/**
 * src/features/progress/ProgressDataTable.tsx
 *
 * High-contrast, screen-reader-optimized data table mode for launch progress.
 * Provides accessible sorting, granular numeric transparency, keyboard shortcuts,
 * and direct contribution actions.
 */

import { useState } from 'react';
import type { CategoryProgress } from './progressTypes';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { playSampleAudioPreview } from './progressAudio';

interface ProgressDataTableProps {
  categories: CategoryProgress[];
  onOpenBreakdown?: (progress: CategoryProgress) => void;
  onOpenShare?: (progress: CategoryProgress) => void;
  onOpenAudit?: (progress: CategoryProgress) => void;
  onOpenPledge?: (progress: CategoryProgress) => void;
}

type SortField = 'title' | 'approved' | 'percentage' | 'velocity';

export function ProgressDataTable({
  categories,
  onOpenBreakdown,
  onOpenShare,
  onOpenAudit,
  onOpenPledge,
}: ProgressDataTableProps) {
  const [sortField, setSortField] = useState<SortField>('percentage');
  const [sortAsc, setSortAsc] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handlePlaySample = (item: CategoryProgress) => {
    setPlayingId(item.category.id);
    playSampleAudioPreview(item.category.sampleAudioType || 'word');
    setTimeout(() => setPlayingId(null), 1200);
  };

  const sortedCategories = [...categories].sort((a, b) => {
    let diff = 0;
    switch (sortField) {
      case 'title':
        diff = a.category.title.localeCompare(b.category.title);
        break;
      case 'approved':
        diff = a.approvedCount - b.approvedCount;
        break;
      case 'percentage':
        diff = (a.percentage ?? -1) - (b.percentage ?? -1);
        break;
      case 'velocity':
        diff = a.velocityWeek - b.velocityWeek;
        break;
    }
    return sortAsc ? diff : -diff;
  });

  return (
    <div className="progress-table-container" role="region" aria-label="Launch progress data table">
      <div className="table-controls-hint">
        <span className="tiny muted">
          Tip: Press <code>Alt+T</code> anytime to switch to this accessible tabular view. Click headers to sort.
        </span>
      </div>

      <table className="progress-data-table">
        <caption className="sr-only">Verified Indigen World Launch Progress by Category</caption>
        <thead>
          <tr>
            <th scope="col" onClick={() => handleSort('title')} className="sortable-th">
              Category {sortField === 'title' ? (sortAsc ? '▲' : '▼') : ''}
            </th>
            <th scope="col" onClick={() => handleSort('approved')} className="sortable-th">
              Approved {sortField === 'approved' ? (sortAsc ? '▲' : '▼') : ''}
            </th>
            <th scope="col">Review Queue</th>
            <th scope="col">Target</th>
            <th scope="col" onClick={() => handleSort('percentage')} className="sortable-th">
              % Full {sortField === 'percentage' ? (sortAsc ? '▲' : '▼') : ''}
            </th>
            <th scope="col" onClick={() => handleSort('velocity')} className="sortable-th">
              Velocity {sortField === 'velocity' ? (sortAsc ? '▲' : '▼') : ''}
            </th>
            <th scope="col">Pledges</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedCategories.map((item) => {
            const { category, approvedCount, awaitingReviewCount, target, percentage, velocityWeek, pledgeCount } = item;
            return (
              <tr key={category.id} className={item.needsContributions ? 'row--highlight' : ''}>
                <th scope="row" className="category-cell">
                  <div className="category-cell__content">
                    <span className="category-dot" style={{ backgroundColor: category.culturalPalette.primary }} />
                    <div>
                      <strong>{category.title}</strong>
                      <span className="tiny muted d-block">{category.shortLabel}</span>
                    </div>
                  </div>
                </th>
                <td>
                  <strong>{approvedCount.toLocaleString()}</strong> {category.unitPlural}
                </td>
                <td>
                  {awaitingReviewCount ? (
                    <span className="status-tag status-tag--pending">+{awaitingReviewCount} pending</span>
                  ) : (
                    <span className="tiny muted">—</span>
                  )}
                </td>
                <td>
                  {target ? (
                    `${target.toLocaleString()} ${category.unitPlural}`
                  ) : (
                    <span className="status-tag status-tag--setting">Being set</span>
                  )}
                </td>
                <td>
                  {percentage !== null ? (
                    <div className="table-progress-cell">
                      <div className="table-progress-track" aria-hidden="true">
                        <div
                          className="table-progress-fill"
                          style={{
                            width: `${Math.min(100, percentage)}%`,
                            backgroundColor: category.culturalPalette.primary,
                          }}
                        />
                      </div>
                      <span className="table-progress-num">{percentage}%</span>
                    </div>
                  ) : (
                    <span className="tiny muted">—</span>
                  )}
                </td>
                <td>
                  {velocityWeek > 0 ? (
                    <span className="velocity-tag">+{velocityWeek}/wk</span>
                  ) : (
                    <span className="tiny muted">0</span>
                  )}
                </td>
                <td>
                  <span className="tiny">{pledgeCount} pledged</span>
                </td>
                <td className="table-actions-cell">
                  <div className="table-actions-group">
                    {category.hasAudioSample && (
                      <button
                        type="button"
                        className="control-toggle-btn control-toggle-btn--sm"
                        onClick={() => handlePlaySample(item)}
                        title={`Listen to sample ${category.sampleAudioLabel}`}
                        aria-label={`Listen to sample audio for ${category.title}`}
                      >
                        <Icon name="volume" size={12} />
                        {playingId === category.id ? 'Playing…' : 'Sample'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="control-toggle-btn control-toggle-btn--sm"
                      onClick={() => onOpenBreakdown?.(item)}
                      title="Inspect composition breakdown"
                    >
                      Breakdown
                    </button>
                    <button
                      type="button"
                      className="control-toggle-btn control-toggle-btn--sm"
                      onClick={() => onOpenPledge?.(item)}
                      title="Pledge contributions"
                    >
                      Pledge
                    </button>
                    <button
                      type="button"
                      className="control-toggle-btn control-toggle-btn--sm"
                      onClick={() => onOpenShare?.(item)}
                      title="Share progress"
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      className="control-toggle-btn control-toggle-btn--sm"
                      onClick={() => onOpenAudit?.(item)}
                      title="Inspect query math"
                    >
                      Audit
                    </button>
                    <Button href={category.ctaUrl} external variant="secondary">
                      {category.ctaLabel}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
