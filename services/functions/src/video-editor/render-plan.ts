import { alphaFilters, scaleExpr, shiftExpr } from './animation.js';
import { lookFilter } from './looks.js';
import {
  FPS,
  frameSize,
  sceneTimes,
  type RenderQuality,
  type RenderSettings,
  type RenderSpec,
  type SceneSpec,
  type TransitionType,
} from './render-spec.js';

/**
 * Turns a parsed render spec and the local copies of its files into one FFmpeg
 * run. Pure: no I/O, so the whole graph can be asserted on and rendered in a
 * test with the local FFmpeg.
 *
 * Shape of the graph:
 *
 *   scene streams ──xfade/concat──▶ picture ──overlay × layers──▶ caption track ──▶ [vout]
 *   scene sound, voice, music bus (ducked) ──amix──▶ loudness ──▶ [aout]
 *
 * Every scene stream is normalised to the output size, yuv420p and a declared
 * 30 fps (so one time base), because xfade and concat refuse inputs that differ
 * in any of them. `fps` comes last in each chain: `setpts` leaves the frame
 * rate undefined, which xfade rejects outright.
 * A scene's stream runs half a transition longer on each side that has one (its
 * "handles"), so the xfade that joins two scenes is centred on the cut and the
 * total length is exactly the sum of the scene durations.
 */

export interface ResolvedMedia {
  path: string;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSec: number;
}

export interface ResolvedInputs {
  media: Map<string, ResolvedMedia>;
  /** Editor-rasterised PNGs by their storage path. */
  layers: Map<string, string>;
  stickers: Map<string, string>;
  tracks: Map<string, { path: string; durationSec: number }>;
  /** A transparent PNG the size of the frame, for gaps in the caption track. */
  blankFramePath: string;
}

export interface RenderPlan {
  args: string[];
  /** Files the plan refers to, which the caller writes before running FFmpeg. */
  files: { path: string; content: string }[];
  durationSec: number;
  width: number;
  height: number;
}

const XFADE: Record<Exclude<TransitionType, 'cut'>, string> = {
  fade: 'fade',
  flash: 'fadewhite',
  slide: 'slideleft',
  wipe: 'wipeleft',
};

const ENCODE: Record<RenderQuality, { preset: string; crf: number }> = {
  draft: { preset: 'veryfast', crf: 28 },
  standard: { preset: 'veryfast', crf: 20 },
  high: { preset: 'faster', crf: 18 },
};

const n = (v: number) => Number(v.toFixed(3));
const hex = (c: string) => `0x${c.replace('#', '')}`;

/** atempo accepts 0.5–100, so slower than half speed takes two stages. */
function atempo(speed: number): string[] {
  if (Math.abs(speed - 1) < 0.001) return [];
  if (speed < 0.5) return ['atempo=0.5', `atempo=${n(speed / 0.5)}`];
  return [`atempo=${n(speed)}`];
}

function fitFilters(scene: SceneSpec, label: string, out: string, W: number, H: number, background: string, graph: string[]): void {
  if (scene.fit === 'contain') {
    graph.push(`[${label}]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${hex(background)}[${out}]`);
    return;
  }
  if (scene.fit === 'blur') {
    // The frame filled with a blurred, darkened copy of the picture, and the
    // whole picture on top: the usual way a landscape clip sits in a vertical
    // frame without black bars. Blurred small and scaled up, which costs a
    // fraction of blurring at full size and looks the same.
    const w = Math.max(16, Math.round(W / 8 / 2) * 2);
    const h = Math.max(16, Math.round(H / 8 / 2) * 2);
    graph.push(`[${label}]split=2[${label}a][${label}b]`);
    graph.push(`[${label}a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=4,scale=${W}:${H},eq=brightness=-0.08:saturation=0.9[${label}bg]`);
    graph.push(`[${label}b]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=bicubic[${label}fg]`);
    graph.push(`[${label}bg][${label}fg]overlay=(W-w)/2:(H-h)/2[${out}]`);
    return;
  }
  graph.push(`[${label}]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W}:${H}:(iw-${W})*${n(scene.focusX)}:(ih-${H})*${n(scene.focusY)}[${out}]`);
}

function orientFilters(scene: SceneSpec): string[] {
  const f: string[] = [];
  if (scene.rotation === 90) f.push('transpose=1');
  if (scene.rotation === 270) f.push('transpose=2');
  if (scene.rotation === 180) f.push('hflip', 'vflip');
  if (scene.flipX) f.push('hflip');
  return f;
}

/** Merges voice and speaking-scene windows so the ducking expression stays short. */
export function mergeWindows(windows: [number, number][], gap = 0.2): [number, number][] {
  const sorted = [...windows].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + gap) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * The music gain over time: 1 away from speech, `duckTo` under it, with a
 * 0.3-second ramp either side. The editor's preview applies the same shape.
 */
export function duckExpression(windows: [number, number][], duckTo: number, ramp = 0.3): string | null {
  const merged = mergeWindows(windows);
  if (merged.length === 0 || duckTo >= 0.999) return null;
  const terms = merged.map(([s, e]) => `clip((t-${n(s - ramp)})/${ramp},0,1)*clip((${n(e + ramp)}-t)/${ramp},0,1)`);
  const envelope = terms.reduce((acc, term) => (acc ? `max(${acc},${term})` : term), '');
  return `1-${n(1 - duckTo)}*${envelope}`;
}

export function buildRenderPlan(spec: RenderSpec, settings: RenderSettings, inputs: ResolvedInputs, workDir: string, outputPath: string): RenderPlan {
  const { width: W, height: H } = frameSize(settings);
  const { starts, total: T } = sceneTimes(spec.scenes);
  const totalFrames = Math.round(T * FPS);
  const args: string[] = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats'];
  const graph: string[] = [];
  const files: { path: string; content: string }[] = [];
  const sep = workDir.includes('\\') ? '\\' : '/';
  let inputs_ = 0;
  const input = (...a: string[]) => {
    args.push(...a);
    inputs_ += 1;
    return inputs_ - 1;
  };
  const media = (id: string) => {
    const m = inputs.media.get(id);
    if (!m) throw new Error(`Media ${id} was not resolved.`);
    return m;
  };

  const audio: string[] = [];
  const speech: [number, number][] = [];

  // ── Scenes ──────────────────────────────────────────────────────────────
  spec.scenes.forEach((scene, i) => {
    const tIn = i === 0 ? 0 : scene.transitionIn.duration;
    const tOut = i + 1 < spec.scenes.length ? spec.scenes[i + 1]!.transitionIn.duration : 0;
    const head = tIn / 2;
    const tail = tOut / 2;
    const length = scene.duration + head + tail;
    const frames = Math.max(1, Math.round(length * FPS));
    const streamStart = starts[i]! - head;
    const raw = `s${i}r`;
    const fitted = `s${i}f`;
    const src = scene.source;

    if (src.kind === 'color') {
      graph.push(`color=c=${hex(src.color)}:s=${W}x${H}:r=${FPS}:d=${n(length)},format=yuv420p,setsar=1,fps=${FPS}[s${i}]`);
      return;
    }

    if (src.kind === 'image' || src.kind === 'card') {
      const path = src.kind === 'card' ? inputs.layers.get(src.layerPath) : media(src.mediaId).path;
      if (!path) throw new Error(`Card ${src.kind === 'card' ? src.layerPath : ''} was not resolved.`);
      const idx = input('-i', path);
      if (src.kind === 'card') {
        graph.push(`[${idx}:v]format=rgba,scale=${W}:${H},loop=loop=${frames - 1}:size=1:start=0,setpts=N/${FPS}/TB,format=yuv420p,setsar=1,fps=${FPS}[s${i}]`);
        return;
      }
      const orient = orientFilters(scene);
      graph.push(`[${idx}:v]${[...orient, 'format=rgb24'].join(',')}[${raw}]`);
      if (scene.kenBurns) {
        // Scaled to twice the frame first so zoompan's whole-pixel steps are
        // too small to see; the zoom runs 1 → 1.08 over the scene, as the
        // preview's CSS transform does.
        graph.push(`[${raw}]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2}:(iw-${W * 2})*${n(scene.focusX)}:(ih-${H * 2})*${n(scene.focusY)}[${fitted}]`);
        const look = lookFilter(scene.look);
        graph.push(`[${fitted}]${look ? `${look},` : ''}loop=loop=${frames - 1}:size=1:start=0,setpts=N/${FPS}/TB,zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1,fps=${FPS}[s${i}]`);
        return;
      }
      fitFilters(scene, raw, fitted, W, H, spec.background, graph);
      const look = lookFilter(scene.look);
      graph.push(`[${fitted}]${look ? `${look},` : ''}loop=loop=${frames - 1}:size=1:start=0,setpts=N/${FPS}/TB,format=yuv420p,setsar=1,fps=${FPS}[s${i}]`);
      return;
    }

    // Video: the source range this scene shows, including its handles, held
    // on the first or last frame where the file runs out.
    const m = media(src.mediaId);
    const idx = input('-i', m.path);
    const speed = scene.speed;
    let a = scene.sourceIn - head * speed;
    let b = scene.sourceIn + (scene.duration + tail) * speed;
    const padStart = a < 0 ? -a / speed : 0;
    a = Math.max(0, a);
    if (m.durationSec > 0 && a > m.durationSec - 0.1) a = Math.max(0, m.durationSec - 0.1);
    const available = m.durationSec > 0 ? m.durationSec : b;
    b = Math.min(b, available);
    if (b <= a) b = Math.min(available, a + 0.1);
    const shown = (b - a) / speed;
    const padEnd = Math.max(0, length - padStart - shown);
    const tpad = padStart > 0.001 || padEnd > 0.001
      ? [`tpad=start_mode=clone:start_duration=${n(padStart)}:stop_mode=clone:stop_duration=${n(padEnd + 0.1)}`]
      : [];
    graph.push(`[${idx}:v]${[
      `trim=start=${n(a)}:end=${n(b)}`,
      `setpts=(PTS-STARTPTS)/${n(speed)}`,
      `fps=${FPS}`,
      ...tpad,
      ...orientFilters(scene),
    ].join(',')}[${raw}]`);
    fitFilters(scene, raw, fitted, W, H, spec.background, graph);
    const look = lookFilter(scene.look);
    graph.push(`[${fitted}]${look ? `${look},` : ''}trim=end_frame=${frames},setpts=PTS-STARTPTS,format=yuv420p,setsar=1,fps=${FPS}[s${i}]`);

    const level = scene.volume * spec.audio.sourceLevel;
    if (m.hasAudio && level > 0.001) {
      const len = Math.max(0.05, shown);
      const fadeIn = Math.max(0.03, tIn);
      const fadeOut = Math.max(0.03, tOut);
      graph.push(`[${idx}:a]${[
        `atrim=start=${n(a)}:end=${n(b)}`,
        'asetpts=PTS-STARTPTS',
        ...atempo(speed),
        'aresample=48000',
        'aformat=sample_fmts=fltp:channel_layouts=stereo',
        `volume=${n(level)}`,
        `afade=t=in:st=0:d=${n(Math.min(fadeIn, len / 2))}`,
        `afade=t=out:st=${n(Math.max(0, len - Math.min(fadeOut, len / 2)))}:d=${n(Math.min(fadeOut, len / 2))}`,
        `adelay=delays=${Math.round((streamStart + padStart) * 1000)}:all=1`,
      ].join(',')}[a${i}]`);
      audio.push(`a${i}`);
      if (scene.duckMusic) speech.push([starts[i]!, starts[i]! + scene.duration]);
    }
  });

  // ── Joins: runs of cuts become one concat, transitions become xfades ─────
  let picture = 's0';
  let runStart = 0;
  const flushRun = (upTo: number) => {
    // Scenes runStart..upTo (inclusive) are joined by cuts.
    if (upTo === runStart) return;
    const labels = [];
    for (let k = runStart; k <= upTo; k += 1) labels.push(k === runStart ? `[${picture}]` : `[s${k}]`);
    const out = `c${upTo}`;
    graph.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[${out}]`);
    picture = out;
  };
  for (let i = 1; i < spec.scenes.length; i += 1) {
    const t = spec.scenes[i]!.transitionIn;
    if (t.type === 'cut') continue;
    flushRun(i - 1);
    const out = `x${i}`;
    graph.push(`[${picture}][s${i}]xfade=transition=${XFADE[t.type]}:duration=${n(t.duration)}:offset=${n(starts[i]! - t.duration / 2)}[${out}]`);
    picture = out;
    runStart = i;
  }
  flushRun(spec.scenes.length - 1);
  graph.push(`[${picture}]trim=end_frame=${totalFrames},setpts=PTS-STARTPTS,format=yuv420p[base]`);
  picture = 'base';

  // ── Layers, in z order ───────────────────────────────────────────────────
  spec.layers.forEach((layer, k) => {
    const lf = Math.max(1, Math.ceil(layer.end * FPS) + 1);
    const enable = `enable='between(t,${n(layer.start)},${n(layer.end)})'`;
    const fades = alphaFilters(layer.start, layer.end, layer.enter, layer.exit);
    const scale = scaleExpr(layer.start, layer.end, layer.enter, layer.exit);
    const shift = shiftExpr(layer.start, layer.end, layer.enter, layer.exit);
    const out = `l${k}`;
    if (layer.type === 'image') {
      const path = inputs.layers.get(layer.layerPath);
      if (!path) throw new Error(`Layer ${layer.layerPath} was not resolved.`);
      const idx = input('-i', path);
      const chain = [`format=rgba`, `loop=loop=${lf - 1}:size=1:start=0`, `setpts=N/${FPS}/TB`, ...fades];
      let x = `${layer.x}`;
      let y = `${layer.y}`;
      if (scale) {
        chain.push(`scale=w='max(2,trunc(iw*(${scale})/2)*2)':h='max(2,trunc(ih*(${scale})/2)*2)':eval=frame`);
        x = `${n(layer.x + layer.width / 2)}-w/2`;
        y = `${n(layer.y + layer.height / 2)}-h/2`;
      }
      if (shift) y = `${y}+(${shift})*H`;
      graph.push(`[${idx}:v]${chain.join(',')}[${out}s]`);
      graph.push(`[${picture}][${out}s]overlay=x='${x}':y='${y}':${enable}:eval=frame[${out}]`);
      picture = out;
      return;
    }
    const path = inputs.stickers.get(layer.stickerId);
    if (!path) throw new Error(`Sticker ${layer.stickerId} was not resolved.`);
    const idx = input('-i', path);
    // Sized on the frame's short side, so a sticker is the same size relative
    // to the picture in every aspect ratio, and placed by its centre.
    const target = Math.max(8, Math.round((layer.size * Math.min(W, H)) / 2) * 2);
    const rad = n((layer.rotation * Math.PI) / 180);
    const chain = [
      'format=rgba',
      `scale=w='if(gte(iw,ih),${target},-2)':h='if(gte(iw,ih),-2,${target})':flags=lanczos`,
      ...(layer.flipX ? ['hflip'] : []),
      ...(Math.abs(layer.rotation) > 0.01 ? [`rotate=a=${rad}:c=none:ow='rotw(${rad})':oh='roth(${rad})'`] : []),
      ...(layer.opacity < 0.999 ? [`colorchannelmixer=aa=${n(layer.opacity)}`] : []),
      `loop=loop=${lf - 1}:size=1:start=0`,
      `setpts=N/${FPS}/TB`,
      ...fades,
    ];
    if (scale) chain.push(`scale=w='max(2,trunc(iw*(${scale})/2)*2)':h='max(2,trunc(ih*(${scale})/2)*2)':eval=frame`);
    const cx = n(layer.cx * W);
    const cy = n(layer.cy * H);
    graph.push(`[${idx}:v]${chain.join(',')}[${out}s]`);
    graph.push(`[${picture}][${out}s]overlay=x='${cx}-w/2':y='${cy}-h/2${shift ? `+(${shift})*H` : ''}':${enable}:eval=frame[${out}]`);
    picture = out;
  });

  // ── Captions: one stream of full-frame PNGs shown back to back ───────────
  if (spec.captionTrack.length > 0) {
    const listPath = `${workDir}${sep}captions.ffconcat`;
    const lines = ['ffconcat version 1.0'];
    let at = 0;
    const entry = (file: string, duration: number) => {
      lines.push(`file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`, `duration ${n(duration)}`);
    };
    for (const frame of spec.captionTrack) {
      const path = inputs.layers.get(frame.layerPath);
      if (!path) throw new Error(`Caption ${frame.layerPath} was not resolved.`);
      if (frame.start - at > 0.001) entry(inputs.blankFramePath, frame.start - at);
      entry(path, frame.end - frame.start);
      at = frame.end;
    }
    entry(inputs.blankFramePath, Math.max(1 / FPS, T - at + 0.5));
    // The concat demuxer only honours the last entry's duration if the file is listed again.
    lines.push(`file '${inputs.blankFramePath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
    files.push({ path: listPath, content: `${lines.join('\n')}\n` });
    const idx = input('-f', 'concat', '-safe', '0', '-i', listPath);
    graph.push(`[${idx}:v]fps=${FPS},format=rgba,scale=${W}:${H},setpts=PTS-STARTPTS[capv]`);
    graph.push(`[${picture}][capv]overlay=0:0:eof_action=pass[captioned]`);
    picture = 'captioned';
  }
  graph.push(`[${picture}]format=yuv420p,setsar=1[vout]`);

  // ── Voice ────────────────────────────────────────────────────────────────
  spec.audio.voice.forEach((clip, k) => {
    const m = media(clip.mediaId);
    if (!m.hasAudio) return;
    const level = clip.volume * spec.audio.voiceLevel;
    if (level <= 0.001) return;
    const idx = input('-i', m.path);
    const len = clip.duration;
    const fi = Math.max(0.02, Math.min(clip.fadeIn, len / 2));
    const fo = Math.max(0.02, Math.min(clip.fadeOut, len / 2));
    graph.push(`[${idx}:a]atrim=start=${n(clip.sourceIn)}:duration=${n(len)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(level)},afade=t=in:st=0:d=${n(fi)},afade=t=out:st=${n(len - fo)}:d=${n(fo)},adelay=delays=${Math.round(clip.start * 1000)}:all=1[vo${k}]`);
    audio.push(`vo${k}`);
    speech.push([clip.start, clip.start + len]);
  });

  // ── Music, then ducked under speech as one bus ───────────────────────────
  const musicLabels: string[] = [];
  spec.audio.music.forEach((clip, k) => {
    const track = inputs.tracks.get(clip.trackId);
    if (!track) throw new Error(`Track ${clip.trackId} was not resolved.`);
    const level = clip.volume * spec.audio.musicLevel;
    if (level <= 0.001) return;
    const len = Math.min(clip.duration, Math.max(0.1, track.durationSec - clip.sourceIn));
    const idx = input('-i', track.path);
    const fi = Math.min(clip.fadeIn, len / 2);
    const fo = Math.min(clip.fadeOut, len / 2);
    graph.push(`[${idx}:a]${[
      `atrim=start=${n(clip.sourceIn)}:duration=${n(len)}`,
      'asetpts=PTS-STARTPTS',
      'aresample=48000',
      'aformat=sample_fmts=fltp:channel_layouts=stereo',
      `volume=${n(level)}`,
      `afade=t=in:st=0:d=${n(Math.max(0.02, fi))}`,
      `afade=t=out:st=${n(len - Math.max(0.02, fo))}:d=${n(Math.max(0.02, fo))}`,
      `adelay=delays=${Math.round(clip.start * 1000)}:all=1`,
    ].join(',')}[mu${k}]`);
    musicLabels.push(`mu${k}`);
  });
  if (musicLabels.length > 0) {
    const bus = musicLabels.length === 1
      ? `[${musicLabels[0]}]anull`
      : `${musicLabels.map((l) => `[${l}]`).join('')}amix=inputs=${musicLabels.length}:normalize=0:dropout_transition=0`;
    const duck = duckExpression(speech, spec.audio.duckTo);
    graph.push(`${bus}${duck ? `,volume=eval=frame:volume='${duck}'` : ''}[music]`);
    audio.push('music');
  }

  const loudness = settings.quality === 'draft'
    ? 'alimiter=limit=0.95:level=disabled'
    : 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000';
  if (audio.length === 0) {
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${n(T)}[aout]`);
  } else {
    const mix = audio.length === 1 ? `[${audio[0]}]anull` : `${audio.map((l) => `[${l}]`).join('')}amix=inputs=${audio.length}:normalize=0:dropout_transition=0`;
    graph.push(`${mix},apad=whole_dur=${n(T)},atrim=duration=${n(T)},${loudness},aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
  }

  const scriptPath = `${workDir}${sep}graph.txt`;
  files.push({ path: scriptPath, content: graph.join(';\n') });
  const encode = ENCODE[settings.quality];
  const shortSide = Math.min(W, H);
  const maxrate = settings.quality === 'draft' ? 2500 : shortSide >= 1080 ? 12000 : 6000;
  args.push(
    '-filter_complex_script', scriptPath,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', encode.preset, '-crf', String(encode.crf),
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-g', String(FPS * 2), '-keyint_min', String(FPS), '-sc_threshold', '0',
    '-maxrate', `${maxrate}k`, '-bufsize', `${maxrate * 2}k`,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    '-t', String(n(T)),
    outputPath,
  );
  return { args, files, durationSec: T, width: W, height: H };
}
