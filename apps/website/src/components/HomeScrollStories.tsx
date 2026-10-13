import { Button } from './Button';

const CARDS = [
  { step: '01 / Share your knowledge', title: 'Your everyday words have a place here.', status: 'Open campaign',
    body: 'Share one expression with its meaning, context and source. A Kasem-speaking reviewer checks it before publication. Free Google sign-in; this is a volunteer campaign.',
    image: 'header-participation.jpg', to: 'contribute', action: 'See the task and review process' },
  { step: '02 / Care for the record', title: 'The source stays with the story.', status: 'Sources & permissions',
    body: 'Speakers, teachers and cultural custodians help care for shared knowledge. Read how attribution, review and permission guide the work.',
    image: 'hero-home.jpg', to: 'impact-governance', action: 'Read how knowledge is cared for' },
  { step: '03 / Build together', title: 'Small contributions. A shared future.', status: 'Follow the progress',
    body: 'See the community’s progress toward its shared goals, explore the contribution categories, and find where you can help next.',
    image: 'header-stewardship.jpg', to: 'progress', action: 'Explore community progress' },
];

export function HomeScrollStories() {
  return <div className="home-scroll-stories" aria-label="Contribute, care for knowledge and follow progress">
    {CARDS.map((card, index) => <article key={card.to} className={`home-scroll-story home-scroll-story--${index + 1}`}>
      <div className="home-scroll-story__inner">
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
