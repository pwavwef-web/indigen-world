// Local email preview gallery. Renders every template with synthetic fixtures
// to output/email-previews/: one HTML and one plain-text file per variant, a
// forced-dark copy, and index.html showing desktop, mobile and dark side by side.
// Nothing is sent. Build Functions first:
//   npm run preview:email
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fixtures } from './email-fixtures.mjs';

const out = new URL('../../../output/email-previews/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(new URL('../assets/email/indigen-world-logo.png', import.meta.url), new URL('indigen-world-logo.png', out));

const escape = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// The inline CID and the hosted logo both point at the local copy in previews.
const local = (html) => html
  .replaceAll('cid:indigen-world-logo', 'indigen-world-logo.png')
  .replaceAll('https://indigenworld.com/email/indigen-world-logo.png', 'indigen-world-logo.png');
// Forced dark: the client's dark media query applies unconditionally.
const dark = (html) => html.replace('@media (prefers-color-scheme: dark)', '@media all');

const rows = [];
let group = '';
for (const [id, section, label, content, note] of fixtures) {
  writeFileSync(new URL(`${id}.html`, out), local(content.html));
  writeFileSync(new URL(`${id}.dark.html`, out), dark(local(content.html)));
  writeFileSync(new URL(`${id}.txt`, out), content.text);
  const kb = (Buffer.byteLength(content.html) / 1024).toFixed(1);
  if (section !== group) { rows.push(`<h2>${escape(section)}</h2>`); group = section; }
  rows.push(`<section id="${id}">
  <h3>${escape(label)}</h3>
  <p class="meta"><b>Subject:</b> ${escape(content.subject)} &nbsp;·&nbsp; <b>HTML:</b> ${kb} KB${note ? ` &nbsp;·&nbsp; ${escape(note)}` : ''}</p>
  <div class="views">
    <figure><figcaption>Desktop · 640 px</figcaption><iframe src="${id}.html" width="640" height="900" title="${escape(label)} desktop"></iframe></figure>
    <figure><figcaption>Mobile · 375 px</figcaption><iframe src="${id}.html" width="375" height="900" title="${escape(label)} mobile"></iframe></figure>
    <figure><figcaption>Dark appearance · 375 px</figcaption><iframe src="${id}.dark.html" width="375" height="900" title="${escape(label)} dark"></iframe></figure>
    <figure class="text"><figcaption>Plain text · <a href="${id}.txt">${id}.txt</a></figcaption><pre>${escape(content.text)}</pre></figure>
  </div>
</section>`);
}

writeFileSync(new URL('index.html', out), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email previews · Indigen World</title>
<style>
  body { margin: 0; padding: 24px 16px 64px; background: #e9eef6; color: #243247; font: 15px/1.5 -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif; }
  header, h2, section { max-width: 1760px; margin-inline: auto; }
  h1 { margin: 0 0 4px; color: #102a56; } h2 { margin-top: 48px; color: #102a56; border-bottom: 1px solid #c9d4e5; padding-bottom: 6px; }
  h3 { margin: 28px 0 4px; } .meta { margin: 0 0 12px; color: #536176; font-size: 13px; }
  .views { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; padding-bottom: 8px; }
  figure { margin: 0; flex: none; } figcaption { font-size: 12px; color: #536176; margin-bottom: 4px; }
  iframe { border: 1px solid #c9d4e5; border-radius: 8px; background: #fff; }
  .text pre { width: 360px; height: 880px; margin: 0; overflow: auto; white-space: pre-wrap; background: #fff; border: 1px solid #c9d4e5; border-radius: 8px; padding: 10px; font: 12px/1.5 ui-monospace, Consolas, monospace; }
</style></head><body>
<header><h1>Indigen World email previews</h1>
<p>Synthetic fixtures only. These are browser previews. They are not email-client tests. Dark views force the theme's dark rules; real clients may also apply their own colour inversion.</p></header>
${rows.join('\n')}
</body></html>`);
console.log(`Wrote ${fixtures.length} previews to ${out.pathname}`);
