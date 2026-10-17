/** Renders Zem Ghana's profile artwork into assets/, and preview cards from today's live feeds into .tooling/. No credentials, no model calls. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { NEWS_CATEGORIES, newsCandidates, zemGhanaAvatarSvg, zemGhanaCoverSvg } from '../lib/community-news-policy.js';
import { fetchGhanaHeadlines, renderNewsCard } from '../lib/community-news.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fontFiles = ['Regular', 'Bold'].map(style => resolve(root, `services/functions/assets/fonts/NotoSans-${style}.ttf`));
const png = svg => new Resvg(svg, { font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Noto Sans' } }).render().asPng();

const art = resolve(root, 'assets/community-automation/zem-ghana');
await mkdir(art, { recursive: true });
await writeFile(resolve(art, 'avatar.png'), png(zemGhanaAvatarSvg()));
await writeFile(resolve(art, 'cover.png'), png(zemGhanaCoverSvg()));
console.log('Profile artwork saved under assets/community-automation/zem-ghana');

if (!process.argv.includes('--art-only')) {
  const out = resolve(root, '.tooling/zem-ghana');
  await mkdir(out, { recursive: true });
  const { items, sources } = await fetchGhanaHeadlines();
  const fresh = newsCandidates(items, new Date(), { ids: new Set(), titles: new Set() }, 6);
  for (const [i, item] of fresh.entries()) await writeFile(resolve(out, `card-${i + 1}.png`), renderNewsCard(item, NEWS_CATEGORIES[i % NEWS_CATEGORIES.length]));
  await writeFile(resolve(out, 'feeds.json'), JSON.stringify({ checkedAt: new Date().toISOString(), sources, candidates: fresh }, null, 2) + '\n');
  console.log(JSON.stringify({ sources, cards: fresh.map(item => `${item.sourceName}: ${item.title}`) }, null, 2));
}
