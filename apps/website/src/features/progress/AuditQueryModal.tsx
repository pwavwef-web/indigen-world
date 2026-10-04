/**
 * src/features/progress/AuditQueryModal.tsx
 *
 * Radical transparency inspector displaying exact Firestore collections,
 * query filters, review criteria, and security rules for each vessel.
 */

import { ProgressDialog } from './ProgressDialog';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import type { CategoryProgress } from './progressTypes';

interface AuditQueryModalProps {
  progress: CategoryProgress | null;
  fixtureMode?: boolean;
  onClose: () => void;
}

export function AuditQueryModal({ progress, fixtureMode = false, onClose }: AuditQueryModalProps) {
  if (!progress) return null;
  const { category, approvedCount, awaitingReviewCount } = progress;

  return (
    <ProgressDialog labelledBy="audit-title" onClose={onClose}>
      <div className="progress-modal-card">
        <div className="progress-modal-header">
          <div className="progress-modal-title-group">
            <Icon name="context" size={20} />
            <h3 id="audit-title">Counting rules: {category.title}</h3>
          </div>
          <button type="button" className="progress-modal-close" onClick={onClose} aria-label="Close audit modal">
            &times;
          </button>
        </div>

        <div className="progress-modal-body">
          <p className="tiny muted">
            Progress is retrieved as aggregate counts. These are the category’s configured counting and review rules.
          </p>

          <div className="audit-detail-block">
            <div className="audit-field">
              <span className="tiny muted">Firestore Collection</span>
              <code>/{category.auditQuery.collection}</code>
            </div>

            <div className="audit-field">
              <span className="tiny muted">Configured counting rule</span>
              <code>{category.auditQuery.filter}</code>
            </div>

            <div className="audit-field">
              <span className="tiny muted">Configured publication rule</span>
              <code>{category.auditQuery.securityRule}</code>
            </div>

            <div className="audit-field">
              <span className="tiny muted">{fixtureMode ? 'Sample count' : 'Current aggregate count'}</span>
              <strong>{approvedCount.toLocaleString()} usable records</strong>
            </div>

            {awaitingReviewCount !== null && awaitingReviewCount !== undefined && (
              <div className="audit-field">
                <span className="tiny muted">Submissions in Review Queue</span>
                <span>{awaitingReviewCount} pending verification</span>
              </div>
            )}
          </div>

          <div className="callout callout--sand" style={{ marginTop: '1rem' }}>
            <span className="tiny">
              <strong>Aggregate counts:</strong> This page requests counts instead of downloading full contribution records. Counts do not include private contributor notes or identity fields.
            </span>
          </div>
        </div>

        <div className="progress-modal-footer">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ProgressDialog>
  );
}
