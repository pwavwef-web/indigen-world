/**
 * src/features/progress/CategoryBreakdownModal.tsx
 *
 * Detailed modal inspector showing sub-category distributions,
 * linguistic parts of speech, and dialect breakdowns without merging.
 */

import { ProgressDialog } from './ProgressDialog';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { formatCount, formatPercent } from './progressFormat';
import type { CategoryProgress } from './progressTypes';

interface CategoryBreakdownModalProps {
  progress: CategoryProgress | null;
  fixtureMode?: boolean;
  onClose: () => void;
  onOpenPledge?: (progress: CategoryProgress) => void;
  onOpenShare?: (progress: CategoryProgress) => void;
  onOpenAudit?: (progress: CategoryProgress) => void;
}

export function CategoryBreakdownModal({ progress, fixtureMode = false, onClose, onOpenPledge, onOpenShare, onOpenAudit }: CategoryBreakdownModalProps) {
  if (!progress) return null;

  const { category, approvedCount, target } = progress;
  const percentText = formatPercent(approvedCount, target);

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
              <strong>{progress.isCountKnown ? `${formatCount(approvedCount)} ${category.unitPlural}` : 'Count unavailable'}</strong>
            </div>
            <div className="breakdown-stat-pill">
              <span className="tiny muted">Launch Target</span>
              <strong>{target ? `${target.toLocaleString()} ${category.unitPlural}` : 'Target being set'}</strong>
            </div>
            {percentText && (
              <div className="breakdown-stat-pill">
                <span className="tiny muted">Current Progress</span>
                <strong>{percentText}</strong>
              </div>
            )}
          </div>

          <h4 className="breakdown-section-heading">What counts?</h4>
          <p>{category.explanation}</p>
          <h4 className="breakdown-section-heading">How you can help</h4>
          <p>{category.activeQueuePrompt.taskLabel}. Add context and attribution in TribeStudio so a reviewer can check your contribution.</p>
          {progress.velocityWeek > 0 && <p className="tiny muted">{fixtureMode ? 'Sample pace' : 'Verified this week'}: {progress.velocityWeek.toLocaleString()} {category.unitPlural}.</p>}
          <div className="category-detail-actions">
            <button type="button" onClick={() => onOpenPledge?.(progress)}><Icon name="check" size={14} /> Make a pledge</button>
            <button type="button" onClick={() => onOpenShare?.(progress)}><Icon name="chat" size={14} /> Share progress</button>
            <button type="button" onClick={() => onOpenAudit?.(progress)}><Icon name="source" size={14} /> How we count</button>
          </div>
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
