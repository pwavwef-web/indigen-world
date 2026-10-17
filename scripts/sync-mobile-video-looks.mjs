import { readFileSync, writeFileSync } from 'node:fs';
import { lookFilter, LOOK_OPS } from '../services/functions/lib/video-editor/looks.js';
const target = new URL('../apps/mobile/lib/features/video_editor/video_looks.g.dart', import.meta.url);
const matrices = {};
for (const look of Object.keys(LOOK_OPS)) {
  const filter = lookFilter(look), channels = ['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb'];
  const m = filter ? channels.map((c) => Number(new RegExp(`${c}=(-?[0-9.]+)`).exec(filter)?.[1] ?? 0)) : [1,0,0,0,1,0,0,0,1];
  const affine = /val\*([0-9.]+).*?0\.5\)\*([0-9.]+)/.exec(filter), brightness = Number(affine?.[1] ?? 1), contrast = Number(affine?.[2] ?? 1), bias = 127.5 * (1 - contrast);
  matrices[look] = [m[0]*brightness*contrast,m[1]*brightness*contrast,m[2]*brightness*contrast,0,bias,m[3]*brightness*contrast,m[4]*brightness*contrast,m[5]*brightness*contrast,0,bias,m[6]*brightness*contrast,m[7]*brightness*contrast,m[8]*brightness*contrast,0,bias,0,0,0,1,0].map((v) => Number(v.toFixed(6)));
}
const source = '// Generated from the shared render worker look operations.\n// Run node scripts/sync-mobile-video-looks.mjs after changing looks.\nconst videoLookMatrices = <String, List<double>>{\n' + Object.entries(matrices).map(([name, values]) => `  '${name}': [\n${values.map((v) => `    ${Number.isInteger(v) ? `${v}.0` : v},`).join('\n')}\n  ],`).join('\n') + '\n};\n';
if (process.argv.includes('--check')) { if (readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== source) throw new Error('Flutter video looks differ from the renderer. Regenerate them.'); }
else writeFileSync(target, source);
