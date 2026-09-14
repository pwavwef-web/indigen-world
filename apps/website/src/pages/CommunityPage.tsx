/**
 * src/pages/CommunityPage.tsx
 *
 * Where a community shared out of the Indigen app lands on the web.
 *
 * The app shares `https://indigenworld.com/communities/<slug>`. On a phone
 * that has the app and has verified the domain, Android opens the community in
 * the app and this page is never drawn. Everywhere else it has the same three
 * jobs as the post page: show what was shared, say what Indigen is, and offer
 * the app — where joining, posting and reading a private community happen.
 *
 * It shows only what the community makes public: its profile and rules, and
 * for a public community a few recent posts. A private community's posts and
 * members are never requested. The route is `noindex` because the prerendered
 * shell cannot describe any particular community.
 */
import { useEffect, useState } from "react";
import { Link, useRoute } from "../app/router";
import { SectionHeading } from "../components/SectionHeading";
import { ROUTES_BY_PATH } from "../content/navigation";
import { APP_STORE_URL, APP_WAITLIST_ROUTE, appLinkForCommunity } from "../content/appLinks";
import {
  COMMUNITY_CATEGORY_LABELS,
  fetchCommunitySpace,
  type CommunityLookup,
  type CommunitySpace,
} from "../features/community/communityData";
import type { CommunityPost } from "../features/community/postData";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const route = ROUTES_BY_PATH.communities;

function memberLabel(count: number): string {
  return count === 1 ? "1 member" : `${count.toLocaleString()} members`;
}

function CommunityHandoff({ communityId }: { communityId: string | null }) {
  return (
    <div className="post-handoff">
      <h2>Join in on Indigen</h2>
      <p>
        Joining a community, asking to join a private one, and posting all
        happen in the Indigen app, where the Kasem community writes and keeps
        its language in daily use.
      </p>
      <div className="post-handoff__actions">
        {communityId && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              // A custom scheme reaches an installed app or nothing at all, so
              // the failure stays silent rather than leaving a blank tab.
              window.location.href = appLinkForCommunity(communityId);
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

function RecentPost({ post }: { post: CommunityPost }) {
  return (
    <li className="community-recent__item">
      <Link to={`post/${encodeURIComponent(post.id)}`}>
        <span className="community-recent__author">
          {post.authorName} <span className="muted">@{post.authorUsername}</span>
        </span>
        <span className="community-recent__text">
          {post.text || (post.media.length > 0 ? "A post with an attachment" : "A post")}
        </span>
      </Link>
    </li>
  );
}

function CommunityCard({ community, recentPosts }: { community: CommunitySpace; recentPosts: CommunityPost[] }) {
  const facts = [
    community.isPrivate ? "Private" : "Public",
    memberLabel(community.memberCount),
    COMMUNITY_CATEGORY_LABELS[community.category] ?? COMMUNITY_CATEGORY_LABELS.other,
    community.language,
    community.location,
  ].filter(Boolean);

  return (
    <article className="post-card community-card">
      <div
        className={`community-card__cover${community.coverUrl ? "" : " community-card__cover--pattern"}`}
        style={community.coverUrl ? { backgroundImage: `url("${community.coverUrl}")` } : undefined}
        aria-hidden="true"
      />
      <header className="community-card__head">
        {community.avatarUrl ? (
          <img className="community-card__avatar" src={community.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="community-card__avatar community-card__avatar--initial" aria-hidden="true">
            {community.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <h2 className="community-card__name">{community.name}</h2>
          <p className="community-card__facts tiny muted">{facts.join(" · ")}</p>
        </div>
      </header>

      {community.description && <p className="post-card__text">{community.description}</p>}

      {community.isPrivate && (
        <p className="community-card__private tiny">
          This is a private community. Its posts and members are visible only to
          people a moderator has let in.
        </p>
      )}

      {community.rules.length > 0 && (
        <section aria-labelledby="community-rules">
          <h3 id="community-rules" className="community-card__subhead">
            Community rules
          </h3>
          <ol className="community-card__rules">
            {community.rules.map((rule, index) => (
              <li key={`${index}-${rule}`}>{rule}</li>
            ))}
          </ol>
        </section>
      )}

      {recentPosts.length > 0 && (
        <section aria-labelledby="community-recent">
          <h3 id="community-recent" className="community-card__subhead">
            Recently in this community
          </h3>
          <ul className="community-recent">
            {recentPosts.map((post) => (
              <RecentPost key={post.id} post={post} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export function CommunityPage() {
  useDocumentMeta(route.title, route.description, { noindex: route.noindex });

  const { params } = useRoute();
  const communityId = params.communityId ?? null;
  const [lookup, setLookup] = useState<CommunityLookup | null>(null);

  useEffect(() => {
    if (!communityId) {
      setLookup({ status: "missing" });
      return;
    }
    let active = true;
    setLookup(null);
    fetchCommunitySpace(communityId).then((result) => {
      if (active) setLookup(result);
    });
    return () => {
      active = false;
    };
  }, [communityId]);

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
              <span className="sr-only">Loading this community</span>
            </div>
          )}

          {lookup?.status === "found" && (
            <CommunityCard community={lookup.community} recentPosts={lookup.recentPosts} />
          )}

          {lookup?.status === "missing" && (
            <div className="post-card post-card--empty">
              <h2>This community does not exist</h2>
              <p>
                The link may have been mistyped. Nothing is wrong with your
                connection.
              </p>
            </div>
          )}

          {lookup?.status === "closed" && (
            <div className="post-card post-card--empty">
              <h2>{lookup.name} is no longer open</h2>
              <p>
                It was closed by its owner or removed by the Indigen team. You
                can find other communities in the app.
              </p>
            </div>
          )}

          {lookup?.status === "error" && (
            <div className="post-card post-card--empty">
              <h2>This community could not be loaded</h2>
              <p>
                Something went wrong reaching Indigen from this browser. Try
                again in a moment, or open the link in the app.
              </p>
            </div>
          )}

          <CommunityHandoff communityId={lookup?.status === "found" ? communityId : null} />

          <p className="post-page__footer-note tiny muted">
            New here? <Link to="about">Read what Indigen World is building</Link>, or
            browse the <Link to="dictionary">public Kasem dictionary</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
