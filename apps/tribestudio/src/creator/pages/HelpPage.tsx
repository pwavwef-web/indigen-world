import { useEffect, useState } from 'react';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { useConfig } from '../CreatorProvider';
import { fetchMyProfile } from '../data';
import { Field, WhatsAppCard } from '../components';
import { Button, Disclosure, EmptyState, Icon, PageHeader, Panel, SearchField } from '../../ui';

const TROUBLESHOOTING = [
  ['My upload keeps failing', 'Check your file size and type against the campaign limits, then retry on a stable connection.'],
  ['I can’t submit yet', 'Submissions open only when a campaign’s status is “Submissions open”. Watch for the announcement.'],
  ['I need to change my display name', 'Contact support with your creator reference and the new name.'],
];

export function HelpPage() {
  const { user } = useAuth();
  const { config } = useConfig();
  const [reference, setReference] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [query, setQuery] = useState('');

  // Best-effort: prefill the reference from the profile.
  useEffect(() => {
    if (user) void fetchMyProfile(user.uid).then((p) => { if (p?.reference) setReference(p.reference); });
  }, [user]);

  const faqs = config?.faqs ?? [];
  const filtered = query
    ? faqs.filter((f) => (f.question + f.answer).toLowerCase().includes(query.toLowerCase()))
    : faqs;

  // A support request is written to a mailto for now; the supportRequests
  // collection + admin queue is available for a fuller workflow.
  const submit = () => {
    const to = config?.supportEmail ?? 'creators@indigen.world';
    const body = `Reference: ${reference}\n\n${message}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject || 'Creator support')}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  return (
    <div className="ts-page cr-help">
      <PageHeader
        kicker="Account"
        title="Help & guidance"
        description="Answers to common questions, fixes for submission problems, and a direct line to the team."
        actions={<Link className="ts-btn ts-btn--secondary" to="/creators/guidelines"><Icon name="guide" />Creator guidelines</Link>}
      />

      <div className="ts-split">
        <div className="ts-stack">
          <Panel title="Frequently asked questions" actions={<SearchField value={query} onChange={setQuery} label="Search FAQs" placeholder="Search questions" />}>
            {filtered.length === 0 ? (
              <EmptyState
                compact
                icon="search"
                title={query ? 'No matching questions' : 'No questions published yet'}
                body={query ? 'Try other words, or read the full list.' : 'The full creator FAQ is on the public site.'}
                actions={<Link className="ts-link" to="/creators/faq">See all FAQs</Link>}
              />
            ) : (
              <div className="cr-faq">
                {filtered.map((f) => (
                  <Disclosure key={f.question} summary={f.question}><p className="cr-prose">{f.answer}</p></Disclosure>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Submission troubleshooting" description="The problems creators raise most often.">
            <div className="cr-faq">
              {TROUBLESHOOTING.map(([q, a]) => <Disclosure key={q} summary={q} icon="help"><p className="cr-prose">{a}</p></Disclosure>)}
            </div>
          </Panel>
        </div>

        <aside className="ts-stack" aria-label="Contact the team">
          <Panel title="Report a problem" description="This opens your email app with the message ready to send.">
            <div className="ts-stack ts-stack--sm">
              <Field label="Your creator reference" htmlFor="ref"><input id="ref" className="ts-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. KCC-2026-0001" /></Field>
              <Field label="Subject" htmlFor="subj"><input id="subj" className="ts-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
              <Field label="Message" htmlFor="msg"><textarea id="msg" className="ts-textarea" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
              <Button variant="primary" icon="send" block onClick={submit} disabled={!message.trim()}>Write the email</Button>
              {sent ? <p className="ts-save" role="status"><span className="ts-save__mark" aria-hidden="true"><Icon name="check" /></span>Opening your email app…</p> : null}
            </div>
          </Panel>
          <WhatsAppCard />
        </aside>
      </div>
    </div>
  );
}
