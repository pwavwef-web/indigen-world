/**
 * src/features/progress/progressAudio.ts
 *
 * Lightweight, accessible Web Audio chime synthesizer.
 * Generates an organic pentatonic vessel chime or speech tone without
 * relying on external audio assets, ensuring 100% offline capability.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Plays a resonant, gentle water vessel chime
 */
export function playVesselChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const frequencies = [392.0, 523.25, 659.25, 783.99]; // G4, C5, E5, G5 (warm pentatonic)

  frequencies.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + index * 0.06);

    gain.gain.setValueAtTime(0, now + index * 0.06);
    gain.gain.linearRampToValueAtTime(0.08, now + index * 0.06 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.06 + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + index * 0.06);
    osc.stop(now + index * 0.06 + 0.85);
  });
}

/**
 * Plays a preview simulation of Kasem spoken pitch tone or melodic phrase
 */
export function playSampleAudioPreview(type: 'word' | 'song' | 'narration' = 'word'): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (type === 'song') {
    // 3-note melodic traditional phrase
    const notes = [440, 493.88, 587.33, 523.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.22);
      gain.gain.setValueAtTime(0.12, now + idx * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.22 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.22);
      osc.stop(now + idx * 0.22 + 0.38);
    });
  } else if (type === 'narration') {
    // Low, resonant acoustic voice-like drone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(146.83, now); // D3
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.25);
  } else {
    // Word tone pair (High-Low tone simulation)
    const tones = [466.16, 349.23];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);
      gain.gain.setValueAtTime(0.1, now + idx * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.28);
    });
  }
}
