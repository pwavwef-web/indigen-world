/**
 * Beyond the Reef — visual timeline.
 *
 * The journey runs shore → reef → open water → uncertainty → discovery →
 * horizon, and the light runs with it: blue hour, starlight, sunrise over the
 * reef, the midday sea, dusk, nightfall, storm, moonlight, a misty dawn and the
 * risen sun. Cuts are placed a beat before the stanza they belong to, so the
 * new picture has settled by the time its words are sung.
 *
 * Times are seconds into the song, like lyrics.ts. Every shot starts where the
 * previous one's crossfade begins; the last runs to the end of the song. A clip
 * shot rests on its clip's own last frame (`hold`) once the footage runs out.
 * All media was generated for this page with Google's Gemini image and Veo
 * video models — see scripts/beyond-the-reef/README.md.
 */
import type { Chapter, ClipSource, Shot } from "./types";

export const MEDIA_ROOT = "/beyond-the-reef";

/**
 * The song, best source first. Both carry the same MP3 audio frames — the .m4a
 * is the supplied MP3 remuxed into an MP4 container without re-encoding (the
 * decoded samples are identical). The container matters: browsers seek a VBR
 * MP3 by estimating byte offsets and can land a second away from the
 * `currentTime` they report, while MP4's sample tables make every seek exact.
 * The original MP3 remains for any browser that cannot play the first.
 */
export const AUDIO_SOURCES = [
  { src: `${MEDIA_ROOT}/audio/beyond-the-reef.m4a`, type: 'audio/mp4; codecs="mp4a.6B"' },
  { src: `${MEDIA_ROOT}/audio/beyond-the-reef.mp3`, type: "audio/mpeg" },
];

const image = (id: string) => `${MEDIA_ROOT}/images/${id}.webp`;

function clip(id: string, duration = 8): { image: string; clip: ClipSource; hold: string } {
  return {
    image: image(`${id}-start`),
    clip: { webm: `${MEDIA_ROOT}/video/${id}.webm`, mp4: `${MEDIA_ROOT}/video/${id}.mp4`, duration },
    hold: image(`${id}-end`),
  };
}

/** The opening screen's silent loop and its poster. */
export const INTRO_MEDIA = clip("01-shore");

export const CHAPTERS: Chapter[] = [
  { start: 0, title: "The Shore" },
  { start: 21.4, title: "Maps and Screens" },
  { start: 51.4, title: "What I'm Carrying" },
  { start: 63.9, title: "Beyond the Reef" },
  { start: 104.6, title: "Beneath the Surface" },
  { start: 135.4, title: "One Shore Done Right" },
  { start: 146.5, title: "Nightfall" },
  { start: 187.3, title: "The Storm" },
  { start: 229.8, title: "Discovery" },
  { start: 262.6, title: "Carry the People" },
  { start: 290.6, title: "The Horizon" },
];

export const SHOTS: Shot[] = [
  // I · The Shore — "I built a boat from restless dreams"
  { id: "shore", start: 0, end: 11.2, ...clip("01-shore"), rate: 0.75, fade: 0, drift: { from: [1, 0, 0], to: [1.05, 0, -0.6] } },
  // "But somewhere underneath the stars"
  { id: "stars", start: 11.2, end: 21.4, ...clip("02-stars"), rate: 0.8, fade: 2.2, drift: { from: [1, 0, 0], to: [1.06, 0, -0.8] } },

  // II · Maps and Screens — "I had the maps, I had the code"
  { id: "city", start: 21.4, end: 36, image: image("03-city"), fade: 1.8, drift: { from: [1.03, -1, 0], to: [1.14, 1.5, -1.2] } },
  // "Then one night I looked around"
  { id: "city-detail", start: 36, end: 51.4, image: image("03-city-detail"), fade: 1.8, drift: { from: [1.1, 0, -1], to: [1, 0, 0] } },

  // III · What I'm Carrying — "I just stopped looking at my hands"
  { id: "carrying", start: 51.4, end: 63.9, image: image("04-carrying"), fade: 2, drift: { from: [1.14, -1.5, 1], to: [1.02, 0, 0] } },

  // IV · Beyond the Reef — "So take me beyond the reef"
  { id: "reef", start: 63.9, end: 79.6, ...clip("05-reef"), rate: 0.6, fade: 1.1, drift: { from: [1, 0, 0], to: [1.06, 0, 0] } },
  // "Let the future know our stories"
  { id: "sunrise", start: 79.6, end: 92.3, image: image("06-sunrise-open-sea"), fade: 2, drift: { from: [1.02, 0, 1], to: [1.12, 0, -1.5] } },
  // "We're carrying our people beyond the reef"
  { id: "reef-beyond", start: 92.3, end: 104.6, image: image("05-reef-final"), fade: 2, drift: { from: [1.2, 0, 0], to: [1, 0, 0] } },

  // V · Beneath the Surface — "There are words inside our mothers"
  { id: "underwater", start: 104.6, end: 115.6, ...clip("07-underwater"), rate: 0.72, fade: 2.2, drift: { from: [1, 0, 0], to: [1.04, 0, 0] } },
  // "There are children learning futures"
  { id: "vessel", start: 115.6, end: 124.9, image: image("08-vessel"), fade: 2, drift: { from: [1.12, 0, 0], to: [1.02, 0, 0] } },
  // "Let technology be the vessel, never let it be the soul"
  { id: "golden", start: 124.9, end: 135.4, ...clip("10-golden"), rate: 0.78, fade: 1.6, drift: { from: [1, 0, 0], to: [1.04, 0, 0] } },

  // VI · One Shore Done Right — "One community holding the light"
  { id: "one-shore", start: 135.4, end: 146.5, image: image("09-one-shore"), fade: 2.2, drift: { from: [1.02, 0, 0], to: [1.16, 0, -2] } },

  // VII · Nightfall — the second chorus
  { id: "nightfall", start: 146.5, end: 161.9, image: image("16-nightfall"), fade: 1.4, drift: { from: [1, 0, 0], to: [1.12, 0, -1] } },
  // "Let our voices fill the air"
  { id: "voices", start: 161.9, end: 176.2, image: image("17-voices"), fade: 2.4, drift: { from: [1.04, 0, 1], to: [1.15, 0, -1.5] } },
  // The storm gathers; this drift ends on the storm clip's exact first frame.
  { id: "storm-gathers", start: 176.2, end: 187.3, image: image("11-storm-start"), fade: 2.4, drift: { from: [1.12, 0, -1], to: [1, 0, 0] } },

  // VIII · The Storm — "If the app disappears tomorrow"
  { id: "storm", start: 187.3, end: 218.2, ...clip("11-storm"), rate: 0.5, fade: 0, drift: { from: [1, 0, 0], to: [1.1, 0, 0.5] } },
  // "So if the ocean throws me backwards, I will learn and sail again"
  { id: "moonlight", start: 218.2, end: 229.8, image: image("12-moonlight"), fade: 2.6, drift: { from: [1.03, 0, 0], to: [1.14, 0, 1] } },

  // IX · Discovery — "Take us beyond the reef"
  { id: "island", start: 229.8, end: 246.9, ...clip("13-island-mist"), rate: 0.55, fade: 1.4, drift: { from: [1, 0, 0], to: [1.08, 0, 0.5] } },
  // "We don't need to chase the whole world"
  { id: "arrival", start: 246.9, end: 262.6, image: image("boat-reference"), fade: 2, drift: { from: [1.02, 0, 0], to: [1.12, -2, 1] } },

  // X · Carry the People — "Beyond the reef, beyond the reef"
  { id: "fleet", start: 262.6, end: 271, ...clip("14-fleet"), rate: 0.5, fade: 1.8, drift: { from: [1, 0, 0], to: [1.04, 0, 0] } },
  // "Carry the language, carry the stories, carry the people" — the clip's
  // push-in ends with a sail across the lyrics, so the line of canoes returns
  // as a still, drawing back to show every boat.
  { id: "fleet-wide", start: 271, end: 290.6, image: image("14-fleet"), fade: 2.4, drift: { from: [1.16, 0, 1], to: [1, 0, 0] } },

  // XI · The Horizon — "and knowing what you're sailing for"
  { id: "horizon", start: 290.6, end: 316, image: image("15-horizon"), fade: 2.8, drift: { from: [1.14, 0, 1.5], to: [1, 0, 0] } },
];
