import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSiteMotion } from '../features/motion/SiteMotion';
import { Icon } from './Icon';

import { CULTURE_PHOTOS as PHOTOS } from '../../public/culture-photos.js';

const SLIDE_MS = 7000;

/** The homepage opens on the dancers; every other route opens on its own photograph. */
function startFor(path: string) {
  if (path === '/') return 0;
  let hash = 0;
  for (const character of path) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % PHOTOS.length;
}

/**
 * Stable page content over a carousel of real Kassena photographs. Each slide
 * names its place, photographer, licence and source while it is on screen.
 * Slides only advance to images that have loaded, and motion stops while the
 * banner is off screen, hovered, focused, paused or reduced.
 */
export function CultureHero({ children, variant = 'page', className = '', id = 'top' }: {
  children: ReactNode; variant?: 'home' | 'page' | 'embedded' | 'compact'; className?: string; id?: string;
}) {
  const { paused, reduced, toggle } = useSiteMotion();
  const [start] = useState(() => startFor(window.location.pathname));
  const [active, setActive] = useState(start);
  const [ready, setReady] = useState<number[]>([]);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const root = useRef<HTMLElement>(null);
  const playing = visible && foreground && !paused && !reduced && !hovered && !focused;
  const photo = PHOTOS[active];
  const shown = ready.includes(active);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    if (root.current) observer.observe(root.current);
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      // Do not replace a usable image with one that is still downloading or failed.
      for (let offset = 1; offset < PHOTOS.length; offset++) {
        const next = (active + offset) % PHOTOS.length;
        if (ready.includes(next)) { setActive(next); break; }
      }
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [active, playing, ready]);

  const select = (index: number) => {
    if (!ready.includes(index)) return;
    setActive(index);
    setAnnouncement(`${index + 1} of ${PHOTOS.length}: ${PHOTOS[index].title}. ${PHOTOS[index].place}.`);
    if (!paused) toggle();
  };
  const step = (direction: number) => {
    for (let offset = 1; offset < PHOTOS.length; offset++) {
      const next = (active + direction * offset + PHOTOS.length) % PHOTOS.length;
      if (ready.includes(next)) { select(next); break; }
    }
  };

  return <section ref={root} className={`culture-hero culture-hero--${variant} ${className}`} id={id} aria-label="Photographs of Kassena places and people"
    data-playing={playing} data-active-slide={active}
    style={{ '--slide-ms': `${SLIDE_MS}ms` } as CSSProperties}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="culture-hero__images" aria-hidden="true">
      {PHOTOS.map((item, index) => <img key={item.id} data-scene={item.id}
        className={index === active && ready.includes(index) ? 'is-active' : ''}
        src={item.image} srcSet={item.srcset}
        sizes="100vw" width={item.width} height={item.height} alt=""
        fetchPriority={index === start ? 'high' : 'low'} loading={index === start ? 'eager' : 'lazy'} decoding="async"
        onLoad={() => setReady(current => current.includes(index) ? current : [...current, index])}
        style={{ '--photo-position': item.position, animationPlayState: playing ? 'running' : 'paused' } as CSSProperties}
      />)}
    </div>
    <div className="container culture-hero__content">{children}</div>
    <div className="container culture-hero__footer">
      <div className="culture-hero__caption">
        <p className="culture-hero__location">{shown ? photo.place : 'Kassena country'}</p>
        <p className="culture-hero__photo-title">{shown ? photo.title : 'Language, stories and shared knowledge'}</p>
        {shown && <p className="culture-hero__credit">
          Photo: <a href={photo.source} target="_blank" rel="noreferrer">{photo.author}</a>
          <span aria-hidden="true"> · </span>
          <a href={photo.licenceUrl} target="_blank" rel="noreferrer">{photo.licence}</a>
          <span className="culture-hero__credit-source"> · Wikimedia Commons</span>
        </p>}
        <span className="sr-only">{shown ? photo.alt : ''}</span>
      </div>
      <div className="culture-hero__controls" role="group" aria-label="Photograph controls">
        <div className="culture-hero__dots" role="group" aria-label="Choose a photograph">
          {PHOTOS.map((item, index) => <button key={item.id} type="button" aria-label={`Show photograph ${index + 1}: ${item.title}`}
            aria-pressed={active === index} disabled={!ready.includes(index)} onClick={() => select(index)}>
            <span className="culture-hero__dot-label">{item.label}</span>
            <span className="culture-hero__dot-track"><span key={active === index ? `on-${active}` : 'off'} /></span>
          </button>)}
        </div>
        <div className="culture-hero__buttons">
          <button type="button" className="culture-hero__arrow culture-hero__arrow--back" onClick={() => step(-1)} aria-label="Previous photograph" disabled={ready.length < 2}><Icon name="arrow" size={18} /></button>
          <button type="button" className="culture-hero__arrow" onClick={() => step(1)} aria-label="Next photograph" disabled={ready.length < 2}><Icon name="arrow" size={18} /></button>
          {!reduced && <button type="button" className="culture-hero__pause" aria-pressed={paused} onClick={toggle}
            aria-label={paused ? 'Resume animations' : 'Pause animations'}>
            <Icon name={paused ? 'play' : 'pause'} size={16} /><span>{paused ? 'Play' : 'Pause'}</span>
          </button>}
        </div>
      </div>
    </div>
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </section>;
}

export function HomeHero({ children }: { children: ReactNode }) {
  return <CultureHero variant="home">{children}</CultureHero>;
}
