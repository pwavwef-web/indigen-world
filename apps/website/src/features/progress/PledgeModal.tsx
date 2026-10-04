/**
 * src/features/progress/PledgeModal.tsx
 *
 * Community micro-commitment modal. Allows visitors to pledge
 * contributions, adds to community pledge tallies, and provides
 * instant calendar (.ics) and WhatsApp reminders.
 */

import { useEffect, useState } from 'react';
import { ProgressDialog } from './ProgressDialog';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import type { CategoryProgress } from './progressTypes';

interface PledgeModalProps {
  progress: CategoryProgress | null;
  onClose: () => void;
  onPledgeSubmitted: (categoryId: string, amount: number) => void;
}

export function PledgeModal({ progress, onClose, onPledgeSubmitted }: PledgeModalProps) {
  const [pledgeAmount, setPledgeAmount] = useState<number>(5);
  const [pledged, setPledged] = useState(false);

  useEffect(() => {
    setPledged(false);
    setPledgeAmount(5);
  }, [progress?.category.id]);

  if (!progress) return null;
  const { category } = progress;

  const handlePledge = () => {
    onPledgeSubmitted(category.id, pledgeAmount);
    setPledged(true);
  };

  const handleDownloadCalendar = () => {
    const icsData = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Indigen World//Pledge Reminder//EN',
      'BEGIN:VEVENT',
      `SUMMARY:Contribute ${pledgeAmount} ${category.unitPlural} to Indigen World`,
      `DESCRIPTION:Help fill the ${category.title} jar for Indigen World launch at ${category.ctaUrl}`,
      `URL:${category.ctaUrl}`,
      `DTSTART:${new Date(Date.now() + 86400000 * 2).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTEND:${new Date(Date.now() + 86400000 * 2 + 3600000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `indigen-world-${category.id}-pledge.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const whatsappMessage = encodeURIComponent(
    `I just pledged to contribute ${pledgeAmount} ${category.unitPlural} to help fill the Kasem ${category.title} jar ahead of the Indigen World launch! Join me here: https://indigenworld.com/progress`
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`;

  return (
    <ProgressDialog labelledBy="pledge-title" onClose={onClose}>
      <div className="progress-modal-card">
        <div className="progress-modal-header">
          <div className="progress-modal-title-group">
            <Icon name="check" size={20} />
            <h3 id="pledge-title">Pledge to Help: {category.title}</h3>
          </div>
          <button type="button" className="progress-modal-close" onClick={onClose} aria-label="Close pledge modal">
            &times;
          </button>
        </div>

        <div className="progress-modal-body">
          {!pledged ? (
            <>
              <p className="tiny muted">
                Every contribution counts. Even pledging 5 {category.unitPlural} brings our community closer to launch.
              </p>

              <div className="pledge-selector-group">
                <label className="pledge-label" htmlFor="pledge-select">
                  How many {category.unitPlural} can you contribute this month?
                </label>
                <div className="pledge-options" id="pledge-select">
                  {[2, 5, 10, 25].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={`pledge-option-btn ${pledgeAmount === amount ? 'is-selected' : ''}`}
                      aria-pressed={pledgeAmount === amount}
                      onClick={() => setPledgeAmount(amount)}
                    >
                      +{amount} {category.unitPlural}
                    </button>
                  ))}
                </div>
              </div>

              <div className="callout callout--sand" style={{ marginTop: '1rem' }}>
                <span className="tiny">
                  <strong>A personal reminder:</strong> Your pledge is kept only in this visit. It is not saved to a community total and does not fill the vessel. You can download a calendar reminder after confirming.
                </span>
              </div>
            </>
          ) : (
            <div className="pledge-success-view">
              <div className="pledge-success-icon" aria-hidden="true">
                <Icon name="check" size={28} />
              </div>
              <h4>Thank you for your pledge!</h4>
              <p className="tiny muted">
                You pledged <strong>+{pledgeAmount} {category.unitPlural}</strong> to the {category.title} vessel.
              </p>

              <div className="pledge-actions-row">
                <button type="button" className="control-toggle-btn" onClick={handleDownloadCalendar}>
                  <Icon name="bookmark" size={14} /> Add Calendar Reminder (.ics)
                </button>
                <a className="control-toggle-btn" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="chat" size={14} /> Share on WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="progress-modal-footer">
          {!pledged ? (
            <>
              <Button type="button" onClick={handlePledge}>
                Confirm Pledge (+{pledgeAmount})
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button href={category.ctaUrl} external>
                Start Contributing Now
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </div>
      </div>
    </ProgressDialog>
  );
}
