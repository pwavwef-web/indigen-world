import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { CONTRIBUTOR_CALL_OPTIONS, guarded } from './contributor-common.js';
import { consumeRateLimit } from './rate-limit.js';
import { generateLetterFiles, letterVersion, sha256 } from './correspondence-render.js';
import { normalizeLetter, bodyPlainText, HERITAGE_FRAME } from '@indigen-world/contracts/correspondence';
import { SMTP_PASSWORD, sendMailWithLetter } from './email.js';
import { correspondenceEmail } from './email-templates.js';

const identifier = (value: unknown) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new HttpsError('invalid-argument','Choose a valid draft or version.');
  return value;
};
const timestamp = () => new Date().toISOString();
function validatedLetter(input: unknown, draft = false) {
  try { return normalizeLetter(input,{draft}); }
  catch (error) { throw new HttpsError('invalid-argument',error instanceof Error ? error.message : 'Invalid letter.'); }
}

/** Shared portal/assistant boundary. Print returns both formats without sending. */
export const correspondence = onCall({...CONTRIBUTOR_CALL_OPTIONS,secrets:[SMTP_PASSWORD],timeoutSeconds:120,memory:'512MiB',concurrency:1},guarded('correspondence',async req=>{
  const uid = requireAuth(req); requireRole(req,'admin');
  const data = req.data || {}, db = getFirestore(), root = db.collection(`correspondenceDrafts/${uid}/drafts`);
  if (data.action === 'list') {
    const docs = await root.orderBy('updatedAt','desc').limit(50).get();
    return {drafts:docs.docs.map(d=>({id:d.id,...d.data()})),designVersion:HERITAGE_FRAME.version};
  }
  const id = identifier(data.id), ref = root.doc(id);
  if (data.action === 'save') {
    const letter = validatedLetter(data.letter,true), emailBody = typeof data.emailBody === 'string' ? data.emailBody : '';
    if (emailBody.length > 30000) throw new HttpsError('invalid-argument','The email introduction is too long.');
    const revision = await db.runTransaction(async tx=>{
      const snap = await tx.get(ref), current = snap.get('revision') || 0;
      if (data.revision !== current) throw new HttpsError('aborted','This draft changed in another window. Reload it before saving.');
      tx.set(ref,{letter,emailBody,revision:current+1,updatedAt:timestamp(),owner:uid}); return current+1;
    });
    return {id,revision};
  }
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found','Save the draft first.');
  const letter = validatedLetter(snap.get('letter'),true);
  if (data.action === 'generate' || data.action === 'print') {
    validatedLetter(letter);
    await consumeRateLimit('correspondenceGenerate',uid,30,60*60_000);
    if (snap.get('revision') !== data.revision) throw new HttpsError('aborted','The draft changed. Save and generate it again.');
    const version = letterVersion(letter,snap.get('emailBody') || ''), versionRef = ref.collection('versions').doc(version);
    if (!(await versionRef.get()).exists) {
      let files;
      try { files = await generateLetterFiles(letter); }
      catch (error) { throw new HttpsError('failed-precondition',`Documents could not be generated. Your draft is saved; correct the problem and retry. ${error instanceof Error ? error.message : ''}`); }
      const paths = {pdf:`correspondence/${uid}/${id}/${version}/${files.filename}.pdf`,docx:`correspondence/${uid}/${id}/${version}/${files.filename}.docx`},bucket = getStorage().bucket();
      for (const kind of ['pdf','docx'] as const) await bucket.file(paths[kind]).save(files[kind],{resumable:false,contentType:kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',preconditionOpts:{ifGenerationMatch:0},metadata:{cacheControl:'private, no-store'}}).catch(error=>{if (Number(error.code) !== 412) throw error;});
      const [storedPdf] = await bucket.file(paths.pdf).download(), [storedDocx] = await bucket.file(paths.docx).download();
      try { await versionRef.create({letter,emailBody:snap.get('emailBody') || '',revision:snap.get('revision'),version,filename:files.filename,paths,pdfSha256:sha256(storedPdf),docxSha256:sha256(storedDocx),designVersion:files.designVersion,generatorVersion:files.generatorVersion,createdAt:timestamp()}); }
      catch (error) { if (Number((error as {code?:number}).code) !== 6) throw error; }
    }
    return downloadVersion(uid,id,version);
  }
  if (data.action === 'history') {
    const docs = await ref.collection('versions').orderBy('createdAt','desc').limit(50).get();
    return {versions:docs.docs.map(d=>{const v=d.data();return {version:d.id,subject:v.letter.subject,createdAt:v.createdAt,pdfSha256:v.pdfSha256,delivery:v.delivery || null};})};
  }
  const version = identifier(data.version), versionRef = ref.collection('versions').doc(version), versionSnap = await versionRef.get();
  if (!versionSnap.exists) throw new HttpsError('not-found','Generate the documents first.');
  if (data.action === 'download') return downloadVersion(uid,id,version);
  if (data.action === 'send') {
    await consumeRateLimit('correspondenceSend',uid,30,60*60_000);
    if (data.reviewed !== true || data.revision !== snap.get('revision') || version !== letterVersion(letter,snap.get('emailBody') || '')) throw new HttpsError('failed-precondition','Review the current draft and generate its documents before sending.');
    const formal = validatedLetter(versionSnap.get('letter'));
    if (!formal.recipient.email) throw new HttpsError('invalid-argument','Add the recipient email to send this letter.');
    const [pdf] = await getStorage().bucket().file(versionSnap.get('paths.pdf')).download();
    const text = versionSnap.get('emailBody') || [formal.salutation,bodyPlainText(formal.body),formal.closing,formal.sender.name,formal.sender.role].filter(Boolean).join('\n\n');
    const content = correspondenceEmail({subject:formal.subject,text});
    const result = (await sendMailWithLetter({to:formal.recipient.email,subject:formal.subject,text:content.text,html:content.html,letter:formal,deliveryKey:`correspondence:${uid}:${id}:${version}`},{pdf,path:versionSnap.get('paths.pdf'),pdfSha256:versionSnap.get('pdfSha256')}))[0];
    await versionRef.update({delivery:{...result,updatedAt:timestamp()}});
    if (result.status === 'preparation_failed') throw new HttpsError('failed-precondition','PDF attachment preparation failed. Nothing was sent. Your draft is saved; retry sending.');
    if (result.status === 'not_configured') throw new HttpsError('failed-precondition','Email is not configured on this server. The documents and draft are saved.');
    return {delivery:result};
  }
  throw new HttpsError('invalid-argument','Choose save, list, generate, print, download, history or send.');
}));
async function downloadVersion(uid:string,id:string,version:string) {
  const snap = await getFirestore().doc(`correspondenceDrafts/${uid}/drafts/${id}/versions/${version}`).get();
  if (!snap.exists) throw new HttpsError('not-found','This document version does not exist.');
  const value=snap.data()!,expires=Date.now()+10*60_000,bucket=getStorage().bucket(),links:Record<string,string>={};
  for (const kind of ['pdf','docx']) {
    const [url]=await bucket.file(value.paths[kind]).getSignedUrl({action:'read',expires,responseDisposition:`inline; filename="${value.filename}.${kind}"`}); links[kind]=url;
  }
  return {id,version,revision:value.revision,filename:value.filename,pdfSha256:value.pdfSha256,links,expiresAt:new Date(expires).toISOString(),delivery:value.delivery || null};
}
