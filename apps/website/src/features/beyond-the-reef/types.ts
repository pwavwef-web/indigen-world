/**
 * Shapes shared by the Beyond the Reef experience.
 *
 * Timing lives in plain data files (lyrics.ts, scenes.ts) and never inside a
 * component, so correcting a line or moving a cut is a one-number edit that
 * cannot break rendering.
 */

/** One sung line. Times are seconds into the recording. */
export interface LyricLine {
  /** When the first syllable is heard. */
  start: number;
  /** When the last syllable fades. */
  end: number;
  /** The words exactly as written. */
  text: string;
  /** The song part it belongs to ("Verse 1", "Chorus"…). Never shown as a lyric. */
  section: string;
  /** Lines of one stanza share a number; a new stanza opens a little space. */
  stanza: number;
}

/** A camera drift over a shot: [scale, x %, y %] at its start and at its end. */
export interface Drift {
  from: [number, number, number];
  to: [number, number, number];
}

/** One silent clip, encoded twice: WebM for most browsers, MP4 for the rest. */
export interface ClipSource {
  webm: string;
  mp4: string;
  /** Length of the encoded clip in seconds. */
  duration: number;
}

/**
 * One shot of the visual timeline, active over [start, end) of the song.
 *
 * An image shot is a still with a slow drift. A video shot plays its clip from
 * `clipFrom` at `rate`, and when the clip runs out before the shot does it rests
 * on `hold` — the clip's own last frame — while the drift carries on, so the
 * end of a clip is never visible as a cut.
 */
export interface Shot {
  id: string;
  start: number;
  end: number;
  /** The still: the whole shot for an image, the first frame for a clip. */
  image: string;
  clip?: ClipSource;
  /** Clip seconds to start from. */
  clipFrom?: number;
  /** Playback rate; below 1 slows the footage. */
  rate?: number;
  /** The clip's last frame, shown once the clip has run out. */
  hold?: string;
  drift?: Drift;
  /** CSS object-position, for how the frame crops on a tall screen. */
  focus?: string;
  /** Crossfade into this shot, in seconds. */
  fade?: number;
}

/** A named stretch of the journey, shown as a caption and a seek-bar marker. */
export interface Chapter {
  start: number;
  title: string;
}
