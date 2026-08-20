import { Link, useQueryParam } from '../../router';
import { useConfig } from '../CreatorProvider';
import { WhatsAppCard } from '../components';

export function SuccessPage() {
  const reference = useQueryParam('ref');
  const flagged = useQueryParam('flagged') === '1';
  const { whatsappUrl } = useConfig();

  return (
    <div className="success">
      <div className="success__card">
        <div className="success__check" aria-hidden="true">✓</div>
        <h1>Application received</h1>
        <p className="muted">
          Thank you for joining the Indigen World Founding Creators Programme. Your application has been
          recorded.
        </p>

        {reference ? (
          <div className="success__ref">
            <span className="tiny">Your creator reference</span>
            <strong>{reference}</strong>
          </div>
        ) : null}

        <dl className="success__meta">
          <div>
            <dt>Current status</dt>
            <dd>{flagged ? 'Submitted · pending manual review' : 'Submitted · on the waitlist'}</dd>
          </div>
          <div>
            <dt>Next step</dt>
            <dd>
              {flagged
                ? 'Our team will review your application and may request guardian consent.'
                : 'Complete your profile, then watch for the campaign-opening announcement.'}
            </dd>
          </div>
        </dl>

        <div className="success__actions">
          <Link to="/studio/profile" className="button button--primary">
            Complete your creator profile
          </Link>
          <Link to="/studio" className="button button--ghost-dark">
            Go to your workspace
          </Link>
        </div>

        <p className="tiny">
          Joining the WhatsApp Channel does not replace completing your TribeStudio profile — do both to
          stay ready.
        </p>
        <WhatsAppCard url={whatsappUrl} />
      </div>
    </div>
  );
}
