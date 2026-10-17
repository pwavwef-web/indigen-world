import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-indigen-upgrade', storageBucket: 'demo-indigen-upgrade.appspot.com' });
const { prepareCollectionRaster } = await import('../../services/functions/lib/collection-media.js');
const { probeMedia } = await import('../../services/functions/lib/video-editor/ffmpeg.js');
test('collection uploads decode real image bytes and produce bounded JPEG derivatives', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'collection-media-test-'));
  try {
    const prepared = await prepareCollectionRaster(path.resolve('apps/mobile/assets/places/paga-pond.jpg'), 'image/jpeg', dir);
    assert.ok(prepared.width >= 32); assert.ok(prepared.height >= 32);
    assert.ok((await probeMedia(prepared.outputs.display)).width <= 1600);
    assert.ok((await probeMedia(prepared.outputs.thumbnail)).width <= 480);
    await assert.rejects(prepareCollectionRaster(path.resolve('apps/mobile/assets/places/paga-pond.jpg'), 'image/png', dir), /do not match/);
    const fake = path.join(dir, 'renamed.png'); await writeFile(fake, '<svg><script>unsafe()</script></svg>');
    await assert.rejects(prepareCollectionRaster(fake, 'image/png', dir), /do not match/);
    await writeFile(fake, Buffer.concat([Buffer.from([255,216,255]),Buffer.from('not decodable')]));
    await assert.rejects(prepareCollectionRaster(fake, 'image/jpeg', dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
