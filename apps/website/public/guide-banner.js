import { CULTURE_PHOTOS as photos } from './culture-photos.js';

// Standalone guides share the original character ensemble and motion preference.
const root = document.querySelector('.culture-hero--guide');
if (root) {
  root.classList.add('culture-hero--illustrated');
  root.setAttribute('aria-label', 'Indigen World illustrated community banner');
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = '/culture-scene.css'; document.head.append(stylesheet);
  const atmosphere = document.createElement('div'); atmosphere.className = 'culture-atmosphere'; atmosphere.setAttribute('aria-hidden', 'true');
  atmosphere.innerHTML = '<span class="culture-cloud culture-cloud--one"></span><span class="culture-cloud culture-cloud--two"></span><svg class="culture-birds" viewBox="0 0 800 180"><path d="M90 90q12-16 24 0q12-16 24 0 M300 55q10-14 20 0q10-14 20 0 M560 115q14-18 28 0q14-18 28 0"/></svg><span class="culture-leaf culture-leaf--left"></span><span class="culture-leaf culture-leaf--right"></span>';
  root.prepend(atmosphere);
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
  controls.setAttribute('aria-label', 'Illustrated scene controls');
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
  const prev = button('Previous scene', '←', () => step(-1));
  const dots = create('div', 'culture-hero__dots');
  const choices = photos.map((photo, index) => {
    const choice = button(`Show scene ${index + 1}: ${photo.title}`, '', () => select(index));
    choice.append(document.createElement('span')); dots.append(choice); return choice;
  });
  const next = button('Next scene', '→', () => step(1));
  const pause = button('Pause animations', 'Pause animations', () => document.querySelector('.standalone-motion-control')?.click());
  pause.className = 'culture-hero__pause';
  controls.append(prev, dots, next, pause);
  const slides = photos.map((photo, index) => {
    const img = document.createElement('img');
    img.dataset.scene = photo.id;
    img.alt = ''; img.width = photo.width; img.height = photo.height;
    img.style.setProperty('--photo-position', photo.position);
    img.fetchPriority = index === 0 ? 'high' : 'low'; img.decoding = 'async';
    img.addEventListener('load', () => { ready.add(index); update(); });
    img.src = photo.image;
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
      const credit = create('p', 'culture-hero__credit', 'Original Indigen World illustration · AI-generated · Fictional characters');
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
