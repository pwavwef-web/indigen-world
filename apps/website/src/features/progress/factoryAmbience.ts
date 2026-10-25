/**
 * A quiet machine-room bed, synthesised in the browser: a low motor hum,
 * moving air and a slow press rhythm. No audio files, nothing autoplays — it
 * starts only from a visitor's click and fades out when stopped.
 */

interface Ambience {
  context: AudioContext;
  master: GainNode;
  timer: number;
  sources: AudioScheduledSourceNode[];
}

let running: Ambience | null = null;

function noiseBuffer(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    // Brown noise: a random walk, gentler than white noise.
    last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
    data[index] = last * 3.5;
  }
  return buffer;
}

function thump(context: AudioContext, destination: AudioNode) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(92, now);
  oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.22);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
  oscillator.connect(gain).connect(destination);
  oscillator.start(now);
  oscillator.stop(now + 0.36);
}

export function isAmbiencePlaying(): boolean {
  return running !== null;
}

export function startFactoryAmbience(): boolean {
  if (running || typeof window === 'undefined') return running !== null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return false;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.5, context.currentTime + 1.4);
  master.connect(context.destination);

  const hum = context.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 55;
  const humFilter = context.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 170;
  const humGain = context.createGain();
  humGain.gain.value = 0.07;
  hum.connect(humFilter).connect(humGain).connect(master);

  const overtone = context.createOscillator();
  overtone.frequency.value = 110.6;
  const overtoneGain = context.createGain();
  overtoneGain.gain.value = 0.025;
  const wobble = context.createOscillator();
  wobble.frequency.value = 0.18;
  const wobbleDepth = context.createGain();
  wobbleDepth.gain.value = 0.015;
  wobble.connect(wobbleDepth).connect(overtoneGain.gain);
  overtone.connect(overtoneGain).connect(master);

  const air = context.createBufferSource();
  air.buffer = noiseBuffer(context);
  air.loop = true;
  const airFilter = context.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.frequency.value = 420;
  airFilter.Q.value = 0.6;
  const airGain = context.createGain();
  airGain.gain.value = 0.05;
  air.connect(airFilter).connect(airGain).connect(master);

  const sources: AudioScheduledSourceNode[] = [hum, overtone, wobble, air];
  sources.forEach((source) => source.start());
  const timer = window.setInterval(() => thump(context, master), 2400);
  running = { context, master, timer, sources };
  return true;
}

export function stopFactoryAmbience(): void {
  const current = running;
  if (!current) return;
  running = null;
  window.clearInterval(current.timer);
  const { context, master, sources } = current;
  const now = context.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  window.setTimeout(() => {
    sources.forEach((source) => { try { source.stop(); } catch { /* Already stopped. */ } });
    void context.close();
  }, 700);
}
