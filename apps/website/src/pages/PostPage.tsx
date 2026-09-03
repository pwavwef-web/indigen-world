/**
 * src/pages/PostPage.tsx
 *
 * Where a post shared out of the Indigen app lands on the web.
 *
 * The app shares `https://indigenworld.com/post/<id>`. On a phone that has the
 * app and has verified the domain, Android hands that URL straight to the app
 * and this page is never drawn. Everywhere else — a laptop, a phone without
 * the app, a link pasted into a chat and opened in an in-app browser — this is
 * what the recipient sees, and it has to do three things in order: show them
 * the post they were sent, tell them what Indigen is, and offer them the app.
 *
 * It renders the post client-side. `communityPosts` is world-readable by rule,
 * so this needs no account and no backend of its own; the cost is that a
 * crawler or an unfurler sees only the prerendered shell, which is why the
 * route is `noindex` in content/navigation.ts. Per-post link previews would
 * need the URL served by a function that can render the post's own metadata —
 * a separate change, noted in docs/product/shared-post-links.md.
 */
import { useEffect, useState } from "react";
import { Link, useRoute } from "../app/router";
import { SectionHeading } from "../components/SectionHeading";
import { ROUTES_BY_PATH } from "../content/navigation";
import { APP_STORE_URL, APP_WAITLIST_ROUTE, appLinkForPost } from "../content/appLinks";
import { fetchCommunityPost, type CommunityPost, type PostLookup } from "../features/community/postData";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const route = ROUTES_BY_PATH.post;

function formatPostedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/**
 * The handover panel, shown in every state including the ones where the post
 * could not be loaded — somebody who followed a link to a deleted post is
 * still somebody who was invited into the community.
 */
function AppHandoff({ postId }: { postId: string | null }) {
  return (
    <div className="post-handoff">
      <h2>Open this in Indigen</h2>
      <p>
        Indigen is where the Kasem community writes, replies and keeps its
        language in daily use. Replying, reacting and following people all
        happen in the app.
      </p>
      <div className="post-handoff__actions">
        {postId && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              // A custom scheme reaches an installed app or nothing at all.
              // Assigning to `location` rather than opening a window keeps the
              // failure silent instead of leaving a blank tab behind.
              window.location.href = appLinkForPost(postId);
            }}
          >
            Open in the app
          </button>
        )}
        {APP_STORE_URL ? (
          <a className="button button--secondary" href={APP_STORE_URL}>
            Get the app
          </a>
        ) : (
          <Link className="button button--secondary" to={APP_WAITLIST_ROUTE}>
            Join the app waitlist
          </Link>
        )}
      </div>
      <p className="tiny muted">
        Nothing happened when you tapped “Open in the app”? The app is not
        installed on this device yet.
      </p>
    </div>
  );
}

function PostCard({ post }: { post: CommunityPost }) {
  const postedAt = formatPostedAt(post.createdAt);
  const images = post.media.filter((item) => item.type === "image");
  const otherMedia = post.media.length - images.length;

  return (
    <article className="post-card">
      <header className="post-card__author">
        {post.authorAvatarUrl ? (
          <img className="post-card__avatar" src={post.authorAvatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="post-card__avatar post-card__avatar--initial" aria-hidden="true">
            {post.authorName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <p className="post-card__name">
            {post.authorName}
            {post.authorVerified && (
              <span className="post-card__verified" title="Verified member" aria-label="Verified member">
                ✓
              </span>
            )}
          </p>
          <p className="post-card__handle">@{post.authorUsername}</p>
        </div>
      </header>

      {post.text && <p className="post-card__text">{post.text}</p>}

      {images.length > 0 && (
        <div className={`post-card__media post-card__media--${Math.min(images.length, 2)}`}>
          {images.map((item) => (
            <img key={item.url} src={item.url} alt="" loading="lazy" />
          ))}
        </div>
      )}

      {otherMedia > 0 && (
        <p className="post-card__attachment tiny muted">
          {otherMedia === 1
            ? "This post has an attachment that plays in the app."
            : `This post has ${otherMedia} attachments that play in the app.`}
        </p>
      )}

      <footer className="post-card__meta tiny muted">
        {postedAt && <span>{postedAt}</span>}
        <span>{formatCount(post.replyCount)} replies</span>
        <span>{formatCount(post.likeCount)} appreciations</span>
        {post.repostCount > 0 && <span>{formatCount(post.repostCount)} reshares</span>}
      </footer>
    </article>
  );
}

export function PostPage() {
  useDocumentMeta(route.title, route.description, { noindex: route.noindex });

  const { params } = useRoute();
  const postId = params.postId ?? null;
  const [lookup, setLookup] = useState<PostLookup | null>(null);

  useEffect(() => {
    if (!postId) {
      setLookup({ status: "missing" });
      return;
    }
    let active = true;
    setLookup(null);
    fetchCommunityPost(postId).then((result) => {
      if (active) setLookup(result);
    });
    return () => {
      active = false;
    };
  }, [postId]);

  return (
    <>
      <section className="page-hero page-hero--legal">
        <div className="container">
          <SectionHeading eyebrow="Community" title="Shared from Indigen" light as="h1" />
        </div>
      </section>

      <section className="section section--white">
        <div className="container post-page">
          {lookup === null && (
            <div className="post-card post-card--loading" aria-busy="true">
              <span className="post-card__skeleton" />
              <span className="post-card__skeleton" />
              <span className="post-card__skeleton post-card__skeleton--short" />
              <span className="sr-only">Loading this post</span>
            </div>
          )}

          {lookup?.status === "found" && <PostCard post={lookup.post} />}

          {lookup?.status === "missing" && (
            <div className="post-card post-card--empty">
              <h2>This post is no longer here</h2>
              <p>
                It was deleted by the person who wrote it, or the link was
                mistyped. Nothing is wrong with your connection.
              </p>
            </div>
          )}

          {lookup?.status === "error" && (
            <div className="post-card post-card--empty">
              <h2>This post could not be loaded</h2>
              <p>
                Something went wrong reaching Indigen from this browser. Try
                again in a moment, or open the link in the app.
              </p>
            </div>
          )}

          <AppHandoff postId={postId} />

          <p className="post-page__footer-note tiny muted">
            New here? <Link to="about">Read what Indigen World is building</Link>, or
            browse the <Link to="dictionary">public Kasem dictionary</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
