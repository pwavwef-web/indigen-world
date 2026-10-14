// Renders the existing Indigen World mark (assets/letterhead/indigen-world-logo.svg,
// the TribeStudio blue variant) to the PNG that emails embed. Gmail and Outlook
// do not display SVG, so mail needs a raster copy; 120 px is 3x the 40 px header.
//   node services/functions/scripts/build-email-logo.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const root = new URL('../', import.meta.url);
const svg = readFileSync(new URL('assets/letterhead/indigen-world-logo.svg', root), 'utf8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 120 } }).render().asPng();
mkdirSync(new URL('assets/email/', root), { recursive: true });
writeFileSync(new URL('assets/email/indigen-world-logo.png', root), png);
// The hosted copy serves provider-managed templates (Firebase Auth) that cannot attach images.
writeFileSync(new URL('../../apps/website/public/email/indigen-world-logo.png', root), png, { flag: 'w' });
console.log(`Wrote ${png.length} bytes.`);
