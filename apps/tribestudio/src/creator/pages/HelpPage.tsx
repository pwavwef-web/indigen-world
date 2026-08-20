import { useEffect, useState } from 'react';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { useConfig } from '../CreatorProvider';
import { fetchMyProfile } from '../data';
import { Field, WhatsAppCard } from '../components';

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
    <div className="page">
      <header className="page__head"><h1>Help &amp; support</h1></header>

      <section className="panel">
        <h2>Search FAQs</h2>
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search FAQs" />
        <div className="faq">
          {filtered.length === 0 ? <p className="muted">No matching questions. <Link to="/creators/faq">See all FAQs</Link>.</p> : filtered.map((f) => (
            <details key={f.question} className="faq__item"><summary>{f.question}</summary><p>{f.answer}</p></details>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Submission troubleshooting</h2>
        <div className="faq">
          {TROUBLESHOOTING.map(([q, a]) => <details key={q} className="faq__item"><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="panel">
        <h2>Report a problem</h2>
        <Field label="Your creator reference" htmlFor="ref"><input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. KCC-2026-0001" /></Field>
        <Field label="Subject" htmlFor="subj"><input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message" htmlFor="msg"><textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        <button type="button" className="button button--primary" onClick={submit} disabled={!message.trim()}>Send</button>
        {sent ? <span className="save-toast" role="status">Opening your email app…</span> : null}
      </section>

      <WhatsAppCard />
    </div>
  );
}
