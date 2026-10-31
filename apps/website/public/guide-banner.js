import { CULTURE_PHOTOS as photos } from './culture-photos.js';

// Standalone guides share the site's Kassena photographs, credits and motion preference.
const SLIDE_MS = 7000;
const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const root = document.querySelector('.culture-hero--guide');
if (root) {
  root.setAttribute('aria-label', 'Photographs of Kassena places and people');
  root.style.setProperty('--slide-ms', `${SLIDE_MS}ms`);
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const images = root.querySelector('.culture-hero__images');
  const footer = root.querySelector('.culture-hero__footer');
  const create = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const link = (href, text) => {
    const el = create('a', '', text);
    el.href = href; el.target = '_blank'; el.rel = 'noreferrer'; return el;
  };
  const caption = create('div', 'culture-hero__caption');
  const controls = create('div', 'culture-hero__controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Photograph controls');
  const announcement = create('span', 'sr-only');
  announcement.setAttribute('aria-live', 'polite');
  footer.append(caption, controls, announcement);
  let active = 0, visible = false, hovered = false, focused = false, timer;
  let captionKey;
  const ready = new Set();
  const button = (label, className, action) => {
    const el = create('button', className);
    el.type = 'button'; el.setAttribute('aria-label', label);
    el.addEventListener('click', action); return el;
  };
  const select = index => {
    if (!ready.has(index)) return;
    active = index;
    announcement.textContent = `${index + 1} of ${photos.length}: ${photos[index].title}. ${photos[index].place}.`;
    // Let the guide's existing preference controller own storage and scroll effects.
    if (document.body.dataset.motionPaused !== 'true') document.querySelector('.standalone-motion-control')?.click();
    update();
  };
  const step = direction => {
    for (let offset = 1; offset < photos.length; offset++) {
      const next = (active + offset * direction + photos.length) % photos.length;
      if (ready.has(next)) { select(next); break; }
    }
  };
  const dots = create('div', 'culture-hero__dots');
  dots.setAttribute('role', 'group'); dots.setAttribute('aria-label', 'Choose a photograph');
  const choices = photos.map((photo, index) => {
    const choice = button(`Show photograph ${index + 1}: ${photo.title}`, '', () => select(index));
    const track = create('span', 'culture-hero__dot-track');
    track.append(document.createElement('span'));
    choice.append(create('span', 'culture-hero__dot-label', photo.label), track);
    dots.append(choice); return choice;
  });
  const buttons = create('div', 'culture-hero__buttons');
  const prev = button('Previous photograph', 'culture-hero__arrow culture-hero__arrow--back', () => step(-1));
  const next = button('Next photograph', 'culture-hero__arrow', () => step(1));
  prev.innerHTML = next.innerHTML = ARROW;
  const pause = button('Pause animations', 'culture-hero__pause', () => document.querySelector('.standalone-motion-control')?.click());
  buttons.append(prev, next, pause);
  controls.append(dots, buttons);
  const slides = photos.map((photo, index) => {
    const img = document.createElement('img');
    img.dataset.scene = photo.id;
    img.alt = ''; img.width = photo.width; img.height = photo.height;
    img.style.setProperty('--photo-position', photo.position);
    img.fetchPriority = index === 0 ? 'high' : 'low'; img.decoding = 'async';
    img.addEventListener('load', () => { ready.add(index); update(); });
    img.sizes = '100vw'; img.srcset = photo.srcset; img.src = photo.image;
    images.append(img); return img;
  });
  function update() {
    clearTimeout(timer);
    const paused = document.body.dataset.motionPaused === 'true';
    const playing = visible && !paused && !query.matches && !document.hidden && !hovered && !focused;
    root.dataset.playing = String(playing); root.dataset.activeSlide = String(active);
    slides.forEach((img, index) => { img.classList.toggle('is-active', index === active && ready.has(index)); img.style.animationPlayState = playing ? 'running' : 'paused'; });
    choices.forEach((choice, index) => { choice.disabled = !ready.has(index); choice.setAttribute('aria-pressed', String(index === active)); });
    prev.disabled = next.disabled = ready.size < 2;
    pause.hidden = query.matches;
    pause.textContent = paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-label', paused ? 'Resume animations' : 'Pause animations'); pause.setAttribute('aria-pressed', String(paused));
    const photo = photos[active];
    const currentCaption = `${active}:${ready.has(active)}`;
    if (captionKey !== currentCaption) {
      captionKey = currentCaption;
      caption.replaceChildren(create('p', 'culture-hero__location', ready.has(active) ? photo.place : 'Kassena country'), create('p', 'culture-hero__photo-title', ready.has(active) ? photo.title : 'Language, stories and shared knowledge'));
      if (ready.has(active)) {
        const credit = create('p', 'culture-hero__credit', 'Photo: ');
        credit.append(link(photo.source, photo.author), ' · ', link(photo.licenceUrl, photo.licence), ' · Wikimedia Commons');
        caption.append(credit, create('span', 'sr-only', photo.alt));
      }
    }
    if (playing) timer = setTimeout(() => {
      for (let offset = 1; offset < photos.length; offset++) {
        const candidate = (active + offset) % photos.length;
        if (ready.has(candidate)) { active = candidate; break; }
      }
      update();
    }, SLIDE_MS);
  }
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: .1 });
  observer.observe(root);
  const preference = new MutationObserver(update);
  preference.observe(document.body, { attributes: true, attributeFilter: ['data-motion-paused'] });
  root.addEventListener('mouseenter', () => { hovered = true; update(); });
  root.addEventListener('mouseleave', () => { hovered = false; update(); });
  root.addEventListener('focusin', () => { focused = true; update(); });
  root.addEventListener('focusout', event => { focused = root.contains(event.relatedTarget); update(); });
  document.addEventListener('visibilitychange', update);
  query.addEventListener('change', update);
  update();
}
