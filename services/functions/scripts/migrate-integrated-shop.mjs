#!/usr/bin/env node
// Dry run by default. This script never downloads legacy external image URLs.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { priceMode, searchTokens } from '../lib/shop-policy.js';
const args = process.argv.slice(2), apply = args.includes('--apply');
const project = args.find((v) => v.startsWith('--project='))?.slice(10);
if (!project) throw new Error('Supply --project=<explicit-project-id>. Omit --apply to inspect the migration first.');
initializeApp({ projectId: project });
const db = getFirestore();
let cursor, scanned = 0, changed = 0;
do {
  let query = db.collection('shopProducts').orderBy('__name__').limit(200);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  for (const doc of page.docs) {
    scanned++;
    const value = doc.data();
    const patch = { schemaVersion: 2, priceMode: priceMode(value), kind: value.kind ?? 'physical', status: value.status ?? (value.published ? 'active' : 'draft'), createdAt: value.createdAt ?? value.updatedAt ?? '1970-01-01T00:00:00.000Z', searchTokens: searchTokens(`${value.name ?? ''} ${value.category ?? ''} ${value.maker ?? ''}`), gallery: value.gallery ?? (value.imageUrl ? [{ id: `legacy-${doc.id}`, url: value.imageUrl, alt: value.name ?? '', status: 'external', rights: '', credit: '' }] : []) };
    const differs = Object.entries(patch).some(([key, v]) => JSON.stringify(value[key]) !== JSON.stringify(v));
    if (differs) { changed++; if (apply) await doc.ref.set(patch, { merge: true }); }
    // Unknown historical stock must never be invented. Stock starts at zero;
    // staff enter an audited on-hand adjustment before checkout can reserve it.
    const variants = value.variants?.length ? value.variants : [{ id: 'default' }];
    for (const variant of variants) {
      const ref = db.collection('shopInventory').doc(`${doc.id}__${variant.id}`);
      if (apply && !(await ref.get()).exists) await ref.create({ productId: doc.id, name: value.name ?? doc.id, onHand: 0, reserved: 0, threshold: 3 });
    }
  }
  cursor = page.size === 200 ? page.docs.at(-1) : null;
} while (cursor);
// Historical shopOrders remain untouched. Their client totals are requests,
// never verified revenue; all new financial state lives in shopOrdersV2.
console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', productsScanned: scanned, productsChanged: changed, legacyOrders: 'untouched', externalImages: 'not-fetched' }, null, 2));
