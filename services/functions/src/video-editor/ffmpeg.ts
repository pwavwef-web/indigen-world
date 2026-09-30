import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * The FFmpeg binary and the two ways the renderer uses it.
 *
 * Deployed, the binary comes from `ffmpeg-static`, which Cloud Build installs
 * with the functions' dependencies (it is external to the esbuild bundle so its
 * own path resolution keeps working). Locally and in tests `FFMPEG_BIN` points
 * at any FFmpeg on the machine.
 *
 * Every input is a local file the worker downloaded first. The static builds
 * fail when they have to resolve a hostname inside the functions runtime, so
 * nothing here ever hands FFmpeg a URL.
 */
export function ffmpegPath(): string {
  const fromEnv = process.env.FFMPEG_BIN;
  if (fromEnv) return fromEnv;
  const require = createRequire(import.meta.url);
  const resolved = require('ffmpeg-static') as string | null;
  if (!resolved) throw new Error('FFmpeg is not available on this runtime.');
  return resolved;
}

export interface MediaProbe {
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

/** Reads duration, streams and picture size from FFmpeg's own description of a file. */
export function parseProbe(stderr: string): MediaProbe {
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const durationSec = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0;
  const video = /Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  return {
    durationSec,
    hasVideo: /Stream #[^\n]*Video:/.test(stderr) && !/Video: (png|mjpeg)[^\n]*\(attached pic\)/.test(stderr),
    hasAudio: /Stream #[^\n]*Audio:/.test(stderr),
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
  };
}

export function probeMedia(path: string): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', path]);
    let err = '';
    p.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    p.on('error', reject);
    // `ffmpeg -i` with no output always exits 1; the description is the point.
    p.on('close', () => resolve(parseProbe(err)));
  });
}

export class FfmpegError extends Error {
  constructor(message: string, readonly stderr: string) {
    super(message);
    this.name = 'FfmpegError';
  }
}

/**
 * Runs FFmpeg with `-progress pipe:1` in its arguments and reports the output
 * time it has reached, in seconds. Rejects with the tail of stderr on failure,
 * and kills the process when the deadline or the abort signal fires.
 */
export function runFfmpeg(
  args: string[],
  opts: { onProgress?: (seconds: number) => void; timeoutMs: number; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args);
    let err = '';
    let buffered = '';
    const kill = (why: string) => {
      p.kill('SIGKILL');
      reject(new FfmpegError(why, err.slice(-4000)));
    };
    const timer = setTimeout(() => kill('The render took longer than allowed.'), opts.timeoutMs);
    opts.signal?.addEventListener('abort', () => kill('The render was cancelled.'), { once: true });
    p.stdout.on('data', (d: Buffer) => {
      buffered += d.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
        if (m && opts.onProgress) opts.onProgress(Number(m[1]) / 1_000_000);
      }
    });
    p.stderr.on('data', (d: Buffer) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(new FfmpegError(`FFmpeg could not start: ${e.message}`, err));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new FfmpegError(`FFmpeg exited with code ${code}.`, err.slice(-4000)));
    });
  });
}

/** A fully transparent PNG the size of the frame, for the gaps in the caption track. */
export function blankFrameArgs(width: number, height: number, output: string): string[] {
  return ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black@0.0:s=${width}x${height},format=rgba`, '-frames:v', '1', output];
}
