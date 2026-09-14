import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useAuth } from '../../auth';
import { useRoute } from '../../router';
import {
  fetchMyStudioVideoJobs,
  fetchStudioVideoJob,
  fetchStudioVideoPlayback,
  uploadStudioVideoAsset,
  type StudioVideoJob,
} from '../data';
import './video-editor.css';

type MediaKind = 'video' | 'image' | 'audio';
type EditorTab = 'media' | 'audio' | 'text' | 'captions' | 'effects' | 'transitions';
type CanvasRatio = '16:9' | '9:16' | '1:1' | '4:5';
type FilterName = 'none' | 'vivid' | 'warm' | 'cool' | 'mono' | 'dusk';
type TransitionName = 'none' | 'fade' | 'flash' | 'slide';

interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  source: 'device' | 'ai';
  objectUrl: boolean;
  jobId?: string;
}

interface TimelineClip {
  id: string;
  assetId: string;
  kind: MediaKind;
  name: string;
  start: number;
  sourceStart: number;
  duration: number;
  speed: number;
  volume: number;
  filter: FilterName;
  transition: TransitionName;
  fit: 'cover' | 'contain';
  rotation: number;
  flipX: boolean;
}

interface TextOverlay {
  id: string;
  text: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  color: string;
  size: number;
  weight: 600 | 800;
  background: boolean;
}

interface CaptionCue {
  id: string;
  text: string;
  start: number;
  duration: number;
}

type TimelineDragKind = 'asset' | 'clip' | 'text' | 'caption';

interface PointerDragSession {
  kind: TimelineDragKind;
  id: string;
  label: string;
  pointerId: number;
  offset: number;
  originStart: number;
  startClientX: number;
  startClientY: number;
  active: boolean;
  previewStart: number;
  sourceElement: HTMLElement;
  ghost: HTMLDivElement | null;
}

interface EditorProject {
  name: string;
  ratio: CanvasRatio;
  background: string;
  clips: TimelineClip[];
  texts: TextOverlay[];
  captions: CaptionCue[];
  selectedId: string | null;
}

type HistorySnapshot = EditorProject;

const EMPTY_PROJECT: EditorProject = {
  name: 'Untitled story',
  ratio: '9:16',
  background: '#070b14',
  clips: [],
  texts: [],
  captions: [],
  selectedId: null,
};

const FILTERS: Array<{ id: FilterName; label: string; css: string; swatch: string }> = [
  { id: 'none', label: 'Original', css: 'none', swatch: 'linear-gradient(135deg,#8292ae,#d7deea)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.35) contrast(1.08)', swatch: 'linear-gradient(135deg,#ff5e62,#ffcb52,#26c6da)' },
  { id: 'warm', label: 'Warm', css: 'sepia(.18) saturate(1.18) brightness(1.03)', swatch: 'linear-gradient(135deg,#7a311f,#f1ae61)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(176deg) saturate(.9) contrast(1.08)', swatch: 'linear-gradient(135deg,#102a57,#5dc4df)' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.15)', swatch: 'linear-gradient(135deg,#171b24,#d9dde4)' },
  { id: 'dusk', label: 'Dusk', css: 'sepia(.22) hue-rotate(300deg) saturate(1.25) contrast(1.08)', swatch: 'linear-gradient(135deg,#1a1e52,#b34f73,#ed9a59)' },
];

const RATIOS: Array<{ id: CanvasRatio; label: string; hint: string }> = [
  { id: '9:16', label: '9:16', hint: 'Reels' },
  { id: '16:9', label: '16:9', hint: 'Wide' },
  { id: '1:1', label: '1:1', hint: 'Square' },
  { id: '4:5', label: '4:5', hint: 'Post' },
];

const CANVAS_SIZE: Record<CanvasRatio, [number, number]> = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [720, 720],
  '4:5': [720, 900],
};

const TRANSITIONS: Array<{ id: TransitionName; label: string; glyph: string }> = [
  { id: 'none', label: 'Cut', glyph: '┃' },
  { id: 'fade', label: 'Fade', glyph: '◐' },
  { id: 'flash', label: 'Flash', glyph: '✦' },
  { id: 'slide', label: 'Slide', glyph: '⇥' },
];

type IconName = 'back' | 'media' | 'audio' | 'text' | 'captions' | 'effects' | 'transitions' | 'play' | 'pause' | 'split' | 'undo' | 'redo' | 'trash' | 'duplicate' | 'download' | 'upload' | 'plus';

const ICONS: Record<IconName, ReactNode> = {
  back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>,
  media: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 15 3-3 3 3 2-2 3 3M8 8h.01" /></>,
  audio: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
  text: <><path d="M5 5h14M12 5v14M8 19h8" /></>,
  captions: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 10h4M14 10h3M7 14h3M13 14h4" /></>,
  effects: <><path d="m12 3 1.4 4.1L17 5l-2.1 3.6L19 10l-4.1 1.4L17 15l-3.6-2.1L12 17l-1.4-4.1L7 15l2.1-3.6L5 10l4.1-1.4L7 5l3.6 2.1z" /></>,
  transitions: <><path d="M4 5h6v14H4zM14 5h6v14h-6zM10 12h4M12 10l2 2-2 2" /></>,
  play: <path d="m8 5 11 7-11 7z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  split: <><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="m8.5 8.5 10 7M8.5 15.5 18.5 8.5" /></>,
  undo: <><path d="m9 7-5 5 5 5" /><path d="M4 12h9a7 7 0 0 1 7 7" /></>,
  redo: <><path d="m15 7 5 5-5 5" /><path d="M20 12h-9a7 7 0 0 0-7 7" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
  duplicate: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>,
  upload: <><path d="M12 21V9M7 14l5-5 5 5M5 3h14" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};

function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value: number): string {
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

function projectDuration(project: EditorProject): number {
  return Math.max(
    0,
    ...project.clips.map((clip) => clip.start + clip.duration),
    ...project.texts.map((item) => item.start + item.duration),
    ...project.captions.map((item) => item.start + item.duration),
  );
}

function visualEnd(clips: TimelineClip[]): number {
  return Math.max(0, ...clips.filter((clip) => clip.kind !== 'audio').map((clip) => clip.start + clip.duration));
}

function filterCss(name: FilterName): string {
  return FILTERS.find((filter) => filter.id === name)?.css ?? 'none';
}

function mediaKind(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

function hasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files');
}

function readMediaDuration(url: string, kind: MediaKind): Promise<number> {
  if (kind === 'image') return Promise.resolve(4);
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind === 'video' ? 'video' : 'audio');
    element.preload = 'metadata';
    element.onloadedmetadata = () => resolve(Number.isFinite(element.duration) ? element.duration : 5);
    element.onerror = () => reject(new Error('This media file could not be read by the browser.'));
    element.src = url;
  });
}

function clipOpacity(clip: TimelineClip, time: number): number {
  if (clip.transition === 'none') return 1;
  const local = time - clip.start;
  const edge = Math.min(0.4, clip.duration / 3);
  if (local < edge) return clamp(local / edge, 0, 1);
  if (clip.duration - local < edge) return clamp((clip.duration - local) / edge, 0, 1);
  return 1;
}

function splitIntoCaptionLines(transcript: string): string[] {
  return transcript
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (line.length <= 54) return [line];
      const words = line.split(/\s+/);
      const chunks: string[] = [];
      let current = '';
      for (const word of words) {
        if (`${current} ${word}`.trim().length > 54 && current) {
          chunks.push(current);
          current = word;
        } else {
          current = `${current} ${word}`.trim();
        }
      }
      if (current) chunks.push(current);
      return chunks;
    });
}

function drawFittedMedia(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
  rotation: number,
  flipX: boolean,
) {
  if (sourceWidth <= 0 || sourceHeight <= 0) return;
  const scale = fit === 'cover'
    ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(flipX ? -1 : 1, 1);
  context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = `${line} ${word}`.trim();
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
}

export function VideoEditorPage() {
  const { user } = useAuth();
  const { navigate } = useRoute();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [project, setProject] = useState<EditorProject>(EMPTY_PROJECT);
  const [activeTab, setActiveTab] = useState<EditorTab>('media');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [captionDraft, setCaptionDraft] = useState('');
  const [captionLanguage, setCaptionLanguage] = useState('xsm');
  const [dragging, setDragging] = useState(false);
  const [timelineDropActive, setTimelineDropActive] = useState(false);
  const [aiLibraryOpen, setAiLibraryOpen] = useState(false);
  const [aiJobs, setAiJobs] = useState<StudioVideoJob[]>([]);
  const [aiJobsLoaded, setAiJobsLoaded] = useState(false);
  const [aiJobsLoading, setAiJobsLoading] = useState(false);
  const [aiImportingId, setAiImportingId] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exported, setExported] = useState<{ blob: Blob; url: string; extension: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const historyRef = useRef<HistorySnapshot[]>([]);
  const redoRef = useRef<HistorySnapshot[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<PointerDragSession | null>(null);
  const suppressClickRef = useRef(false);

  const duration = useMemo(() => projectDuration(project), [project]);
  const visualClips = useMemo(
    () => project.clips.filter((clip) => clip.kind !== 'audio').sort((a, b) => a.start - b.start),
    [project.clips],
  );
  const selectedClip = project.clips.find((clip) => clip.id === project.selectedId) ?? null;
  const selectedText = project.texts.find((item) => item.id === project.selectedId) ?? null;
  const selectedCaption = project.captions.find((item) => item.id === project.selectedId) ?? null;
  const hasSelection = Boolean(selectedClip || selectedText || selectedCaption);
  const activeVisual = visualClips.find((clip) => currentTime >= clip.start && currentTime < clip.start + clip.duration) ?? null;
  const activeAsset = activeVisual ? assets.find((asset) => asset.id === activeVisual.assetId) ?? null : null;
  const activeAudioClip = project.clips.find((clip) => clip.kind === 'audio' && currentTime >= clip.start && currentTime < clip.start + clip.duration) ?? null;
  const activeAudioAsset = activeAudioClip ? assets.find((asset) => asset.id === activeAudioClip.assetId) ?? null : null;
  const activeTexts = project.texts.filter((item) => currentTime >= item.start && currentTime < item.start + item.duration);
  const activeCaption = project.captions.find((item) => currentTime >= item.start && currentTime < item.start + item.duration) ?? null;
  const pixelsPerSecond = 42 * zoom;

  const commit = useCallback((change: (current: EditorProject) => EditorProject) => {
    setProject((current) => {
      historyRef.current.push(structuredClone(current));
      if (historyRef.current.length > 60) historyRef.current.shift();
      redoRef.current = [];
      return change(current);
    });
    setExported((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    setProject((current) => {
      redoRef.current.push(structuredClone(current));
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    setProject((current) => {
      historyRef.current.push(structuredClone(current));
      return next;
    });
  }, []);

  const addAsset = useCallback((asset: MediaAsset, startAt?: number) => {
    setAssets((current) => [...current, asset]);
    const clipId = newId('clip');
    commit((current) => {
      const clip: TimelineClip = {
        id: clipId,
        assetId: asset.id,
        kind: asset.kind,
        name: asset.name,
        start: startAt ?? (asset.kind === 'audio' ? 0 : visualEnd(current.clips)),
        sourceStart: 0,
        duration: asset.kind === 'image' ? 4 : Math.max(0.4, asset.duration),
        speed: 1,
        volume: 1,
        filter: 'none',
        transition: 'none',
        fit: 'cover',
        rotation: 0,
        flipX: false,
      };
      return { ...current, clips: [...current.clips, clip], selectedId: clip.id };
    });
    setCurrentTime(startAt ?? 0);
  }, [commit]);

  const importFiles = useCallback(async (files: File[], startAt?: number) => {
    setError(null);
    let nextStart = startAt;
    for (const file of files) {
      if (file.size > 500 * 1024 * 1024) {
        setError(`${file.name} is larger than the 500 MB editor limit.`);
        continue;
      }
      const kind = mediaKind(file);
      if (!kind) {
        setError(`${file.name} is not a video, image or audio file.`);
        continue;
      }
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      try {
        const mediaDuration = await readMediaDuration(url, kind);
        addAsset({ id: newId('asset'), name: file.name, kind, url, duration: mediaDuration, source: 'device', objectUrl: true }, nextStart);
        if (nextStart !== undefined && kind !== 'audio') nextStart += kind === 'image' ? 4 : Math.max(0.4, mediaDuration);
      } catch (reason) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
        setError(reason instanceof Error ? reason.message : `Could not read ${file.name}.`);
      }
    }
  }, [addAsset]);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void importFiles(files);
  };

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get('job');
    if (!jobId) return;
    let active = true;
    setSourceStatus('Opening your generated video…');
    void Promise.all([fetchStudioVideoJob(jobId), fetchStudioVideoPlayback(jobId)])
      .then(async ([job, playback]) => {
        if (!active) return;
        const url = playback.playbackUrl;
        const mediaDuration = await readMediaDuration(url, 'video');
        if (!active) return;
        addAsset({
          id: newId('asset'),
          name: job?.prompt?.trim() || 'AI-generated video',
          kind: 'video',
          url,
          duration: mediaDuration,
          source: 'ai',
          objectUrl: false,
          jobId,
        });
        setProject((current) => ({ ...current, name: job?.prompt?.trim().slice(0, 48) || 'AI video edit' }));
        setSourceStatus('Generated video added to the timeline');
        window.setTimeout(() => setSourceStatus(null), 3200);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSourceStatus(null);
        setError(reason instanceof Error ? reason.message : 'That generated video could not be opened.');
      });
    return () => { active = false; };
  }, [addAsset]);

  useEffect(() => () => {
    pointerDragRef.current?.ghost?.remove();
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (!playing || duration <= 0) return;
    let frame = 0;
    const started = performance.now() - currentTime * 1000;
    const tick = (now: number) => {
      const next = (now - started) / 1000;
      if (next >= duration) {
        setCurrentTime(duration);
        setPlaying(false);
        return;
      }
      setCurrentTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVisual) return;
    const sourceTime = activeVisual.sourceStart + (currentTime - activeVisual.start) * activeVisual.speed;
    if (Math.abs(video.currentTime - sourceTime) > 0.28) video.currentTime = Math.max(0, sourceTime);
    video.playbackRate = activeVisual.speed;
    video.volume = activeVisual.volume;
    if (playing && video.paused) void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
  }, [activeVisual, currentTime, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudioClip) return;
    const sourceTime = activeAudioClip.sourceStart + (currentTime - activeAudioClip.start) * activeAudioClip.speed;
    if (Math.abs(audio.currentTime - sourceTime) > 0.28) audio.currentTime = Math.max(0, sourceTime);
    audio.playbackRate = activeAudioClip.speed;
    audio.volume = activeAudioClip.volume;
    if (playing && audio.paused) void audio.play().catch(() => undefined);
    if (!playing && !audio.paused) audio.pause();
  }, [activeAudioClip, currentTime, playing]);

  const patchClip = (id: string, patch: Partial<TimelineClip>) => {
    commit((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip),
    }));
  };

  const patchText = (id: string, patch: Partial<TextOverlay>) => {
    commit((current) => ({
      ...current,
      texts: current.texts.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  const patchCaption = (id: string, patch: Partial<CaptionCue>) => {
    commit((current) => ({
      ...current,
      captions: current.captions.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  const deleteSelected = useCallback(() => {
    if (!project.selectedId) return;
    commit((current) => ({
      ...current,
      clips: current.clips.filter((item) => item.id !== current.selectedId),
      texts: current.texts.filter((item) => item.id !== current.selectedId),
      captions: current.captions.filter((item) => item.id !== current.selectedId),
      selectedId: null,
    }));
  }, [commit, project.selectedId]);

  const duplicateSelected = () => {
    if (selectedClip) {
      const copy = { ...selectedClip, id: newId('clip'), name: `${selectedClip.name} copy`, start: selectedClip.start + selectedClip.duration };
      commit((current) => ({ ...current, clips: [...current.clips, copy], selectedId: copy.id }));
      return;
    }
    if (selectedText) {
      const copy = { ...selectedText, id: newId('text'), start: selectedText.start + 0.3 };
      commit((current) => ({ ...current, texts: [...current.texts, copy], selectedId: copy.id }));
    }
  };

  const splitSelected = useCallback(() => {
    if (!selectedClip) return;
    const local = currentTime - selectedClip.start;
    if (local <= 0.12 || local >= selectedClip.duration - 0.12) {
      setError('Place the playhead inside the selected clip to split it.');
      return;
    }
    const second: TimelineClip = {
      ...selectedClip,
      id: newId('clip'),
      start: currentTime,
      sourceStart: selectedClip.sourceStart + local * selectedClip.speed,
      duration: selectedClip.duration - local,
      transition: 'none',
    };
    commit((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, duration: local } : clip).concat(second),
      selectedId: second.id,
    }));
    setError(null);
  }, [commit, currentTime, selectedClip]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        splitSelected();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, redo, splitSelected, undo]);

  const addText = () => {
    const item: TextOverlay = {
      id: newId('text'),
      text: 'Your story',
      start: currentTime,
      duration: Math.max(2, Math.min(4, Math.max(2, duration - currentTime))),
      x: 50,
      y: 24,
      color: '#ffffff',
      size: 46,
      weight: 800,
      background: false,
    };
    commit((current) => ({ ...current, texts: [...current.texts, item], selectedId: item.id }));
    setActiveTab('text');
  };

  const makeCaptions = () => {
    const lines = splitIntoCaptionLines(captionDraft);
    if (lines.length === 0) {
      setError('Paste or type the words you want timed as captions.');
      return;
    }
    const remaining = Math.max(2, duration - currentTime || lines.length * 2.5);
    const cueDuration = Math.max(1.1, remaining / lines.length);
    const captions = lines.map((text, index) => ({
      id: newId('caption'),
      text,
      start: currentTime + index * cueDuration,
      duration: cueDuration,
    }));
    commit((current) => ({ ...current, captions, selectedId: captions[0]?.id ?? null }));
    setError(null);
  };

  const addAssetAgain = (asset: MediaAsset, startAt?: number) => {
    const clipId = newId('clip');
    commit((current) => {
      const clip: TimelineClip = {
        id: clipId,
        assetId: asset.id,
        kind: asset.kind,
        name: asset.name,
        start: startAt ?? (asset.kind === 'audio' ? currentTime : visualEnd(current.clips)),
        sourceStart: 0,
        duration: asset.kind === 'image' ? 4 : asset.duration,
        speed: 1,
        volume: 1,
        filter: 'none',
        transition: 'none',
        fit: 'cover',
        rotation: 0,
        flipX: false,
      };
      return { ...current, clips: [...current.clips, clip], selectedId: clip.id };
    });
    if (startAt !== undefined) setCurrentTime(startAt);
  };

  const pointToTimelineStart = (clientX: number, offset = 0): number => {
    const scroll = timelineScrollRef.current;
    if (!scroll) return 0;
    const rect = scroll.getBoundingClientRect();
    return Math.max(0, Math.round((((clientX - rect.left + scroll.scrollLeft - 76) / pixelsPerSecond) - offset) * 10) / 10);
  };

  const isOverTimeline = (clientX: number, clientY: number): boolean => {
    const scroll = timelineScrollRef.current;
    if (!scroll) return false;
    const rect = scroll.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const beginPointerDrag = (event: ReactPointerEvent<HTMLElement>, kind: TimelineDragKind, id: string, label: string, originStart = 0) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerDragRef.current = {
      kind,
      id,
      label,
      pointerId: event.pointerId,
      offset: kind === 'asset' ? 0 : clamp((event.clientX - rect.left) / pixelsPerSecond, 0, rect.width / pixelsPerSecond),
      originStart,
      startClientX: event.clientX,
      startClientY: event.clientY,
      active: false,
      previewStart: originStart,
      sourceElement: event.currentTarget,
      ghost: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = pointerDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.active && Math.hypot(event.clientX - session.startClientX, event.clientY - session.startClientY) < 5) return;
    if (!session.active) {
      session.active = true;
      suppressClickRef.current = true;
      session.sourceElement.classList.add('is-dragging');
      setPlaying(false);
      if (session.kind === 'asset') {
        const ghost = document.createElement('div');
        ghost.className = 've-pointer-ghost';
        ghost.textContent = session.label;
        document.body.appendChild(ghost);
        session.ghost = ghost;
      }
    }
    event.preventDefault();

    const scroll = timelineScrollRef.current;
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      if (event.clientX > rect.right - 44) scroll.scrollLeft += 18;
      if (event.clientX < rect.left + 44) scroll.scrollLeft -= 18;
    }
    const overTimeline = isOverTimeline(event.clientX, event.clientY);
    setTimelineDropActive(overTimeline);
    session.previewStart = pointToTimelineStart(event.clientX, session.offset);
    if (session.kind !== 'asset') {
      session.sourceElement.style.transform = `translateX(${(session.previewStart - session.originStart) * pixelsPerSecond}px)`;
    }
    if (session.ghost) {
      session.ghost.style.transform = `translate3d(${event.clientX + 14}px, ${event.clientY + 14}px, 0)`;
      session.ghost.classList.toggle('is-over-timeline', overTimeline);
    }
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const session = pointerDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const shouldDrop = session.active && !cancelled && isOverTimeline(event.clientX, event.clientY);
    const start = pointToTimelineStart(event.clientX, session.offset);
    session.sourceElement.classList.remove('is-dragging');
    session.sourceElement.style.transform = '';
    session.ghost?.remove();
    if (session.sourceElement.hasPointerCapture(event.pointerId)) session.sourceElement.releasePointerCapture(event.pointerId);
    pointerDragRef.current = null;
    setTimelineDropActive(false);
    if (session.active) window.setTimeout(() => { suppressClickRef.current = false; }, 0);

    if (!shouldDrop) {
      if (cancelled) suppressClickRef.current = false;
      return;
    }
    if (session.kind === 'asset') {
      const asset = assets.find((item) => item.id === session.id);
      if (asset) addAssetAgain(asset, start);
      return;
    }
    commit((current) => ({
      ...current,
      clips: session.kind === 'clip' ? current.clips.map((item) => item.id === session.id ? { ...item, start } : item) : current.clips,
      texts: session.kind === 'text' ? current.texts.map((item) => item.id === session.id ? { ...item, start } : item) : current.texts,
      captions: session.kind === 'caption' ? current.captions.map((item) => item.id === session.id ? { ...item, start } : item) : current.captions,
      selectedId: session.id,
    }));
    setCurrentTime(start);
  };

  const consumeSuppressedClick = (event: React.MouseEvent<HTMLElement>): boolean => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const dropFilesOnTimeline = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const start = pointToTimelineStart(event.clientX);
    void importFiles(Array.from(event.dataTransfer.files), start);
    setDragging(false);
    setTimelineDropActive(false);
  };

  const timelineSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.ve-clip')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = (event.clientX - rect.left + event.currentTarget.scrollLeft - 76) / pixelsPerSecond;
    setCurrentTime(clamp(time, 0, duration));
  };

  const renderComposition = async () => {
    if (visualClips.length === 0) {
      setError('Add at least one video or image before exporting.');
      return;
    }
    if (duration > 180) {
      setError('This browser export is limited to 3 minutes. Trim the timeline or export it in parts.');
      return;
    }
    if (!('MediaRecorder' in window)) {
      setError('This browser cannot render video. Open TribeStudio in a current Chrome, Edge, Firefox or Safari browser.');
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setError(null);
    setPlaying(false);

    const [width, height] = CANVAS_SIZE[project.ratio];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setExporting(false);
      setError('The video renderer could not start.');
      return;
    }

    const mediaElements = new Map<string, HTMLVideoElement | HTMLAudioElement>();
    const images = new Map<string, HTMLImageElement>();
    const audioContext = new AudioContext();
    const audioOutput = audioContext.createMediaStreamDestination();
    const gains = new Map<string, GainNode>();

    try {
      await audioContext.resume();
      await Promise.all(assets.map(async (asset) => {
        if (asset.kind === 'image') {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.src = asset.url;
          await new Promise<void>((resolve, reject) => {
            if (image.complete) { resolve(); return; }
            image.onload = () => resolve();
            image.onerror = () => reject(new Error(`${asset.name} could not be loaded for export.`));
          });
          images.set(asset.id, image);
          return;
        }
        const element = document.createElement(asset.kind === 'video' ? 'video' : 'audio');
        element.crossOrigin = 'anonymous';
        element.preload = 'auto';
        element.src = asset.url;
        if (element instanceof HTMLVideoElement) element.playsInline = true;
        await new Promise<void>((resolve, reject) => {
          if (element.readyState >= 2) { resolve(); return; }
          element.onloadeddata = () => resolve();
          element.onerror = () => reject(new Error(`${asset.name} could not be loaded for export.`));
          element.load();
        });
        const source = audioContext.createMediaElementSource(element);
        const gain = audioContext.createGain();
        source.connect(gain).connect(audioOutput);
        gains.set(asset.id, gain);
        mediaElements.set(asset.id, element);
      }));

      const canvasStream = canvas.captureStream(30);
      const stream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioOutput.stream.getAudioTracks(),
      ]);
      const mimeCandidates = [
        'video/mp4;codecs=h264,aac',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 5_500_000 } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('The browser stopped while rendering the video.'));
      });
      recorder.start(1000);

      const started = performance.now();
      await new Promise<void>((resolve, reject) => {
        let lastVisualId = '';
        const draw = (now: number) => {
          try {
            const time = Math.min(duration, (now - started) / 1000);
            context.save();
            context.fillStyle = project.background;
            context.fillRect(0, 0, width, height);
            context.restore();

            const visual = visualClips.find((clip) => time >= clip.start && time < clip.start + clip.duration);
            for (const [assetId, element] of mediaElements) {
              const matchingVisual = visual?.assetId === assetId;
              const matchingAudio = project.clips.some((clip) => clip.kind === 'audio' && clip.assetId === assetId && time >= clip.start && time < clip.start + clip.duration);
              if (!matchingVisual && !matchingAudio && !element.paused) element.pause();
            }

            if (visual) {
              const asset = assets.find((item) => item.id === visual.assetId);
              if (asset) {
                context.save();
                context.filter = filterCss(visual.filter);
                context.globalAlpha = clipOpacity(visual, time);
                if (visual.transition === 'slide') {
                  const local = time - visual.start;
                  const edge = Math.min(0.4, visual.duration / 3);
                  const offset = local < edge ? (1 - local / edge) * width * 0.12
                    : visual.duration - local < edge ? -((edge - (visual.duration - local)) / edge) * width * 0.12
                      : 0;
                  context.translate(offset, 0);
                }
                if (visual.transition === 'flash') {
                  const local = time - visual.start;
                  if (local < 0.16) {
                    context.fillStyle = '#fff';
                    context.fillRect(0, 0, width, height);
                  }
                }
                if (asset.kind === 'image') {
                  const image = images.get(asset.id);
                  if (image) drawFittedMedia(context, image, image.naturalWidth, image.naturalHeight, width, height, visual.fit, visual.rotation, visual.flipX);
                } else {
                  const element = mediaElements.get(asset.id) as HTMLVideoElement | undefined;
                  if (element) {
                    const desired = visual.sourceStart + (time - visual.start) * visual.speed;
                    if (lastVisualId !== visual.id || Math.abs(element.currentTime - desired) > 0.22) element.currentTime = desired;
                    element.playbackRate = visual.speed;
                    gains.get(asset.id)!.gain.value = visual.volume;
                    if (element.paused) void element.play();
                    if (element.readyState >= 2) drawFittedMedia(context, element, element.videoWidth, element.videoHeight, width, height, visual.fit, visual.rotation, visual.flipX);
                    lastVisualId = visual.id;
                  }
                }
                context.restore();
              }
            }

            for (const audioClip of project.clips.filter((clip) => clip.kind === 'audio' && time >= clip.start && time < clip.start + clip.duration)) {
              const element = mediaElements.get(audioClip.assetId);
              if (!element) continue;
              const desired = audioClip.sourceStart + (time - audioClip.start) * audioClip.speed;
              if (Math.abs(element.currentTime - desired) > 0.22) element.currentTime = desired;
              element.playbackRate = audioClip.speed;
              gains.get(audioClip.assetId)!.gain.value = audioClip.volume;
              if (element.paused) void element.play();
            }

            for (const text of project.texts.filter((item) => time >= item.start && time < item.start + item.duration)) {
              const fontSize = Math.round(text.size * (width / 720));
              context.save();
              context.font = `${text.weight} ${fontSize}px system-ui, sans-serif`;
              context.textAlign = 'center';
              context.textBaseline = 'top';
              const x = (text.x / 100) * width;
              const y = (text.y / 100) * height;
              if (text.background) {
                const measured = Math.min(width * 0.84, context.measureText(text.text).width + 44);
                context.fillStyle = 'rgba(0,0,0,.58)';
                context.fillRect(x - measured / 2, y - 12, measured, fontSize * 1.45);
              }
              context.fillStyle = text.color;
              context.shadowColor = 'rgba(0,0,0,.55)';
              context.shadowBlur = 10;
              drawWrappedText(context, text.text, x, y, width * 0.82, fontSize * 1.15);
              context.restore();
            }

            const caption = project.captions.find((item) => time >= item.start && time < item.start + item.duration);
            if (caption) {
              const fontSize = Math.round(32 * (width / 720));
              context.save();
              context.font = `800 ${fontSize}px system-ui, sans-serif`;
              context.textAlign = 'center';
              context.textBaseline = 'middle';
              context.fillStyle = 'rgba(4,7,13,.76)';
              context.fillRect(width * 0.07, height * 0.81, width * 0.86, height * 0.12);
              context.fillStyle = '#fff';
              drawWrappedText(context, caption.text, width / 2, height * 0.865, width * 0.78, fontSize * 1.18);
              context.restore();
            }

            setExportProgress(Math.round((time / duration) * 100));
            if (time >= duration) { resolve(); return; }
            requestAnimationFrame(draw);
          } catch (reason) {
            reject(reason);
          }
        };
        requestAnimationFrame(draw);
      });

      for (const element of mediaElements.values()) element.pause();
      recorder.stop();
      await stopped;
      const actualType = recorder.mimeType || mimeType || 'video/webm';
      const extension = actualType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: actualType });
      const url = URL.createObjectURL(blob);
      setExported((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { blob, url, extension };
      });
      setExportProgress(100);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The video could not be rendered.');
    } finally {
      for (const element of mediaElements.values()) element.pause();
      await audioContext.close().catch(() => undefined);
      setExporting(false);
    }
  };

  const useInPost = async () => {
    if (!exported || !user) return;
    setPosting(true);
    setUploadPct(0);
    setError(null);
    try {
      const safeName = project.name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'tribestudio-edit';
      const file = new File([exported.blob], `${safeName}.${exported.extension}`, { type: exported.blob.type });
      const storagePath = await uploadStudioVideoAsset(user.uid, 'video', file, setUploadPct);
      navigate(`/studio/submissions/new?generated=${encodeURIComponent(storagePath)}&edited=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The edited video could not be prepared for posting.');
      setPosting(false);
    }
  };

  const toggleAiLibrary = () => {
    const opening = !aiLibraryOpen;
    setAiLibraryOpen(opening);
    if (!opening || aiJobsLoading || !user) return;
    setAiJobsLoading(true);
    setError(null);
    void fetchMyStudioVideoJobs(user.uid)
      .then((jobs) => {
        setAiJobs(jobs.filter((job) => job.status === 'SUCCEEDED' && Boolean(job.outputStoragePath)));
        setAiJobsLoaded(true);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Your AI videos could not be loaded.');
      })
      .finally(() => setAiJobsLoading(false));
  };

  const importAiVideo = async (job: StudioVideoJob) => {
    const existing = assets.find((asset) => asset.jobId === job.id);
    if (existing) {
      addAssetAgain(existing);
      setSourceStatus('AI video added to the timeline');
      window.setTimeout(() => setSourceStatus(null), 2600);
      return;
    }
    setAiImportingId(job.id);
    setError(null);
    try {
      const playback = await fetchStudioVideoPlayback(job.id);
      const mediaDuration = await readMediaDuration(playback.playbackUrl, 'video');
      addAsset({
        id: newId('asset'),
        name: job.prompt?.trim() || 'AI-generated video',
        kind: 'video',
        url: playback.playbackUrl,
        duration: mediaDuration,
        source: 'ai',
        objectUrl: false,
        jobId: job.id,
      });
      setSourceStatus('AI video imported and added to the timeline');
      window.setTimeout(() => setSourceStatus(null), 3000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That AI video could not be imported.');
    } finally {
      setAiImportingId(null);
    }
  };

  const tabPanel = (() => {
    if (activeTab === 'media' || activeTab === 'audio') {
      const shown = assets.filter((asset) => activeTab === 'audio' ? asset.kind === 'audio' : asset.kind !== 'audio');
      return (
        <>
          <div className="ve-panel__head"><div><h2>{activeTab === 'audio' ? 'Audio' : 'Your media'}</h2><p>{activeTab === 'audio' ? 'Music, narration and sound' : 'Videos, images and AI creations'}</p></div></div>
          <button type="button" className="ve-import" onClick={() => fileInputRef.current?.click()}><Icon name="upload" /><span><strong>Import from device</strong><small>Video, image or audio</small></span></button>
          {activeTab === 'media' ? (
            <>
              <button type="button" className="ve-import ve-import--ai" aria-expanded={aiLibraryOpen} onClick={toggleAiLibrary}><Icon name="effects" /><span><strong>Import AI video</strong><small>Your completed TribeStudio generations</small></span><b>{aiLibraryOpen ? '−' : '+'}</b></button>
              {aiLibraryOpen ? (
                <div className="ve-ai-library">
                  {aiJobsLoading ? <p>Loading your AI videos…</p> : aiJobs.length === 0 ? <p>{aiJobsLoaded ? 'No completed AI videos yet.' : 'Your AI videos could not be loaded.'}</p> : aiJobs.map((job) => (
                    <button type="button" key={job.id} disabled={aiImportingId !== null} onClick={() => void importAiVideo(job)}>
                      <span><strong>{job.prompt?.trim() || 'AI-generated video'}</strong><small>{job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'Ready to edit'}</small></span>
                      <b>{aiImportingId === job.id ? 'Opening…' : assets.some((asset) => asset.jobId === job.id) ? 'Add again' : 'Import'}</b>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {shown.length > 0 ? (
            <div className="ve-assets">
              {shown.map((asset) => (
                <button type="button" className="ve-asset" key={asset.id} title="Click to add, or drag onto the timeline" onPointerDown={(event) => beginPointerDrag(event, 'asset', asset.id, asset.name)} onPointerMove={movePointerDrag} onPointerUp={(event) => finishPointerDrag(event)} onPointerCancel={(event) => finishPointerDrag(event, true)} onClick={(event) => { if (!consumeSuppressedClick(event)) addAssetAgain(asset); }}>
                  <span className={`ve-asset__thumb ve-asset__thumb--${asset.kind}`}>
                    {asset.kind === 'image' ? <img src={asset.url} alt="" /> : <Icon name={asset.kind === 'audio' ? 'audio' : 'media'} />}
                    {asset.source === 'ai' ? <b>AI</b> : null}
                  </span>
                  <span><strong>{asset.name}</strong><small>{asset.kind === 'image' ? 'Still · 4.0s' : `${asset.kind} · ${formatTime(asset.duration)}`}</small></span>
                  <Icon name="plus" />
                </button>
              ))}
            </div>
          ) : <p className="ve-panel__empty">{activeTab === 'audio' ? 'Import a recording or music file to add an audio track.' : 'Imported media appears here and on your timeline.'}</p>}
        </>
      );
    }
    if (activeTab === 'text') {
      return (
        <>
          <div className="ve-panel__head"><div><h2>Text</h2><p>Titles and on-screen context</p></div></div>
          <button type="button" className="ve-add-card" onClick={addText}><span className="ve-add-card__sample">Aa</span><span><strong>Add text</strong><small>Place it at the playhead</small></span></button>
          <div className="ve-template-grid">
            {['Story title', 'Place & date', 'Speaker name', 'Kasem proverb'].map((label, index) => (
              <button type="button" key={label} onClick={() => {
                const item: TextOverlay = { id: newId('text'), text: label, start: currentTime, duration: 3, x: 50, y: index % 2 === 0 ? 22 : 72, color: index === 3 ? '#f4c76a' : '#ffffff', size: index === 0 ? 54 : 34, weight: index === 0 ? 800 : 600, background: index === 2 };
                commit((current) => ({ ...current, texts: [...current.texts, item], selectedId: item.id }));
              }}>{label}</button>
            ))}
          </div>
        </>
      );
    }
    if (activeTab === 'captions') {
      return (
        <>
          <div className="ve-panel__head"><div><h2>Smart captions</h2><p>Time a transcript to the video</p></div></div>
          <label className="ve-field"><span>Language</span><select value={captionLanguage} onChange={(event) => setCaptionLanguage(event.target.value)}><option value="xsm">Kasem</option><option value="en">English</option><option value="fr">French</option></select></label>
          <label className="ve-field"><span>Transcript</span><textarea rows={7} value={captionDraft} onChange={(event) => setCaptionDraft(event.target.value)} placeholder="Paste the spoken words. Put each caption on a new line, or let TribeStudio split sentences." /></label>
          <button type="button" className="ve-panel-button ve-panel-button--primary" onClick={makeCaptions}>Create timed captions</button>
          <p className="ve-panel__note">Caption timing is a first pass. Select any cue on the timeline to correct its words or timing. Language: {captionLanguage.toUpperCase()}.</p>
        </>
      );
    }
    if (activeTab === 'effects') {
      return (
        <>
          <div className="ve-panel__head"><div><h2>Looks</h2><p>Apply a color treatment to a clip</p></div></div>
          <div className="ve-filter-grid">
            {FILTERS.map((filter) => (
              <button type="button" key={filter.id} className={selectedClip?.filter === filter.id ? 'is-on' : ''} disabled={!selectedClip || selectedClip.kind === 'audio'} onClick={() => selectedClip && patchClip(selectedClip.id, { filter: filter.id })}>
                <span style={{ background: filter.swatch }} /><strong>{filter.label}</strong>
              </button>
            ))}
          </div>
          {!selectedClip ? <p className="ve-panel__note">Select a video or image clip first.</p> : null}
        </>
      );
    }
    return (
      <>
        <div className="ve-panel__head"><div><h2>Transitions</h2><p>Soften or stylise a cut</p></div></div>
        <div className="ve-transition-list">
          {TRANSITIONS.map((transition) => (
            <button type="button" key={transition.id} className={selectedClip?.transition === transition.id ? 'is-on' : ''} disabled={!selectedClip || selectedClip.kind === 'audio'} onClick={() => selectedClip && patchClip(selectedClip.id, { transition: transition.id })}>
              <span>{transition.glyph}</span><strong>{transition.label}</strong><small>{transition.id === 'none' ? 'Instant cut' : `${transition.label} in and out`}</small>
            </button>
          ))}
        </div>
        {!selectedClip ? <p className="ve-panel__note">Select a clip, then choose how it enters and leaves.</p> : null}
      </>
    );
  })();

  return (
    <div className="ve page" onDragEnter={(event) => { if (hasFiles(event.dataTransfer)) { event.preventDefault(); setDragging(true); } }} onDragOver={(event) => { if (hasFiles(event.dataTransfer)) event.preventDefault(); }} onDragLeave={(event) => { if (dragging && !event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event: DragEvent<HTMLDivElement>) => { if (!hasFiles(event.dataTransfer)) return; event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files)); }}>
      <input ref={fileInputRef} className="ve-file-input" type="file" multiple accept="video/*,image/*,audio/*" onChange={handleFiles} />

      <header className="ve-topbar">
        <div className="ve-project">
          <button type="button" className="ve-back" aria-label="Back to TribeStudio" title="Back to TribeStudio" onClick={() => navigate('/studio')}><Icon name="back" /></button>
          <span className="ve-project__mark"><Icon name="media" /></span>
          <label><span>Video editor</span><input aria-label="Project name" value={project.name} maxLength={80} onChange={(event) => setProject((current) => ({ ...current, name: event.target.value }))} /></label>
        </div>
        <div className="ve-topbar__tools">
          <span className="ve-save-state">Private draft</span>
          <button type="button" className="ve-icon-button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled={historyRef.current.length === 0} onClick={undo}><Icon name="undo" /></button>
          <button type="button" className="ve-icon-button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" disabled={redoRef.current.length === 0} onClick={redo}><Icon name="redo" /></button>
          <button type="button" className="ve-export-button" disabled={exporting || visualClips.length === 0} onClick={() => void renderComposition()}><Icon name="download" />{exporting ? `Rendering ${exportProgress}%` : 'Export'}</button>
        </div>
      </header>

      {dragging ? <div className="ve-drop-overlay"><Icon name="upload" /><strong>Drop media into your project</strong><span>Videos, images and audio stay private until you post.</span></div> : null}
      {sourceStatus ? <div className="ve-toast" role="status">{sourceStatus}</div> : null}

      <div className={`ve-workspace${hasSelection ? '' : ' ve-workspace--no-inspector'}`}>
        <nav className="ve-toolrail" aria-label="Editing tools">
          {([
            ['media', 'Media'], ['audio', 'Audio'], ['text', 'Text'], ['captions', 'Captions'], ['effects', 'Looks'], ['transitions', 'Transitions'],
          ] as Array<[EditorTab, string]>).map(([id, label]) => (
            <button type="button" key={id} className={activeTab === id ? 'is-on' : ''} onClick={() => setActiveTab(id)}><Icon name={id === 'effects' ? 'effects' : id} /><span>{label}</span></button>
          ))}
        </nav>

        <aside className="ve-library">{tabPanel}</aside>

        <main className="ve-stage-area">
          <div className="ve-canvas-tools">
            <div className="ve-canvas-tools__left">
              <div className="ve-ratios" role="group" aria-label="Canvas format">
                {RATIOS.map((ratio) => <button type="button" key={ratio.id} className={project.ratio === ratio.id ? 'is-on' : ''} title={ratio.hint} onClick={() => commit((current) => ({ ...current, ratio: ratio.id }))}>{ratio.label}</button>)}
              </div>
              <label className="ve-background" title="Canvas background colour"><span>Background</span><input type="color" aria-label="Canvas background colour" value={project.background} onChange={(event) => commit((current) => ({ ...current, background: event.target.value }))} /></label>
            </div>
            <span>{activeVisual ? activeVisual.name : 'Preview'}</span>
          </div>
          <div className="ve-stage-wrap">
            <div className={`ve-canvas ve-canvas--${project.ratio.replace(':', '-')}`} style={{ background: project.background }}>
              {activeAsset && activeVisual ? (
                <div className={`ve-media-frame ve-media-frame--${activeVisual.fit} ve-transition--${activeVisual.transition}`} style={{ opacity: clipOpacity(activeVisual, currentTime), filter: filterCss(activeVisual.filter), transform: `rotate(${activeVisual.rotation}deg) scaleX(${activeVisual.flipX ? -1 : 1})` }}>
                  {activeAsset.kind === 'video' ? <video key={activeAsset.id} ref={videoRef} src={activeAsset.url} playsInline preload="auto" onLoadedData={() => { if (videoRef.current && activeVisual) videoRef.current.currentTime = activeVisual.sourceStart + (currentTime - activeVisual.start) * activeVisual.speed; }} /> : <img src={activeAsset.url} alt="" />}
                </div>
              ) : (
                <button type="button" className="ve-empty-stage" onClick={() => fileInputRef.current?.click()}><span><Icon name="upload" /></span><strong>Bring in a video</strong><small>Upload your own footage, or open an AI creation from Your videos.</small></button>
              )}
              {activeTexts.map((item) => (
                <button type="button" key={item.id} className={`ve-preview-text${project.selectedId === item.id ? ' is-selected' : ''}${item.background ? ' has-background' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%`, color: item.color, fontSize: `${item.size}px`, fontWeight: item.weight }} onClick={() => setProject((current) => ({ ...current, selectedId: item.id }))}>{item.text}</button>
              ))}
              {activeCaption ? <button type="button" className={`ve-preview-caption${project.selectedId === activeCaption.id ? ' is-selected' : ''}`} onClick={() => setProject((current) => ({ ...current, selectedId: activeCaption.id }))}>{activeCaption.text}</button> : null}
            </div>
          </div>
          {activeAudioAsset ? <audio key={activeAudioAsset.id} ref={audioRef} src={activeAudioAsset.url} preload="auto" /> : null}
          <div className="ve-playback">
            <button type="button" className="ve-transport" disabled={duration <= 0} aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (currentTime >= duration) setCurrentTime(0); setPlaying((value) => !value); }}><Icon name={playing ? 'pause' : 'play'} /></button>
            <span className="ve-time"><strong>{formatTime(currentTime)}</strong> / {formatTime(duration)}</span>
            <input type="range" min={0} max={Math.max(duration, 0.1)} step={0.01} value={currentTime} aria-label="Playhead" onChange={(event) => { setPlaying(false); setCurrentTime(Number(event.target.value)); }} />
          </div>
        </main>

        {hasSelection ? <aside className="ve-inspector">
          <div className="ve-inspector__head"><div><span>Inspector</span><strong>{selectedClip?.name ?? (selectedText ? 'Text overlay' : selectedCaption ? 'Caption cue' : 'Project')}</strong></div>{project.selectedId ? <button type="button" aria-label="Clear selection" onClick={() => setProject((current) => ({ ...current, selectedId: null }))}>×</button> : null}</div>
          {selectedClip ? (
            <div className="ve-inspector__body">
              <div className="ve-inspector__actions"><button type="button" onClick={duplicateSelected}><Icon name="duplicate" />Duplicate</button><button type="button" onClick={deleteSelected}><Icon name="trash" />Delete</button></div>
              <section><h3>Timing</h3><div className="ve-control-grid"><label><span>Timeline</span><input type="number" min={0} step={0.1} value={selectedClip.start.toFixed(1)} onChange={(event) => patchClip(selectedClip.id, { start: Math.max(0, Number(event.target.value)) })} /></label><label><span>Length</span><input type="number" min={0.2} step={0.1} value={selectedClip.duration.toFixed(1)} onChange={(event) => patchClip(selectedClip.id, { duration: Math.max(0.2, Number(event.target.value)) })} /></label><label><span>Trim in</span><input type="number" min={0} step={0.1} value={selectedClip.sourceStart.toFixed(1)} onChange={(event) => patchClip(selectedClip.id, { sourceStart: Math.max(0, Number(event.target.value)) })} /></label></div><label className="ve-range"><span>Speed <b>{selectedClip.speed.toFixed(1)}×</b></span><input type="range" min={0.25} max={3} step={0.25} value={selectedClip.speed} onChange={(event) => patchClip(selectedClip.id, { speed: Number(event.target.value) })} /></label></section>
              <section><h3>Sound</h3><label className="ve-range"><span>Volume <b>{Math.round(selectedClip.volume * 100)}%</b></span><input type="range" min={0} max={1} step={0.05} value={selectedClip.volume} onChange={(event) => patchClip(selectedClip.id, { volume: Number(event.target.value) })} /></label></section>
              {selectedClip.kind !== 'audio' ? <section><h3>Frame</h3><div className="ve-segmented"><button type="button" className={selectedClip.fit === 'cover' ? 'is-on' : ''} onClick={() => patchClip(selectedClip.id, { fit: 'cover' })}>Fill</button><button type="button" className={selectedClip.fit === 'contain' ? 'is-on' : ''} onClick={() => patchClip(selectedClip.id, { fit: 'contain' })}>Fit</button></div><div className="ve-inspector__actions"><button type="button" onClick={() => patchClip(selectedClip.id, { rotation: (selectedClip.rotation + 90) % 360 })}>Rotate 90°</button><button type="button" onClick={() => patchClip(selectedClip.id, { flipX: !selectedClip.flipX })}>Mirror</button></div></section> : null}
            </div>
          ) : selectedText ? (
            <div className="ve-inspector__body"><label className="ve-field"><span>Words</span><textarea rows={4} value={selectedText.text} onChange={(event) => patchText(selectedText.id, { text: event.target.value })} /></label><section><h3>Style</h3><div className="ve-control-grid"><label><span>Size</span><input type="number" min={16} max={96} value={selectedText.size} onChange={(event) => patchText(selectedText.id, { size: clamp(Number(event.target.value), 16, 96) })} /></label><label><span>Colour</span><input type="color" value={selectedText.color} onChange={(event) => patchText(selectedText.id, { color: event.target.value })} /></label></div><label className="ve-check"><input type="checkbox" checked={selectedText.background} onChange={(event) => patchText(selectedText.id, { background: event.target.checked })} />Add readable background</label></section><section><h3>Position</h3><label className="ve-range"><span>Across</span><input type="range" min={10} max={90} value={selectedText.x} onChange={(event) => patchText(selectedText.id, { x: Number(event.target.value) })} /></label><label className="ve-range"><span>Down</span><input type="range" min={8} max={88} value={selectedText.y} onChange={(event) => patchText(selectedText.id, { y: Number(event.target.value) })} /></label></section><button type="button" className="ve-danger" onClick={deleteSelected}><Icon name="trash" />Delete text</button></div>
          ) : selectedCaption ? (
            <div className="ve-inspector__body"><label className="ve-field"><span>Caption</span><textarea rows={4} value={selectedCaption.text} onChange={(event) => patchCaption(selectedCaption.id, { text: event.target.value })} /></label><section><h3>Timing</h3><div className="ve-control-grid"><label><span>Starts</span><input type="number" min={0} step={0.1} value={selectedCaption.start.toFixed(1)} onChange={(event) => patchCaption(selectedCaption.id, { start: Math.max(0, Number(event.target.value)) })} /></label><label><span>Length</span><input type="number" min={0.4} step={0.1} value={selectedCaption.duration.toFixed(1)} onChange={(event) => patchCaption(selectedCaption.id, { duration: Math.max(0.4, Number(event.target.value)) })} /></label></div></section><button type="button" className="ve-danger" onClick={deleteSelected}><Icon name="trash" />Delete caption</button></div>
          ) : null}
        </aside> : null}

        <section className="ve-timeline" aria-label="Timeline editor">
          <div className="ve-timeline__toolbar">
            <div><button type="button" disabled={!selectedClip} onClick={splitSelected}><Icon name="split" />Split <kbd>S</kbd></button><button type="button" disabled={!project.selectedId} onClick={deleteSelected}><Icon name="trash" />Delete</button><button type="button" disabled={!selectedClip && !selectedText} onClick={duplicateSelected}><Icon name="duplicate" />Duplicate</button></div>
            <label><span>Timeline zoom</span><input type="range" min={0.6} max={2.2} step={0.2} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          </div>
          <div
            ref={timelineScrollRef}
            className={`ve-timeline__scroll${timelineDropActive ? ' is-drop-target' : ''}`}
            onClick={timelineSeek}
            onDragEnter={(event) => { if (hasFiles(event.dataTransfer)) { event.preventDefault(); setTimelineDropActive(true); } }}
            onDragOver={(event) => { if (hasFiles(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setTimelineDropActive(true); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setTimelineDropActive(false); }}
            onDrop={dropFilesOnTimeline}
          >
            <div className="ve-timeline__body" style={{ width: `${Math.max(840, 92 + duration * pixelsPerSecond)}px` }}>
              <div className="ve-ruler"><span>Time</span>{Array.from({ length: Math.ceil(duration / 2) + 2 }, (_, index) => <i key={index} style={{ left: `${76 + index * 2 * pixelsPerSecond}px` }}>{formatTime(index * 2).replace('.0', '')}</i>)}</div>
              {([
                ['Video', project.clips.filter((clip) => clip.kind !== 'audio')],
                ['Audio', project.clips.filter((clip) => clip.kind === 'audio')],
              ] as Array<[string, TimelineClip[]]>).map(([label, clips]) => (
                <div className="ve-track" key={label}><span className="ve-track__label">{label}</span>{clips.map((clip) => <button type="button" key={clip.id} className={`ve-clip ve-clip--${clip.kind}${project.selectedId === clip.id ? ' is-selected' : ''}`} style={{ left: `${76 + clip.start * pixelsPerSecond}px`, width: `${Math.max(46, clip.duration * pixelsPerSecond)}px` }} title={`${clip.name} · ${formatTime(clip.duration)} · Drag to move`} onPointerDown={(event) => beginPointerDrag(event, 'clip', clip.id, clip.name, clip.start)} onPointerMove={movePointerDrag} onPointerUp={(event) => finishPointerDrag(event)} onPointerCancel={(event) => finishPointerDrag(event, true)} onClick={(event) => { if (consumeSuppressedClick(event)) return; event.stopPropagation(); setProject((current) => ({ ...current, selectedId: clip.id })); setCurrentTime(clip.start); }}><span>{clip.kind === 'audio' ? '∿∿∿' : clip.name}</span><small>{formatTime(clip.duration)}</small></button>)}</div>
              ))}
              <div className="ve-track ve-track--text"><span className="ve-track__label">Text</span>{project.texts.map((item) => <button type="button" key={item.id} className={`ve-clip ve-clip--text${project.selectedId === item.id ? ' is-selected' : ''}`} style={{ left: `${76 + item.start * pixelsPerSecond}px`, width: `${Math.max(46, item.duration * pixelsPerSecond)}px` }} title="Drag to move text" onPointerDown={(event) => beginPointerDrag(event, 'text', item.id, item.text, item.start)} onPointerMove={movePointerDrag} onPointerUp={(event) => finishPointerDrag(event)} onPointerCancel={(event) => finishPointerDrag(event, true)} onClick={(event) => { if (consumeSuppressedClick(event)) return; event.stopPropagation(); setProject((current) => ({ ...current, selectedId: item.id })); setCurrentTime(item.start); }}>{item.text}</button>)}</div>
              <div className="ve-track ve-track--captions"><span className="ve-track__label">Captions</span>{project.captions.map((item) => <button type="button" key={item.id} className={`ve-clip ve-clip--caption${project.selectedId === item.id ? ' is-selected' : ''}`} style={{ left: `${76 + item.start * pixelsPerSecond}px`, width: `${Math.max(46, item.duration * pixelsPerSecond)}px` }} title="Drag to move caption" onPointerDown={(event) => beginPointerDrag(event, 'caption', item.id, item.text, item.start)} onPointerMove={movePointerDrag} onPointerUp={(event) => finishPointerDrag(event)} onPointerCancel={(event) => finishPointerDrag(event, true)} onClick={(event) => { if (consumeSuppressedClick(event)) return; event.stopPropagation(); setProject((current) => ({ ...current, selectedId: item.id })); setCurrentTime(item.start); }}>{item.text}</button>)}</div>
              <div className="ve-playhead" style={{ left: `${76 + currentTime * pixelsPerSecond}px` }}><span /></div>
            </div>
          </div>
        </section>
      </div>

      {error ? <div className="ve-error" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss" onClick={() => setError(null)}>×</button></div> : null}
      {exported ? (
        <div className="ve-export-sheet" role="dialog" aria-modal="true" aria-labelledby="ve-export-title">
          <button type="button" className="ve-export-sheet__backdrop" aria-label="Close export" onClick={() => setExported(null)} />
          <div className="ve-export-sheet__card">
            <span className="ve-export-sheet__check">✓</span><div><p>Export complete</p><h2 id="ve-export-title">Your video is ready to post</h2><span>{project.ratio} · 720p · {formatTime(duration)} · {exported.extension.toUpperCase()}</span></div>
            <video controls playsInline src={exported.url} />
            {posting ? <div className="ve-export-progress"><span style={{ width: `${uploadPct}%` }} /><small>Preparing your post… {uploadPct}%</small></div> : null}
            <div className="ve-export-sheet__actions"><a href={exported.url} download={`${project.name || 'tribestudio-edit'}.${exported.extension}`}><Icon name="download" />Download</a><button type="button" disabled={posting} onClick={() => void useInPost()}>{posting ? 'Preparing…' : 'Continue to post'} →</button></div>
            <small>Your edited file stays private until you finish the posting steps.</small>
          </div>
        </div>
      ) : null}
    </div>
  );
}
