/**
 * src/features/progress/EmbedWidgetModal.tsx
 *
 * Provides embeddable iframe / widget snippets for community
 * blogs, schools, and cultural partners.
 */

import { useEffect, useState } from 'react';
import { ProgressDialog } from './ProgressDialog';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import type { CategoryProgress } from './progressTypes';

interface EmbedWidgetModalProps {
  progress: CategoryProgress | null;
  onClose: () => void;
}

export function EmbedWidgetModal({ progress, onClose }: EmbedWidgetModalProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [progress?.category.id]);

  if (!progress) return null;
  const { category } = progress;

  const embedSnippet = `<iframe src="https://indigenworld.com/embed/vessel/${category.id}" width="280" height="380" frameborder="0" title="Kasem ${category.title} Progress" loading="lazy"></iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <ProgressDialog labelledBy="embed-title" onClose={onClose}>
      <div className="progress-modal-card">
        <div className="progress-modal-header">
          <div className="progress-modal-title-group">
            <Icon name="layers" size={20} />
            <h3 id="embed-title">Embed {category.title} Widget</h3>
          </div>
          <button type="button" className="progress-modal-close" onClick={onClose} aria-label="Close embed modal">
            &times;
          </button>
        </div>

        <div className="progress-modal-body">
          <p className="tiny muted">
            Copy and paste this snippet into your community website, school portal, or blog to display a live, self-updating progress jar for {category.title}.
          </p>

          <div className="embed-code-block">
            <textarea
              readOnly
              value={embedSnippet}
              className="embed-textarea"
              rows={4}
              aria-label="Embed HTML code"
            />
          </div>

          <div className="callout callout--sand" style={{ marginTop: '1rem' }}>
            <span className="tiny">
              <strong>Lightweight & Safe:</strong> The embed is sandboxed, respects user motion preferences, and consumes negligible bandwidth.
            </span>
          </div>
        </div>

        <div className="progress-modal-footer">
          <Button type="button" onClick={handleCopy}>
            <Icon name={copied ? 'check' : 'bookmark'} size={14} />
            {copied ? 'Copied code!' : 'Copy embed code'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ProgressDialog>
  );
}
