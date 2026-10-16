import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quietUntil } from '../../services/functions/lib/notification-dispatch.js';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-indigen-upgrade', storageBucket: 'demo-indigen-upgrade.appspot.com' });
const { rasterMime } = await import('../../services/functions/lib/collection-media.js');
test('quiet hours cross midnight and respect DST in the selected time zone', () => {
  const preferences = { enabled: true, start: '22:00', end: '07:00', timeZone: 'Africa/Accra' };
  assert.equal(quietUntil(preferences, new Date('2026-10-16T23:00:00Z')), '2026-10-17T07:00:00.000Z');
  assert.equal(quietUntil(preferences, new Date('2026-10-16T15:00:00Z')), null);
  assert.equal(quietUntil({ ...preferences, timeZone: 'Europe/London' }, new Date('2026-10-24T23:00:00Z')), '2026-10-25T07:00:00.000Z');
  assert.equal(quietUntil({ ...preferences, timeZone: 'invalid-zone' }), null);
});
test('extension and declared MIME cannot make SVG, HTML or arbitrary bytes a raster image', () => {
  for (const text of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', '<html><script>alert(1)</script>', 'not a PNG', 'RIFF0000WAVE']) assert.equal(rasterMime(Buffer.from(text)), null);
  assert.equal(rasterMime(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(rasterMime(Buffer.from([255,216,255,0])), 'image/jpeg');
  assert.equal(rasterMime(Buffer.from('RIFF0000WEBP')), 'image/webp');
});
