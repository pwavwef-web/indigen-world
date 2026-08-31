import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from '../firebase';

/**
 * Pictures for lesson questions, uploaded straight from the console.
 *
 * This is the first thing the admin app puts into Cloud Storage — everything
 * else it manages is a document, or media a creator uploaded from the phone. A
 * picture question cannot be authored that way: the person writing "which of
 * these is a goat" has the photograph on the machine they are typing on, and
 * asking them to upload it somewhere else first and paste a link back is how
 * you end up with lessons pointing at somebody's Drive folder.
 *
 * ── Why a fixed path per slot ──────────────────────────────────────────────
 * An upload is written to `learn-images/{lessonId}/{slot}` where the slot names
 * the question and the option it belongs to. Replacing a picture therefore
 * overwrites the old one instead of leaving it behind: nothing ever deletes
 * these, so a random file name per upload would quietly fill the bucket with
 * every rejected take of every photograph anybody ever tried.
 *
 * Storage is initialised here from the shared app instance rather than exported
 * from firebase.ts, so no other screen pays for the Storage SDK. Note this does
 * not honour VITE_USE_EMULATORS — the emulator wiring lives in firebase.ts and
 * there is no Storage emulator configured for this project, so uploads always
 * go to the real bucket.
 */
const storage = getStorage(app);

/** Anything larger is a photograph nobody resized, and a slow lesson on 3G. */
const maxBytes = 5 * 1024 * 1024;

/** The slot a question's own picture is filed under. */
export function promptImageSlot(questionIndex: number): string {
  return `q${questionIndex}-prompt`;
}

/** The slot one option's picture is filed under. */
export function answerImageSlot(questionIndex: number, position: number): string {
  return `q${questionIndex}-a${position}`;
}

/**
 * Uploads one picture and returns the URL to store on the lesson.
 *
 * The size and type are checked here as well as in storage.rules, not instead
 * of it: the rules are the enforcement, but a rejection there arrives as an
 * unretryable permission error after the whole file has gone up the wire. This
 * catches the same two mistakes before anything is sent, and says which one it
 * was.
 */
export async function uploadLessonImage(
  file: File,
  lessonId: string,
  slot: string,
): Promise<string> {
  if (!lessonId) {
    throw new Error('Save the lesson once before adding pictures — uploads are filed under its id.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image. Choose a JPEG, PNG or WebP.');
  }
  if (file.size > maxBytes) {
    const megabytes = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`That image is ${megabytes} MB. Pictures have to be under 5 MB.`);
  }
  const target = ref(storage, `learn-images/${lessonId}/${slot}`);
  await uploadBytes(target, file, { contentType: file.type });
  return getDownloadURL(target);
}
