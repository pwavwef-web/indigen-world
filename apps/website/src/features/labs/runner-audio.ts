/** Original synthesized cues. Audio is created only in a deliberate start gesture. */
export class TrailAudio {
  private context: AudioContext | null = null;
  private muted = false;
  private step = -1;
  private voices = new Set<{ osc: OscillatorNode; gain: GainNode }>();
  unlock() { try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { this.context = null; } }
  mute(value: boolean) { this.muted = value; if (value) this.stopVoices(); }
  private stopVoices() {
    for (const { osc, gain } of this.voices) { try { osc.stop(); } catch { /* Already ended. */ } osc.disconnect(); gain.disconnect(); }
    this.voices.clear();
  }
  cue(kind: string) {
    const ctx = this.context;
    if (!ctx || this.muted || ctx.state !== "running") return;
    const frequencies: Record<string, number> = { pickup: 880, hit: 90, jump: 330, land: 130, checkpoint: 660, continue: 523, step: 100 };
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const voice = { osc, gain }; this.voices.add(voice);
    const duration = kind === "step" ? .045 : kind === "checkpoint" ? .38 : .16;
    osc.type = kind === "hit" || kind === "step" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(frequencies[kind] ?? 440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime((frequencies[kind] ?? 440) * (kind === "hit" ? .5 : 1.5), ctx.currentTime + duration);
    gain.gain.setValueAtTime(kind === "step" ? .018 : .045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); this.voices.delete(voice); };
  }
  footsteps(distance: number) { const n = Math.floor(distance * 2.7 / Math.PI); if (n !== this.step) { this.step = n; this.cue("step"); } }
  pause() { this.stopVoices(); void this.context?.suspend().catch(() => {}); }
  resume() { void this.context?.resume().catch(() => {}); }
  dispose() { this.stopVoices(); void this.context?.close().catch(() => {}); this.context = null; }
}
