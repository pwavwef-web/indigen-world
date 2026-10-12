import { CULTURE_PHOTOS as photos } from './culture-photos.js';

// The book guides are standalone HTML. Use the same photographs, timing,
// credits and site preference without loading the React application.
const root = document.querySelector('.culture-hero--guide');
if (root) {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const images = root.querySelector('.culture-hero__images');
  const footer = root.querySelector('.culture-hero__footer');
  const create = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const caption = create('div', 'culture-hero__caption');
  const controls = create('div', 'culture-hero__controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Cultural photograph controls');
  const announcement = create('span', 'sr-only');
  announcement.setAttribute('aria-live', 'polite');
  footer.append(caption, controls, announcement);
  let active = 0, visible = false, hovered = false, focused = false, timer;
  let captionKey;
  const ready = new Set();
  const button = (label, text, action) => {
    const el = create('button', '', text);
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
  const prev = button('Previous photograph', '←', () => step(-1));
  const dots = create('div', 'culture-hero__dots');
  const choices = photos.map((photo, index) => {
    const choice = button(`Show photograph ${index + 1}: ${photo.title}`, '', () => select(index));
    choice.append(document.createElement('span')); dots.append(choice); return choice;
  });
  const next = button('Next photograph', '→', () => step(1));
  const pause = button('Pause animations', 'Pause animations', () => document.querySelector('.standalone-motion-control')?.click());
  pause.className = 'culture-hero__pause';
  controls.append(prev, dots, next, pause);
  const slides = photos.map((photo, index) => {
    const img = document.createElement('img');
    img.alt = ''; img.width = photo.width; img.height = photo.height;
    img.style.setProperty('--photo-position', photo.position);
    img.fetchPriority = index === 0 ? 'high' : 'low'; img.decoding = 'async';
    img.addEventListener('load', () => { ready.add(index); update(); });
    img.srcset = `/images/culture/${photo.id}-800.webp 800w, /images/culture/${photo.id}-${photo.width}.webp ${photo.width}w`;
    img.sizes = '100vw'; img.src = `/images/culture/${photo.id}-${photo.width}.webp`;
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
    pause.textContent = paused ? 'Resume animations' : 'Pause animations';
    pause.setAttribute('aria-label', pause.textContent); pause.setAttribute('aria-pressed', String(paused));
    const photo = photos[active];
    const currentCaption = `${active}:${ready.has(active)}`;
    if (captionKey !== currentCaption) {
    captionKey = currentCaption;
    caption.replaceChildren(create('p', 'culture-hero__location', ready.has(active) ? photo.place : 'Language, stories and shared knowledge'), create('p', 'culture-hero__photo-title', ready.has(active) ? photo.title : 'Indigen World'));
    if (ready.has(active)) {
      const credit = create('p', 'culture-hero__credit', 'Photo: ');
      const source = create('a', '', photo.author); source.href = `https://commons.wikimedia.org/wiki/File:${photo.source}`;
      const license = create('a', '', 'CC BY-SA 4.0'); license.href = 'https://creativecommons.org/licenses/by-sa/4.0/';
      for (const link of [source, license]) { link.target = '_blank'; link.rel = 'noreferrer'; }
      credit.append(source, ' · ', license, ' · Resized and cropped for display');
      caption.append(credit, create('span', 'sr-only', photo.alt));
    }
    }
    if (playing) timer = setTimeout(() => {
      for (let offset = 1; offset < photos.length; offset++) {
        const candidate = (active + offset) % photos.length;
        if (ready.has(candidate)) { active = candidate; break; }
      }
      update();
    }, 8000);
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
