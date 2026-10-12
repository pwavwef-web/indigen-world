/** Public website presentation only; source wording and the other apps stay intact. */
export function publicGuideLayout(html) {
  return html.replace('</head><body>', '<link rel="stylesheet" href="/scroll-cards.css"><link rel="stylesheet" href="/culture-banner.css"><script type="module" src="/scroll-cards.js"></script><script type="module" src="/guide-banner.js"></script></head><body data-standalone-cards>')
    .replace(/<main>(<nav[^>]*>[\s\S]*?<\/nav>)(<h1>[\s\S]*?<\/h1>)(<p>[\s\S]*?<\/p>)/,
      (_, nav, title, intro) => `<div class="guide-site-nav"><a href="/">Indigen World</a>${nav}</div><section class="culture-hero culture-hero--embedded culture-hero--guide" aria-label="Indigen World cultural photographs"><div class="culture-hero__images" aria-hidden="true"></div><div class="container culture-hero__content"><div class="culture-hero__copy"><p class="eyebrow">Learn & explore · Kasem reference</p>${title}${intro}<a class="guide-reading-link" href="#rules">Explore the rules ↓</a></div></div><div class="container culture-hero__footer"></div></section><main>`);
}
