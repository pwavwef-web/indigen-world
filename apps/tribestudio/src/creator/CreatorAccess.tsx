import { useEffect, useState, type ReactNode } from 'react';
import type { CreatorApplication, CreatorMembership, CreatorProfile } from '@indigen-world/contracts/creator-models';
import { signOutUser, useAuth } from '../auth';
import { FullPageLoader } from '../LoadingScreen';
import { WorkspaceEntry } from '../interface/WorkspaceFrame';
import { ensureCreatorProfile, fetchMyApplications, fetchMyMembership, fetchMyProfile } from './data';
import { StatusPill, WhatsAppCard } from './components';
import { useConfig } from './CreatorProvider';

/**
 * Guards the studio.
 *
 * The gate used to be "approved creators only", which locked everyday people
 * out of publishing anything at all. Publishing to Explore is now open to any
 * signed-in account: the studio opens for everybody, and approval means only
 * what it should mean - eligibility for campaigns, which carry rewards.
 *
 * The one thing still turned away here is an account that has been suspended,
 * revoked or rejected. That is a moderation outcome, and it has to hold.
 */
export function ApplicationStatusGate({ children }: { children: ReactNode }) {
  const { user, creatorStatus, refreshToken } = useAuth();
  const { whatsappUrl } = useConfig();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const [membership, setMembership] = useState<CreatorMembership | null>(null);
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true); setFailed(false);
    void Promise.all([
      fetchMyMembership(user.uid),
      fetchMyApplications(user.uid),
      fetchMyProfile(user.uid),
    ]).then(async ([m, a, p]) => {
      if (!active) return;
      setMembership(m);
      setApplications(a);
      setProfile(p);
      if (m?.status === 'approved' && creatorStatus !== 'approved') {
        await refreshToken();
      }
      if (active) setLoading(false);
    }).catch(() => {
      if (active) { setFailed(true); setLoading(false); }
    });
    return () => {
      active = false;
    };
  }, [user, creatorStatus, refreshToken, attempt]);

  // Membership status is lowercase, application status is UPPERCASE, and profile
  // status is lowercase - normalize once so no blocked state slips through the
  // case mismatch (previously WITHDRAWN/REVOKED were misclassified as active).
  const application = applications[0] ?? null;
  const status = String(
    membership?.status ?? application?.status ?? profile?.status ?? 'not_started',
  ).toUpperCase();
  const blocked = ['REJECTED', 'SUSPENDED', 'REVOKED', 'WITHDRAWN'].includes(status);

  // Mint a minimal creator profile for anyone arriving without one, so their
  // first post has something to attribute itself to. Runs after the initial
  // read, and never for a blocked account.
  useEffect(() => {
    if (loading || failed || blocked || !user || profile) return;
    let active = true;
    void ensureCreatorProfile(
      user.uid,
      user.displayName ?? user.email ?? '',
      user.photoURL ?? null,
    ).then((created) => {
      if (active && created) setProfile(created);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
    };
  }, [loading, failed, blocked, user, profile]);

  if (loading) {
    return <FullPageLoader note="Checking your creator access…" />;
  }

  if (failed) return <WorkspaceEntry title="Your creator account." description="Reconnect to continue with your saved work."><h1>Could not check creator access</h1><p role="alert">Your account could not be loaded. Check your connection and retry.</p><button type="button" className="cw-auth__primary" onClick={() => setAttempt(value => value + 1)}>Try again</button><p><button type="button" onClick={() => void signOutUser()}>Sign out</button></p></WorkspaceEntry>;

  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <WorkspaceEntry title="Your creator account." description="Check access and contact the team when you need help.">
          <p className="hero__eyebrow">Creator access</p>
          <h1>Studio access is not available</h1>
          <p className="muted">
            This account cannot publish to Indigen World at the moment. If you think that
            is a mistake, reply on the official creator channel and the team will look
            at it.
          </p>
          <dl className="success__meta">
            <div>
              <dt>Status</dt>
              <dd><StatusPill status={status} labels={STATUS_LABELS} /></dd>
            </div>
            {application?.reference || profile?.reference ? (
              <div>
                <dt>Reference</dt>
                <dd>{application?.reference ?? profile?.reference}</dd>
              </div>
            ) : null}
          </dl>
          <div className="success__actions">
            <button type="button" className="button button--ghost-dark" onClick={() => void refreshToken()}>
              Refresh access
            </button>
            <button type="button" onClick={() => void signOutUser()}>Sign out</button>
          </div>
          <WhatsAppCard url={whatsappUrl} compact />
    </WorkspaceEntry>
  );
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'Pending review',
  WAITLISTED: 'Waitlisted',
  APPROVED: 'Approved',
  REJECTED: 'Not selected',
  SUSPENDED: 'Suspended',
  REVOKED: 'Revoked',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_INFO: 'More information requested',
  ACTIVE: 'Active',
  WITHDRAWN: 'Withdrawn',
};
