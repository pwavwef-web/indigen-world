import { Button } from './Button';

const CARDS = [
  { step: '01 / Discover', title: 'Every word opens a door.', status: 'Live',
    body: 'Search published Kasem entries, read their meaning and context, and listen where a recording is available.',
    image: 'hero-home.jpg', to: 'dictionary', action: 'Open the dictionary' },
  { step: '02 / Contribute', title: 'Your everyday words have a place here.', status: 'Open now',
    body: 'Share an expression with its meaning, context and source. Every one is reviewed; approved ones are published as expressions.',
    image: 'header-participation.jpg', to: 'contribute', action: 'See the task and review process' },
  { step: '03 / Build together', title: 'Small contributions. A shared future.', status: 'Follow the progress',
    body: 'See the community’s progress toward its shared goals, explore the contribution categories, and find where you can help next.',
    image: 'header-stewardship.jpg', to: 'progress', action: 'Explore community progress' },
];

export function HomeScrollStories() {
  return <div className="home-scroll-stories" aria-label="Discover, contribute and follow progress">
    {CARDS.map((card, index) => <article key={card.to} className={`home-scroll-story home-scroll-story--${index + 1}`}>
      <div className="home-scroll-story__inner" data-reveal>
        <div className="home-scroll-story__copy">
          <p className="eyebrow">{card.step}</p><h3>{card.title}</h3>
          <span className="target-badge">{card.status}</span><p>{card.body}</p>
          <Button to={card.to}>{card.action}</Button>
        </div>
        <img src={`/images/${card.image}`} alt="" width="600" height="400" loading="lazy" />
      </div>
    </article>)}
  </div>;
}
