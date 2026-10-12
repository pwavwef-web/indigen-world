import { useEffect, useRef, useState } from 'react';
import { useSiteMotion } from '../features/motion/SiteMotion';
import { Button } from './Button';
import { SectionHeading } from './SectionHeading';

const STORIES = [
  { label: 'Project Kassena', title: 'A language. A living connection.',
    body: 'Starting with Kasem in northern Ghana, building with its speakers. Explore the project bringing language and cultural knowledge into digital spaces.',
    image: 'hero-home.jpg', to: 'project-kassena', action: 'Meet Project Kassena' },
  { label: 'The public dictionary', title: 'Find a word. Hear its story.',
    body: 'Browse published Kasem entries, meanings and context. Listen to pronunciations where recordings are available. No account needed to browse.',
    image: 'header-stewardship.jpg', to: 'dictionary', action: 'Explore the Kasem dictionary' },
  { label: 'Community contributions', title: 'Knowledge grows when we share it.',
    body: 'Share an everyday Kasem expression with its meaning, context and source. A Kasem-speaking reviewer checks it before publication.',
    image: 'header-participation.jpg', to: 'contribute', action: 'Share a Kasem expression' },
];

export function HomeCultureMap() {
  const { paused, reduced, toggle } = useSiteMotion();
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const root = useRef<HTMLElement>(null);
  const playing = visible && foreground && !paused && !reduced && !interacting && !focused;
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .25 });
    if (root.current) observer.observe(root.current);
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActive(value => (value + 1) % STORIES.length), 9000);
    return () => window.clearTimeout(timer);
  }, [active, playing]);
  function select(index: number) {
    const next = (index + STORIES.length) % STORIES.length;
    setActive(next);
    setAnnouncement(`${next + 1} of ${STORIES.length}: ${STORIES[next].title}`);
    if (!paused) toggle();
  }
  const story = STORIES[active];
  return <section ref={root} className="section section--white home-culture-map" id="kasena-spotlight" aria-label="Explore the Kasem pilot"
    data-playing={playing} data-active-story={active}
    onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="container">
      <SectionHeading eyebrow="Our starting point" title="A world of culture. A place to begin." body="Our first deep commitment is to Kasem in northern Ghana. Discover the project, explore the language, and find your way to contribute." />
      <div className="home-culture-map__layout">
        <div className="home-culture-map__geography">
          <img src="/images/culture/africa-ghana.svg" alt="Map of Africa highlighting Ghana, the starting point for the Kasem pilot" width="600" height="470" loading="lazy" />
          <div className="home-culture-map__map-note"><span>Kasem pilot</span><strong>Northern Ghana</strong></div>
          <p className="home-culture-map__map-credit">Map: Natural Earth · Location is indicative</p>
        </div>
        <div className="home-culture-map__stories">
          <div className="home-culture-map__tabs" role="group" aria-label="Explore the pilot">
            {STORIES.map((item, index) => <button key={item.to} type="button" aria-pressed={index === active} onClick={() => select(index)}>{['The project', 'The language', 'Take part'][index]}</button>)}
          </div>
          <article className="home-culture-map__story" key={story.to}>
            <img src={`/images/${story.image}`} alt="" width="600" height="240" loading="lazy" />
            <div className="home-culture-map__story-copy">
              <p className="eyebrow">{story.label}</p><h3>{story.title}</h3><p>{story.body}</p>
              <Button to={story.to}>{story.action}</Button>
            </div>
          </article>
          <div className="home-culture-map__controls" role="group" aria-label="Story navigation">
            <button type="button" onClick={() => select(active - 1)} aria-label="Previous story">←</button>
            <span>{String(active + 1).padStart(2, '0')} / 03</span>
            <button type="button" onClick={() => select(active + 1)} aria-label="Next story">→</button>
            {!reduced && <button type="button" className="home-culture-map__pause" onClick={toggle} aria-pressed={paused}>{paused ? 'Resume stories' : 'Pause stories'}</button>}
          </div>
          <p className="home-culture-map__note">Three ways into one pilot. Card artwork is illustrative.</p>
        </div>
      </div>
    </div>
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </section>;
}
