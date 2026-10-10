import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { CorrespondenceLetter } from '@indigen-world/contracts/correspondence';
export interface Draft { id:string; revision:number; letter:CorrespondenceLetter; emailBody:string; updatedAt:string }
export interface Delivery { status:string; messageId?:string; pdfSha256?:string }
export interface LetterFiles { id:string; version:string; revision:number; filename:string; pdfSha256:string; links:{pdf:string;docx:string}; expiresAt:string; delivery:Delivery|null }
export interface Version { version:string; subject:string; createdAt:string; pdfSha256:string; delivery:Delivery|null }
export type CorrespondenceRequest =
  | {action:'list'}
  | {action:'save';id:string;revision:number;letter:CorrespondenceLetter;emailBody:string}
  | {action:'generate'|'print';id:string;revision:number}
  | {action:'history';id:string}
  | {action:'download';id:string;version:string}
  | {action:'send';id:string;version:string;revision:number;reviewed:true};
const call = httpsCallable<CorrespondenceRequest,unknown>(functions,'correspondence');
export async function correspondenceRequest<T>(request:CorrespondenceRequest):Promise<T> { return (await call(request)).data as T; }
