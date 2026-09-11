import { useMemo, useState } from 'react';
import type { GuidelineSection } from '@indigen-world/contracts/creator-models';
import { creatorGuidelines } from '@indigen-world/contracts';
import { Link } from '../../router';
import { useConfig } from '../CreatorProvider';
import { Skeleton, WhatsAppCard } from '../components';

// The guidelines are authored once, in @indigen-world/contracts, and written to
// platformConfiguration/creators by the seed scripts. Firestore stays the
// authority at runtime — that is what lets an admin correct a line without a
// deploy — but the shipped copy is the same text, so a cold load, an offline
// visit or a half-seeded environment shows the real guidelines rather than a
// two-line stub.
const FALLBACK = creatorGuidelines as GuidelineSection[];

const UNGROUPED = 'Guidelines';

type Group = { name: string; slug: string; sections: GuidelineSection[] };

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Sections carry their group as a flat field and are authored in order, so a
 * run of sections sharing a group becomes one block. Grouping this way (rather
 * than bucketing by name) keeps the author's ordering authoritative and means
 * ungrouped, admin-added sections still render.
 */
function groupSections(sections: GuidelineSection[]): Group[] {
  const groups: Group[] = [];
  for (const section of sections) {
    const name = section.group?.trim() || UNGROUPED;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.sections.push(section);
    else groups.push({ name, slug: slugify(name), sections: [section] });
  }
  return groups;
}

function matches(section: GuidelineSection, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${section.group ?? ''} ${section.heading} ${section.body} ${(section.points ?? []).join(' ')}`;
  return haystack.toLowerCase().includes(needle);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function GuidelinesPage() {
  const { config, loading, whatsappUrl } = useConfig();
  const [query, setQuery] = useState('');
  const configuredGuidelines = config?.guidelines;

  const sections = useMemo<GuidelineSection[]>(
    () => (configuredGuidelines?.length ? configuredGuidelines : FALLBACK),
    [configuredGuidelines],
  );

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => sections.filter((section) => matches(section, needle)),
    [needle, sections],
  );
  const groups = useMemo(() => groupSections(visible), [visible]);
  const allGroups = useMemo(() => groupSections(sections), [sections]);

  return (
    <div className="guidelines">
      <header className="guidelines__hero">
        <div className="guidelines__hero-copy">
          <p className="hero__eyebrow">Founding Creators · Guidelines</p>
          <h1>How to create, submit and share Kasem work.</h1>
          <p className="guidelines__lead">
            These are the rules the reviewers actually apply — what we accept, what permission you need before you
            record, how a submission is scored, and what happens after it is published. Reading them first is the
            simplest way to get published faster.
          </p>
          <label className="guidelines__search">
            <span className="sr-only">Search the guidelines</span>
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search consent, copyright, file size, rewards…"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                Clear
              </button>
            ) : null}
          </label>
        </div>
        <aside className="guidelines__essentials" aria-label="The essentials">
          <span className="guidelines__essentials-label">The essentials</span>
          <ul>
            <li>
              <strong>Kasem first.</strong> An English summary helps, but the Kasem is the work.
            </li>
            <li>
              <strong>Ask before you record.</strong> Everyone who appears must agree; a guardian must agree for a
              minor.
            </li>
            <li>
              <strong>Permissions stay separate.</strong> Review, publication, promotion and AI training are each
              asked for on their own.
            </li>
          </ul>
          <Link to="/studio/help">Ask creator support <span aria-hidden="true">→</span></Link>
        </aside>
      </header>

      {loading ? (
        <Skeleton lines={10} />
      ) : (
        <div className="guidelines__body">
          <nav className="guidelines__toc" aria-label="On this page">
            <p className="guidelines__toc-title">On this page</p>
            <ol>
              {allGroups.map((group) => (
                <li key={group.slug}>
                  <a href={`#${group.slug}`}>{group.name}</a>
                  <span>{group.sections.length}</span>
                </li>
              ))}
            </ol>
            <p className="guidelines__toc-note">
              {sections.length} sections. Campaign rules sit on top of these — check the campaign page too.
            </p>
          </nav>

          <div className="guidelines__content">
            {needle ? (
              <p className="guidelines__result-count" role="status">
                {visible.length} {visible.length === 1 ? 'section' : 'sections'} match “{query.trim()}”.
              </p>
            ) : null}

            {groups.length > 0 ? (
              groups.map((group) => (
                <section key={group.slug} id={group.slug} className="guidelines__group">
                  <h2 className="guidelines__group-title">{group.name}</h2>
                  <div className="guidelines__sections">
                    {group.sections.map((section) => (
                      <article key={section.heading} className="guidelines__section">
                        <h3>{section.heading}</h3>
                        <p>{section.body}</p>
                        {section.points && section.points.length > 0 ? (
                          <ul className="guidelines__points">
                            {section.points.map((point) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="guidelines__empty">
                <strong>Nothing matches that search.</strong>
                <p>Try a shorter word, or browse the sections from the contents list.</p>
                <button type="button" className="button button--ghost-dark" onClick={() => setQuery('')}>
                  Show all sections
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <WhatsAppCard url={whatsappUrl} />

      <p className="guidelines__fineprint">
        Registration, submission and publication never guarantee selection or payment. Campaign-specific terms always
        apply. Questions about a particular submission belong in{' '}
        <Link to="/studio/help">Help</Link>; anything about your account or a payment can go to{' '}
        <a href={`mailto:${config?.supportEmail || 'creators@indigen.world'}`}>
          {config?.supportEmail || 'creators@indigen.world'}
        </a>
        .
      </p>
    </div>
  );
}
