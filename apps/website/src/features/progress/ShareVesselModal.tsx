/**
 * src/features/progress/ShareVesselModal.tsx
 *
 * Dynamic social share card generator and copy engine for
 * individual heritage vessels.
 */

import { useEffect, useState } from 'react';
import { ProgressDialog } from './ProgressDialog';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { formatCount, formatPercent } from './progressFormat';
import type { CategoryProgress } from './progressTypes';

interface ShareVesselModalProps {
  progress: CategoryProgress | null;
  fixtureMode?: boolean;
  onClose: () => void;
}

export function ShareVesselModal({ progress, fixtureMode = false, onClose }: ShareVesselModalProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [progress?.category.id]);

  if (!progress) return null;
  const { category, approvedCount, target } = progress;

  const targetText = target ? `${target.toLocaleString()} ${category.unitPlural}` : 'being set';
  const percentValue = formatPercent(approvedCount, target);
  const percentText = percentValue ? `(${percentValue})` : '';
  const countText = formatCount(approvedCount);

  const shareText = !progress.isCountKnown
    ? `Help fill the Kasem ${category.title} jar! Follow our launch progress: https://indigenworld.com/progress`
    : fixtureMode
    ? `Sample preview only — ${category.title}: ${countText} sample ${category.unitPlural} against a sample target of ${targetText} ${percentText}. Explore live progress: https://indigenworld.com/progress`
    : `Help fill the Kasem ${category.title} jar! We currently have ${countText} ${category.id === 'music' ? 'published' : 'approved'} ${category.unitPlural} of our ${targetText} launch target ${percentText}. Every contribution counts: https://indigenworld.com/progress`;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <ProgressDialog labelledBy="share-title" onClose={onClose}>
      <div className="progress-modal-card">
        <div className="progress-modal-header">
          <div className="progress-modal-title-group">
            <Icon name="chat" size={20} />
            <h3 id="share-title">Share {category.title} Progress</h3>
          </div>
          <button type="button" className="progress-modal-close" onClick={onClose} aria-label="Close share modal">
            &times;
          </button>
        </div>

        <div className="progress-modal-body">
          {/* Share Preview Card */}
          <div className="share-preview-card" style={{ borderColor: category.culturalPalette.primary }}>
            <div className="share-preview-card__badge" style={{ backgroundColor: category.culturalPalette.primary }}>
              Indigen World · {fixtureMode ? 'Sample preview only' : 'Launch progress'}
            </div>
            <h4>{category.title}</h4>
            <div className="share-preview-card__numbers">
              <span className="share-big-count">{countText}</span>
              <span className="share-unit">{category.unitPlural}</span>
              {percentValue && <span className="share-pill">{percentValue} Filled</span>}
            </div>
            <p className="tiny muted">{category.description}</p>
            <div className="share-preview-card__footer">
              <span>indigenworld.com/progress</span>
            </div>
          </div>

          <div className="share-text-box">
            <p className="tiny">{shareText}</p>
          </div>

          <div className="share-social-buttons">
            <a className="control-toggle-btn" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="chat" size={14} /> WhatsApp
            </a>
            <a className="control-toggle-btn" href={tweetUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="globe" size={14} /> Post on X
            </a>
            <button type="button" className="control-toggle-btn" onClick={handleCopyText}>
              <Icon name={copied ? 'check' : 'bookmark'} size={14} />
              {copied ? 'Copied to clipboard!' : 'Copy text'}
            </button>
          </div>
        </div>

        <div className="progress-modal-footer">
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ProgressDialog>
  );
}
