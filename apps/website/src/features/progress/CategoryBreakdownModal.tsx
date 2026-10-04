/**
 * src/features/progress/CategoryBreakdownModal.tsx
 *
 * Detailed modal inspector showing sub-category distributions,
 * linguistic parts of speech, and dialect breakdowns without merging.
 */

import { ProgressDialog } from './ProgressDialog';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import type { CategoryProgress } from './progressTypes';

interface CategoryBreakdownModalProps {
  progress: CategoryProgress | null;
  fixtureMode?: boolean;
  onClose: () => void;
}

export function CategoryBreakdownModal({ progress, fixtureMode = false, onClose }: CategoryBreakdownModalProps) {
  if (!progress) return null;

  const { category, approvedCount, target, percentage } = progress;

  return (
    <ProgressDialog labelledBy="breakdown-title" onClose={onClose}>
      <div className="progress-modal-card">
        <div className="progress-modal-header">
          <div className="progress-modal-title-group">
            <Icon name={category.iconName} size={20} />
            <h3 id="breakdown-title">{category.title} details</h3>
          </div>
          <button
            type="button"
            className="progress-modal-close"
            onClick={onClose}
            aria-label="Close composition drawer"
          >
            &times;
          </button>
        </div>

        <div className="progress-modal-body">
          <p className="tiny muted">{category.description}</p>

          <div className="breakdown-stats-summary">
            <div className="breakdown-stat-pill">
              <span className="tiny muted">{fixtureMode ? 'Sample records' : 'Approved records'}</span>
              <strong>{approvedCount.toLocaleString()} {category.unitPlural}</strong>
            </div>
            <div className="breakdown-stat-pill">
              <span className="tiny muted">Launch Target</span>
              <strong>{target ? `${target.toLocaleString()} ${category.unitPlural}` : 'Target being set'}</strong>
            </div>
            {percentage !== null && (
              <div className="breakdown-stat-pill">
                <span className="tiny muted">Current Progress</span>
                <strong>{percentage}%</strong>
              </div>
            )}
          </div>

          <h4 className="breakdown-section-heading">What counts?</h4>
          <p>{category.explanation}</p>
          <h4 className="breakdown-section-heading">How you can help</h4>
          <p>{category.activeQueuePrompt.taskLabel}. Add context and attribution in TribeStudio so a reviewer can check your contribution.</p>
          {fixtureMode && <p className="tiny muted">Illustrative prompt: {category.activeQueuePrompt.promptText}</p>}
          {fixtureMode && <>
          <h4 className="breakdown-section-heading">Illustrative sub-category breakdown</h4>
          <p className="tiny muted">These sample distributions demonstrate the interface; they are not verified live category totals.</p>
          <div className="breakdown-list">
            {category.breakdowns.map((item) => (
              <div key={item.label} className="breakdown-row">
                <div className="breakdown-row__info">
                  <span className="breakdown-row__label">{item.label}</span>
                  <span className="breakdown-row__count">{item.count} items ({item.percentage}%)</span>
                </div>
                <div className="breakdown-row__bar-track" aria-hidden="true">
                  <div
                    className="breakdown-row__bar-fill"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: category.culturalPalette.primary,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          </>}

          <div className="callout callout--sand" style={{ marginTop: '1.25rem' }}>
            <span className="tiny">
              <strong>Honest Categorization:</strong> We never artificially split sentences into words or merge proverbs into general sayings to inflate counts.
            </span>
          </div>
        </div>

        <div className="progress-modal-footer">
          <Button href={category.ctaUrl} external>
            {category.ctaLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ProgressDialog>
  );
}
