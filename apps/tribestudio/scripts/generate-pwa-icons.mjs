import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');
const inner = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
if (!inner) throw new Error('Could not read the TribeStudio SVG mark');

const output = resolve(root, 'public/icons');
mkdirSync(output, { recursive: true });

function icon(file, size, maskable = false) {
  const content = maskable
    ? `<g transform="translate(96 96) scale(5)">${inner}</g>`
    : inner;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maskable ? 512 : 64} ${maskable ? 512 : 64}">
    <rect width="100%" height="100%" fill="#101c36" />${content}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(resolve(output, file), png);
}

icon('icon-192.png', 192);
icon('icon-512.png', 512);
icon('icon-maskable-512.png', 512, true);
icon('apple-touch-icon.png', 180);
