/**
 * The rising lyrics: film credits that know which line is being sung.
 *
 * Every line is laid out once in a single column. On each clock tick the column
 * is moved so the song's current position sits on the focus line, and only the
 * few lines near it have their emphasis (`--e`) rewritten — so a frame costs one
 * transform and a handful of custom properties, not a React render.
 *
 * The column is decorative for assistive technology; the page announces the
 * current line through a polite live region and offers the full lyrics as text.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SongClock } from "./useSongPlayer";
import type { LyricLine } from "./types";
import { lastStartedIndex, lineEmphasis, lyricScroll, scrollOffset } from "./timeline";

interface LyricStreamProps {
  lines: readonly LyricLine[];
  clock: SongClock;
  duration: number;
  reducedMotion: boolean;
  onActiveLineChange?: (index: number) => void;
}

/** How far down the lyric area the sung line rests: the lower middle of the screen. */
const FOCUS_SHARE = 0.64;
/** Lines further than this from the sung line are all equally faint. */
const FADE_DISTANCE = 4;
const EMPHASIS_WINDOW = 3;

export function LyricStream({ lines, clock, duration, reducedMotion, onActiveLineChange }: LyricStreamProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const centres = useRef<number[]>([]);
  const focus = useRef(0);
  const lit = useRef(new Set<number>());
  const [active, setActive] = useState(-1);

  // Measure line centres whenever the layout can have changed.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const column = columnRef.current;
    if (!viewport || !column) return;
    const measure = () => {
      focus.current = viewport.clientHeight * FOCUS_SHARE;
      centres.current = lineRefs.current.map((line) => (line ? line.offsetTop + line.offsetHeight / 2 : 0));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(column);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => observer.disconnect();
  }, [lines]);

  useEffect(() => {
    let lastActive = -2;
    return clock.subscribe((time) => {
      const column = columnRef.current;
      if (!column || centres.current.length === 0) return;

      const scroll = lyricScroll(lines, time, duration, reducedMotion);
      const offset = focus.current - scrollOffset(centres.current, scroll);
      column.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;

      const current = lastStartedIndex(lines, time);
      const from = Math.max(0, current - EMPHASIS_WINDOW);
      const to = Math.min(lines.length - 1, current + EMPHASIS_WINDOW);
      const next = new Set<number>();
      for (let index = from; index <= to; index += 1) {
        const emphasis = lineEmphasis(lines, index, time, reducedMotion);
        const element = lineRefs.current[index];
        if (!element) continue;
        if (emphasis > 0.001) {
          element.style.setProperty("--e", emphasis.toFixed(3));
          next.add(index);
        }
      }
      for (const index of lit.current) {
        if (!next.has(index)) lineRefs.current[index]?.style.removeProperty("--e");
      }
      lit.current = next;

      if (current !== lastActive) {
        lastActive = current;
        setActive(current);
        onActiveLineChange?.(current);
      }
    });
  }, [clock, lines, duration, reducedMotion, onActiveLineChange]);

  return (
    <div className="btr-lyrics" ref={viewportRef} aria-hidden="true">
      <div className="btr-lyrics__column" ref={columnRef}>
        {lines.map((line, index) => (
          <p
            key={index}
            ref={(element) => {
              lineRefs.current[index] = element;
            }}
            className="btr-line"
            data-place={index < active ? "past" : index === active ? "current" : "future"}
            data-stanza-start={index > 0 && lines[index - 1].stanza !== line.stanza ? "" : undefined}
            style={{ "--d": Math.min(FADE_DISTANCE, Math.abs(index - Math.max(0, active))) } as CSSProperties}
          >
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
