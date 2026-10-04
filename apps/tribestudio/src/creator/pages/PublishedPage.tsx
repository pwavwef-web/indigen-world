import { useEffect, useState } from 'react';
import type { PublishedContent } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { fetchMyPublished } from '../data';
import { LoadError, useReloadable } from '../components';
import { Badge, ButtonAnchor, ButtonLink, EmptyState, Icon, PageHeader, SkeletonCards, spotlight, type IconName } from '../../ui';

const KIND_LABELS: Record<string, string> = {
  music: 'Music',
  dictionary: 'Dictionary',
  literature: 'Literature',
  audiobooks: 'Audiobooks',
  video: 'Video',
};

const MEDIA_ICON: Record<string, IconName> = { image: 'image', audio: 'audio', video: 'video', document: 'doc' };

const MEDIA_LABELS: Record<string, string> = {
  image: 'Photo',
  audio: 'Audio',
  video: 'Video',
  document: 'Document',
};

/** The public link a reader would open. Matches the web app's /post/<id> route. */
function postUrl(item: PublishedContent): string {
  return `https://indigenworld.com/post/${item.id}`;
}

/**
 * What this creator has published, as the public sees it.
 *
 * The workspace could tell a creator only that a private row said PUBLISHED.
 * They could not see the page readers get, check the thumbnail or the
 * attribution line, or copy the link to share it — so posting had no visible
 * result, which is the strongest reason someone stops posting.
 */
export function PublishedPage() {
  const { user } = useAuth();
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [items, setItems] = useState<PublishedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    setLoading(true);
    void fetchMyPublished(user.uid)
      .then((next) => {
        if (!active) return;
        setItems(next);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user, reloadKey, setFailed]);

  const copyLink = async (item: PublishedContent) => {
    try {
      await navigator.clipboard.writeText(postUrl(item));
      setCopied(item.id);
      window.setTimeout(() => setCopied(null), 2_000);
    } catch {
      // A clipboard a browser will not grant is not an error worth a banner:
      // the link is visible on the card and can be copied by hand.
      setCopied(null);
    }
  };

  const header = (
    <PageHeader
      kicker="Your work"
      title="Published work"
      description="What readers see: the public page, its thumbnail and the credit line, with the link to share."
      actions={(
        <>
          <ButtonLink to="/studio/submissions" variant="secondary" icon="library">Content library</ButtonLink>
          <ButtonLink to="/studio/submissions/new" variant="primary" icon="plus">New post</ButtonLink>
        </>
      )}
    />
  );

  if (failed) {
    return (
      <div className="ts-page">
        {header}
        <LoadError onRetry={retry} title="We couldn’t load your published work" />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="ts-page">
        {header}
        <SkeletonCards count={3} label="Loading your published work" />
      </div>
    );
  }

  return (
    <div className="ts-page cr-published">
      {header}

      {items.length === 0 ? (
        <EmptyState
          boxed
          icon="globe"
          title="Nothing public yet"
          body="Anything you post to Explore appears here with the link readers open, so you can check how it landed and share it."
          actions={<ButtonLink to="/studio/submissions/new" variant="primary" icon="plus">Post something</ButtonLink>}
        />
      ) : (
        <div className="cr-published__grid ts-stagger">
          {items.map((item) => (
            <article key={item.id} className="ts-card cr-pub ts-spotlight" onPointerMove={spotlight}>
              <div className="cr-pub__thumb">
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <span className="cr-pub__placeholder" aria-hidden="true"><Icon name={MEDIA_ICON[item.mediaType ?? ''] ?? 'doc'} /></span>
                )}
                {item.mediaType ? <Badge tone="neutral" className="cr-pub__kind">{MEDIA_LABELS[item.mediaType] ?? item.mediaType}</Badge> : null}
              </div>
              <div className="cr-pub__body">
                <h2 className="cr-pub__title ts-clamp-2">{item.title || 'Untitled'}</h2>
                <p className="cr-pub__meta">
                  <Icon name="calendar" />
                  <span className="ts-truncate">
                    {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Just now'}
                    {item.collectionKind ? ` · ${KIND_LABELS[item.collectionKind] ?? item.collectionKind}` : ''}
                  </span>
                </p>
                {item.description ? <p className="cr-pub__desc ts-clamp-3">{item.description}</p> : null}
                <p className="cr-pub__credit">
                  Credited to {item.creatorAttribution?.displayName || 'you'}
                  {item.licenceDisplay ? ` · ${item.licenceDisplay}` : ''}
                </p>
                {item.correctionState && item.correctionState !== 'none' ? (
                  <Badge tone="warning" dot>Marked “{item.correctionState.replace(/_/g, ' ')}”</Badge>
                ) : null}
                <div className="cr-pub__actions">
                  <ButtonAnchor href={postUrl(item)} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" iconRight="external">Open as a reader</ButtonAnchor>
                  <button type="button" className={copied === item.id ? 'ts-btn ts-btn--soft ts-btn--sm is-copied' : 'ts-btn ts-btn--ghost ts-btn--sm'} onClick={() => void copyLink(item)} aria-live="polite">
                    <Icon name={copied === item.id ? 'check' : 'copy'} />
                    {copied === item.id ? 'Link copied' : 'Copy link'}
                  </button>
                  <Link to={`/studio/submissions/${item.submission?.id ?? ''}`} className="ts-btn ts-btn--ghost ts-btn--sm">Manage</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
