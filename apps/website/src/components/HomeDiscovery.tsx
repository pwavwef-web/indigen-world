import { useEffect, useState } from 'react';
import { Link } from '../app/router';
import { fetchReviewedWordPreview, type DictionaryEntry } from '../features/dictionary/dictionaryData';
import { fetchPublishedExpressions, type PublishedExpression } from '../features/expressions/expressionData';
import { SectionHeading } from './SectionHeading';
import { Icon } from './Icon';

type Preview<T> = { status: 'loading' | 'ready' | 'error'; item: T | null };

export function HomeDiscovery() {
  const [word, setWord] = useState<Preview<DictionaryEntry>>({ status: 'loading', item: null });
  const [expression, setExpression] = useState<Preview<PublishedExpression>>({ status: 'loading', item: null });
  const [retry, setRetry] = useState(0);
  const [audioFailed, setAudioFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setWord({ status: 'loading', item: null });
    setExpression({ status: 'loading', item: null });
    setAudioFailed(false);
    fetchReviewedWordPreview().then(item => { if (active) setWord({ status: 'ready', item }); })
      .catch(() => { if (active) setWord({ status: 'error', item: null }); });
    fetchPublishedExpressions(1).then(items => { if (active) setExpression({ status: 'ready', item: items[0] ?? null }); })
      .catch(() => { if (active) setExpression({ status: 'error', item: null }); });
    return () => { active = false; };
  }, [retry]);
  return <section className="section section--cream home-discovery" id="find-your-path">
    <div className="container">
      <SectionHeading eyebrow="Try something today" title="A word. An expression. A new beginning." body="Explore public language records and a source-based guide. No account needed to browse." />
      <div className="home-discovery__grid">
        <article className="discovery-card discovery-card--word" aria-labelledby="discovery-word-title">
          <p className="eyebrow"><Icon name="volume" size={18} /> The dictionary</p>
          <h3 id="discovery-word-title">{word.item ? <span lang="xsm">{word.item.headword}</span> : 'Start with a word'}</h3>
          {word.status === 'loading' && <p role="status">Finding a reviewed word…</p>}
          {word.item && <>
            <p className="discovery-card__meaning">{word.item.translation}</p>
            <p className="discovery-card__meta">{word.item.dialect} · {word.item.authenticationStatus === 'gold' ? 'Expert authenticated' : 'Community reviewed'}</p>
            {word.item.audioUrl && !audioFailed ? <audio controls preload="none" src={word.item.audioUrl} aria-label={`Pronunciation of ${word.item.headword}`} onError={() => setAudioFailed(true)} /> : <p className="tiny">{audioFailed ? 'This recording could not be played. Open the entry to see its details.' : 'No recording is available in this preview.'}</p>}
            <p className="discovery-card__source">Source: {word.item.attribution}</p>
          </>}
          {word.status === 'ready' && !word.item && <p>Browse the published collection to compare meanings, review labels and recordings where available.</p>}
          {word.status === 'error' && <p role="status">The word preview could not load. You can still open the dictionary.</p>}
          <Link className="discovery-card__link" to={word.item ? `dictionary?entry=${encodeURIComponent(word.item.id)}#dictionary-results-heading` : 'dictionary'}>{word.item ? 'Read the full entry' : 'Open the dictionary'} <Icon name="arrow" size={18} /></Link>
        </article>
        <article className="discovery-card" aria-labelledby="discovery-expression-title">
          <p className="eyebrow"><Icon name="chat" size={18} /> Everyday Kasem</p>
          <h3 id="discovery-expression-title">{expression.item ? <span lang="xsm">{expression.item.phrase}</span> : 'Language in everyday life'}</h3>
          {expression.status === 'loading' && <p role="status">Finding a published expression…</p>}
          {expression.item && <>
            <p className="discovery-card__meaning">{expression.item.meaning}</p>
            <p className="discovery-card__meta">{expression.item.kindLabel}{expression.item.dialect ? ` · ${expression.item.dialect}` : ''}</p>
            {expression.item.context && <p>{expression.item.context}</p>}
            <p className="discovery-card__source">{expression.item.sourceLabel}{expression.item.sourceDetail ? `. ${expression.item.sourceDetail}` : ''}<br />Shared by {expression.item.contributorName}</p>
          </>}
          {expression.status === 'ready' && !expression.item && <p>Expressions will appear as the collection grows. See how Kasem speakers share an expression for review.</p>}
          {expression.status === 'error' && <p role="status">The expression preview could not load. Explore the published collection on the contribution page.</p>}
          <Link className="discovery-card__link" to={expression.item ? `contribute#expression-${encodeURIComponent(expression.item.id)}` : 'contribute#published'}>{expression.item ? 'Explore this expression' : 'Explore the expression collection'} <Icon name="arrow" size={18} /></Link>
        </article>
        <article className="discovery-card discovery-card--guide" aria-labelledby="discovery-guide-title">
          <p className="eyebrow"><Icon name="book" size={18} /> A little learning</p>
          <h3 id="discovery-guide-title">Make sense of a sentence.</h3>
          <p>Explore pronouns, word forms and sentence patterns in the public Kasem grammar guide.</p>
          <div className="discovery-card__guide-mark" aria-hidden="true">Aa<span>Words become stories.</span></div>
          <p className="discovery-card__source">Based on P. L. Hewer’s <em>A Basic Grammar of Kasem</em>. Source references stay with the guide.</p>
          <a className="discovery-card__link" href="/grammar-guide.html">Read the grammar guide <Icon name="arrow" size={18} /></a>
        </article>
      </div>
      {(word.status === 'error' || expression.status === 'error') && <button className="preview-retry" type="button" onClick={() => setRetry(value => value + 1)}>Retry language previews</button>}
      <div className="home-discovery__next"><span>New to Kasem? Take it a few minutes at a time.</span><Link to="learn">Follow the learning guide <Icon name="arrow" size={18} /></Link></div>
    </div>
  </section>;
}
