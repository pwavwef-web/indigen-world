import { useState } from 'react';
import './contributor.css';

// Local visual fixture: no authentication, Firestore reads, or submissions.
const expressions = [
  'Good morning. How is your family?',
  'Thank you for welcoming me into your home.',
  'Let us meet at the market tomorrow.',
  'Could you say that again, please?',
  'We learn from those who came before us.',
];

export function ContributorPreview() {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState('untranslated');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [alternatives, setAlternatives] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<number[]>([]);
  const [publication, setPublication] = useState(false);
  const [training, setTraining] = useState(false);
  const translated = Object.values(drafts).filter(value => value.trim()).length;
  const visible = expressions.map((expression, id) => ({ expression, id })).filter(({ id }) =>
    tab === 'reviewed' ? false : tab === 'translated' ? Boolean(drafts[id]?.trim()) : !drafts[id]?.trim());
  const locked = submitted.includes(selected);
  return <div className="contributor-portal">
    <header><div><span className="contributor-kicker">INDIGEN WORLD / CONTRIBUTORS</span>
      <h1>Everyday expressions. Living Kasem.</h1></div><button onClick={() => window.location.assign('/contributor')}>Exit preview</button></header>
    <main id="main-content" tabIndex={-1}>
      <p role="status">Design preview · Sample assignment. Edits stay in this page and are cleared on refresh.</p>
      <p className="contributor-identity">Contributor ID: <code>preview-contributor</code></p>
      <label className="contributor-assignment">Your assignment<select defaultValue="sample"><option value="sample">Everyday conversations · sample</option></select></label>
      <p>Translate the meaning as you would naturally say it. Expressions and idioms rarely translate word for word.</p>
      <div className="contributor-stats"><span><strong>{expressions.length - translated}</strong> Untranslated</span>
        <span><strong>{translated}</strong> Translated</span><span><strong>0</strong> Reviewed / verified</span></div>
      <nav aria-label="Expression views">{[['untranslated', 'Untranslated'], ['translated', 'Translated'], ['reviewed', 'Reviewed / verified']].map(([key, label]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <div className="contributor-workspace"><aside aria-label="Expressions">{visible.map(({ expression, id }) =>
        <button key={id} aria-current={selected === id ? 'true' : undefined} onClick={() => { setSelected(id); setPublication(false); setTraining(false); }}>
          <span>{expression}</span><small>{submitted.includes(id) ? 'Submitted' : drafts[id]?.trim() ? 'Draft saved' : 'Not started'}</small></button>)}
        {!visible.length && <p>{tab === 'reviewed' ? 'Reviewed expressions will appear here.' : tab === 'translated' ? 'Your saved translations and submissions will appear here.' : 'No untranslated expressions in this assignment.'}</p>}
      </aside><form className="contributor-editor" onSubmit={event => { event.preventDefault(); setSubmitted(current => [...current, selected]); }}>
        <span className="contributor-kicker">EXPRESSION · KASEM</span>
        <label>Expression<textarea readOnly value={expressions[selected]} /></label>
        <label>How to say it in Kasem<textarea required maxLength={2000} disabled={locked} value={drafts[selected] ?? ''} onChange={event => setDrafts({ ...drafts, [selected]: event.target.value })} /></label>
        <label>Other ways of saying it in Kasem<textarea maxLength={3500} disabled={locked} value={alternatives[selected] ?? ''} onChange={event => setAlternatives({ ...alternatives, [selected]: event.target.value })} placeholder="One alternative per line (optional; up to 12, 500 characters each)" /></label>
        {!locked && <><label className="contributor-check"><input type="checkbox" required checked={publication} onChange={event => setPublication(event.target.checked)} />I have permission to share this expression for review and dictionary publication.</label>
          <label className="contributor-check"><input type="checkbox" checked={training} onChange={event => setTraining(event.target.checked)} />Also allow approved translations to be used for Kauri AI training (optional).</label>
          <p role="status">{drafts[selected] ? 'Preview draft saved in this page' : 'All changes saved'}</p>
          <button disabled={!drafts[selected]?.trim() || !publication}>Submit to Review Desk</button></>}
        {locked && <p role="status">Preview submission complete · Nothing was sent to the Review Desk.</p>}
      </form></div>
    </main>
  </div>;
}
