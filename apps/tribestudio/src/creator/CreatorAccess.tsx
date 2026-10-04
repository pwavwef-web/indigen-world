import { useEffect, useState, type ReactNode } from 'react';
import type { CreatorApplication, CreatorMembership, CreatorProfile } from '@indigen-world/contracts/creator-models';
import { signOutUser, useAuth } from '../auth';
import { FullPageLoader } from '../LoadingScreen';
import { AuthScreen, Button, KeyValue } from '../ui';
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
  const [refreshing, setRefreshing] = useState(false);

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

  if (failed) {
    return (
      <AuthScreen workspace="create" title="Could not check creator access" lede="Your account could not be loaded, so the studio stays closed rather than guessing. Check your connection and try again.">
        <div className="ts-auth__form" role="alert">
          <Button variant="primary" size="lg" block icon="refresh" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
          <Button variant="ghost" block onClick={() => void signOutUser()}>Sign out</Button>
        </div>
      </AuthScreen>
    );
  }

  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <AuthScreen
      workspace="create"
      title="Studio access is not available"
      lede="This account cannot publish to Indigen World at the moment. If you think that is a mistake, reply on the official creator channel and the team will look at it."
      wide
    >
      <KeyValue items={[
        { label: 'Status', value: <StatusPill status={status} labels={STATUS_LABELS} /> },
        { label: 'Reference', value: application?.reference ?? profile?.reference ?? '', hidden: !(application?.reference || profile?.reference) },
      ]} />
      <div className="ts-auth__form">
        <Button variant="primary" block icon="refresh" busy={refreshing} onClick={async () => { setRefreshing(true); try { await refreshToken(); } finally { setRefreshing(false); } }}>
          Refresh access
        </Button>
        <Button variant="ghost" block onClick={() => void signOutUser()}>Sign out</Button>
      </div>
      <WhatsAppCard url={whatsappUrl} compact />
    </AuthScreen>
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
