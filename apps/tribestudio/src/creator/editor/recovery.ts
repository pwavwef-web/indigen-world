import { normaliseProject, type EditorProject } from './model';
export interface EditorRecovery { project: EditorProject; revision: number; savedAt: string }
const key = (uid: string, id: string) => 'tribestudio:video-recovery:' + uid + ':' + id;
export function readEditorRecovery(uid: string, id: string): EditorRecovery | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key(uid,id)) || 'null');
    if (!uid || !value || value.uid !== uid || value.id !== id || !Number.isSafeInteger(value.revision) || value.revision < 1 || !value.project?.timeline || !Array.isArray(value.project.timeline.scenes)) return null;
    return { project: normaliseProject(value.project), revision:value.revision, savedAt:String(value.savedAt || '') };
  } catch { return null; }
}
export function writeEditorRecovery(uid: string, id: string, project: EditorProject, revision: number): boolean {
  if (!uid) return false;
  try { window.localStorage.setItem(key(uid,id), JSON.stringify({ uid,id,project,revision,savedAt:new Date().toISOString() })); return true; } catch { return false; }
}
export function clearEditorRecovery(uid: string, id: string) { try { window.localStorage.removeItem(key(uid,id)); } catch { /* The user may disable browser storage. */ } }
