import { Button } from './Button';
import { PHOTOS } from '../../public/culture-photos.js';

const CARDS = [
  { title: 'Your everyday words have a place here.', status: 'Open campaign',
    body: 'Share one expression with its meaning, context and source. A Kasem-speaking reviewer checks it before publication. Free Google sign-in; this is a volunteer campaign.',
    photo: PHOTOS.editathon, to: 'contribute', action: 'See the task and review process' },
  { title: 'The source stays with the story.', status: 'Sources & permissions',
    body: 'Speakers, teachers and cultural custodians help care for shared knowledge. Read how attribution, review and permission guide the work.',
    photo: PHOTOS.decoration, to: 'impact-governance', action: 'Read how knowledge is cared for' },
  { title: 'Small contributions. A shared future.', status: 'Follow the progress',
    body: 'See the community’s progress toward its shared goals, explore the contribution categories, and find where you can help next.',
    photo: PHOTOS.compound, to: 'progress', action: 'Explore community progress' },
];

export function HomeScrollStories() {
  return <div className="home-scroll-stories" aria-label="Contribute, care for knowledge and follow progress">
    {CARDS.map((card, index) => <article key={card.to} className={`home-scroll-story home-scroll-story--${index + 1}`}>
      <div className="home-scroll-story__inner">
        <div className="home-scroll-story__copy">
          <span className="target-badge">{card.status}</span>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
          <Button to={card.to}>{card.action}</Button>
        </div>
        <figure className="home-scroll-story__photo">
          <img src={card.photo.image} srcSet={card.photo.srcset} sizes="(max-width: 850px) 92vw, 560px"
            width={card.photo.width} height={card.photo.height} alt={card.photo.alt} loading="lazy" decoding="async"
            style={{ objectPosition: card.photo.position }} />
          <figcaption>{card.photo.title} · {card.photo.place}. Photo: <a href={card.photo.source} target="_blank" rel="noreferrer">{card.photo.author}</a>, <a href={card.photo.licenceUrl} target="_blank" rel="noreferrer">{card.photo.licence}</a></figcaption>
        </figure>
      </div>
    </article>)}
  </div>;
}
