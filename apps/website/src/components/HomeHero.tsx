import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSiteMotion } from '../features/motion/SiteMotion';

import { CULTURE_PHOTOS as PHOTOS } from '../../public/culture-photos.js';


/** Stable page content over an original illustrated community and layered scenery. */
export function CultureHero({ children, variant = 'page', className = '', id = 'top' }: {
  children: ReactNode; variant?: 'home' | 'page' | 'embedded' | 'compact'; className?: string; id?: string;
}) {
  const { paused, reduced, toggle } = useSiteMotion();
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState<number[]>([]);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const root = useRef<HTMLElement>(null);
  const playing = visible && foreground && !paused && !reduced && !hovered && !focused;
  const photo = PHOTOS[active];

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
    }, 8000);
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

  return <section ref={root} className={`culture-hero culture-hero--illustrated culture-hero--${variant} ${className}`} id={id} aria-label="Indigen World illustrated community banner"
    data-playing={playing} data-active-slide={active}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="culture-atmosphere" aria-hidden="true"><span className="culture-cloud culture-cloud--one" /><span className="culture-cloud culture-cloud--two" />
      <svg className="culture-birds" viewBox="0 0 800 180"><path d="M90 90q12-16 24 0q12-16 24 0 M300 55q10-14 20 0q10-14 20 0 M560 115q14-18 28 0q14-18 28 0" /></svg>
      <span className="culture-leaf culture-leaf--left" /><span className="culture-leaf culture-leaf--right" />
    </div>
    <div className="culture-hero__images" aria-hidden="true">
      {PHOTOS.map((item, index) => <img key={item.id} data-scene={item.id}
        className={index === active && ready.includes(index) ? 'is-active' : ''}
        src={item.image}
        sizes="100vw" width={item.width} height={item.height} alt=""
        fetchPriority={index === 0 ? 'high' : 'low'} decoding="async"
        onLoad={() => setReady(current => current.includes(index) ? current : [...current, index])}
        style={{ '--photo-position': item.position, animationPlayState: playing ? 'running' : 'paused' } as CSSProperties}
      />)}
    </div>
    <div className="container culture-hero__content">{children}</div>
    <div className="container culture-hero__footer">
      <div className="culture-hero__caption">
        <p className="culture-hero__location">{ready.includes(active) ? photo.place : 'Language, stories and shared knowledge'}</p>
        <p className="culture-hero__photo-title">{ready.includes(active) ? photo.title : 'Indigen World'}</p>
        {ready.includes(active) && <p className="culture-hero__credit">
          Original Indigen World illustration · AI-generated · Fictional characters
        </p>}
        <span className="sr-only">{ready.includes(active) ? photo.alt : ''}</span>
      </div>
      <div className="culture-hero__controls" role="group" aria-label="Illustrated scene controls">
        <button type="button" className="culture-hero__arrow" onClick={() => step(-1)} aria-label="Previous scene" disabled={ready.length < 2}>←</button>
        <div className="culture-hero__dots" role="group" aria-label="Choose a scene">
          {PHOTOS.map((item, index) => <button key={item.id} type="button" aria-label={`Show scene ${index + 1}: ${item.title}`}
            aria-pressed={active === index} disabled={!ready.includes(index)} onClick={() => select(index)}><span /></button>)}
        </div>
        <button type="button" className="culture-hero__arrow" onClick={() => step(1)} aria-label="Next scene" disabled={ready.length < 2}>→</button>
        {!reduced && <button type="button" className="culture-hero__pause" aria-pressed={paused} onClick={toggle}>
          <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span> {paused ? 'Resume animations' : 'Pause animations'}
        </button>}
      </div>
    </div>
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </section>;
}

export function HomeHero({ children }: { children: ReactNode }) {
  return <CultureHero variant="home">{children}</CultureHero>;
}
