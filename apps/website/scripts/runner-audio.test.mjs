import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TrailAudio } from '../src/features/labs/runner-audio.ts';

test('pause, mute and route exit stop voices so old cues cannot resume on a retry', () => {
  let context;
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class Context {
    currentTime = 0; state = 'running'; voices = []; destination = {};
    constructor() { context = this; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createOscillator() { const voice = { frequency: parameter(), connect() {}, disconnect() { this.disconnected = true; }, start() {}, stop() { this.stops = (this.stops || 0) + 1; } }; this.voices.push(voice); return voice; }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
  }
  const original = globalThis.AudioContext; globalThis.AudioContext = Context;
  try {
    const audio = new TrailAudio(); audio.cue('pickup'); assert.equal(context, undefined, 'No audio before a user gesture');
    audio.unlock(); audio.cue('pickup'); audio.cue('hit'); audio.pause();
    assert(context.voices.every(v => v.stops === 2 && v.disconnected)); assert.equal(context.state, 'suspended');
    audio.resume(); audio.cue('continue'); audio.mute(true);
    const count = context.voices.length; audio.cue('pickup'); assert.equal(context.voices.length, count);
    audio.mute(false); audio.cue('jump'); audio.dispose();
    assert.equal(context.state, 'closed'); assert(context.voices.every(v => v.disconnected));
  } finally { globalThis.AudioContext = original; }
});
