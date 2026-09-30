import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const source = new URL('./images/review-desk.svg', import.meta.url);
const output = new URL('./images/review-desk.png', import.meta.url);
writeFileSync(output, new Resvg(readFileSync(source), { font: { loadSystemFonts: true } }).render().asPng());
