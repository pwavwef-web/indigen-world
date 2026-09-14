import { useEffect, useState } from 'react';
import type { PublishedContent } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { fetchMyPublished } from '../data';
import { EmptyState, LoadError, Skeleton, useReloadable } from '../components';

const KIND_LABELS: Record<string, string> = {
  music: 'Music',
  dictionary: 'Dictionary',
  literature: 'Literature',
  audiobooks: 'Audiobooks',
  video: 'Video',
};

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

  if (failed) {
    return (
      <div className="page">
        <h1>Published work</h1>
        <LoadError onRetry={retry} title="We couldn’t load your published work" />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="page">
        <h1>Published work</h1>
        <Skeleton lines={5} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>Published work</h1>
        <div className="page__head-actions">
          <Link to="/studio/submissions" className="button button--ghost-dark button--small">Your work</Link>
          <Link to="/studio/submissions/new" className="button button--primary button--small">New post</Link>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing public yet"
          body="Anything you post to Explore appears here with the link readers open, so you can check how it landed and share it."
          action={<Link to="/studio/submissions/new" className="button button--primary">Post something</Link>}
        />
      ) : (
        <div className="published-grid">
          {items.map((item) => (
            <article key={item.id} className="published-card">
              {item.thumbnailUrl ? (
                <img className="published-card__thumb" src={item.thumbnailUrl} alt="" loading="lazy" />
              ) : (
                <div className="published-card__thumb published-card__thumb--empty" aria-hidden="true">
                  {MEDIA_LABELS[item.mediaType ?? ''] ?? 'Post'}
                </div>
              )}
              <div className="published-card__body">
                <h2>{item.title || 'Untitled'}</h2>
                <p className="tiny muted">
                  {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'Just now'}
                  {item.collectionKind ? ` · ${KIND_LABELS[item.collectionKind] ?? item.collectionKind}` : ''}
                  {item.mediaType ? ` · ${MEDIA_LABELS[item.mediaType] ?? item.mediaType}` : ''}
                </p>
                {item.description ? <p className="published-card__desc">{item.description}</p> : null}
                <p className="tiny muted">
                  Credited to {item.creatorAttribution?.displayName || 'you'}
                  {item.licenceDisplay ? ` · ${item.licenceDisplay}` : ''}
                </p>
                {item.correctionState && item.correctionState !== 'none' ? (
                  <p className="tiny">This record is marked “{item.correctionState.replace(/_/g, ' ')}”.</p>
                ) : null}
                <div className="published-card__actions">
                  <a
                    className="button button--small"
                    href={postUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open as a reader
                  </a>
                  <button type="button" className="button button--small button--ghost-dark" onClick={() => void copyLink(item)}>
                    {copied === item.id ? 'Link copied' : 'Copy link'}
                  </button>
                  <Link
                    to={`/studio/submissions/${item.submission?.id ?? ''}`}
                    className="button button--small button--ghost-dark"
                  >
                    Manage
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
