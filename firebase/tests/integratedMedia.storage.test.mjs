import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-indigen-upgrade', firestore: { host: '127.0.0.1', port: 8280, rules: readFileSync('firebase/firestore.rules','utf8') }, storage: { host:'127.0.0.1', port:9299, rules:readFileSync('firebase/storage.rules','utf8') } });
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(),'collectionMediaAssets/12345678-1234-1234-1234-123456789abc'),{ownerUid:'media-admin',status:'uploading'}));
});
after(async () => env?.cleanup());
test('raw image uploads are admin-owned, immutable, private and cannot directly become public', async () => {
  const admin = env.authenticatedContext('media-admin',{role:'admin'}).storage(), other = env.authenticatedContext('other',{role:'admin'}).storage(), member = env.authenticatedContext('member').storage(), guest=env.unauthenticatedContext().storage();
  const path='collectionMediaRaw/media-admin/12345678-1234-1234-1234-123456789abc/original', bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  await assertFails(uploadBytes(ref(member,path),bytes,{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(other,path),bytes,{contentType:'image/png'}));
  await assertSucceeds(uploadBytes(ref(admin,path),bytes,{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(admin,path),bytes,{contentType:'image/png'}));
  await assertFails(deleteObject(ref(admin,path)));
  await assertFails(getBytes(ref(guest,path)));await assertFails(getBytes(ref(member,path)));
  await assertFails(uploadBytes(ref(admin,'public/collection-media/12345678-1234-1234-1234-123456789abc/display.jpg'),bytes,{contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(admin,path+'-svg'),bytes,{contentType:'image/svg+xml'}));
});
