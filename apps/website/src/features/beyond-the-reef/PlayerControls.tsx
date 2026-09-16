/**
 * Playback controls: play/pause, restart, seek, time, volume, mute, full screen.
 *
 * The seek bar and the time readout follow the song clock directly (a DOM
 * write per frame, no React render); the bar's accessible value text is
 * refreshed once a second so a screen reader is not flooded.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, KeyboardEvent } from "react";
import { Icon } from "../../components/Icon";
import type { SongPlayer } from "./useSongPlayer";
import type { Chapter } from "./types";
import { formatTime, spokenTime } from "./timeline";

interface PlayerControlsProps {
  player: SongPlayer;
  chapters: readonly Chapter[];
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function PlayerControls({ player, chapters, fullscreen, canFullscreen, onToggleFullscreen }: PlayerControlsProps) {
  const { clock, duration, status, buffering, muted, volume } = player;
  const seekRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const scrubbing = useRef(false);
  const [spoken, setSpoken] = useState(() => spokenTime(0));

  useEffect(() => {
    let lastLabel = "";
    return clock.subscribe((time) => {
      const seek = seekRef.current;
      if (seek && !scrubbing.current) {
        seek.value = String(time);
        seek.style.setProperty("--progress", `${Math.min(100, (time / Math.max(1, duration)) * 100)}%`);
      }
      // At the very end, show the same rounded length as the total beside it.
      const label = formatTime(time >= duration - 0.5 ? Math.round(duration) : time);
      if (label !== lastLabel) {
        lastLabel = label;
        if (timeRef.current) timeRef.current.textContent = label;
        setSpoken(`${spokenTime(time)} of ${spokenTime(duration)}`);
      }
    });
  }, [clock, duration]);

  const onSeekInput = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    event.currentTarget.style.setProperty("--progress", `${(value / Math.max(1, duration)) * 100}%`);
    player.seek(value);
  };

  const onSeekKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 };
    if (event.key in steps) {
      event.preventDefault();
      event.stopPropagation();
      player.seekBy(steps[event.key]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      player.seek(event.key === "Home" ? 0 : duration);
    }
  };

  const playing = status === "playing";
  const silent = muted || volume === 0;

  return (
    <div className="btr-controls" role="group" aria-label="Song player">
      <div className="btr-controls__buttons">
        <button
          type="button"
          className={`btr-control btr-control--primary${buffering && playing ? " is-buffering" : ""}`}
          onClick={player.toggle}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          <Icon name={playing ? "pause" : "play"} size={24} />
        </button>
        <button
          type="button"
          className="btr-control"
          onClick={player.replay}
          aria-label="Restart the song"
          title="Restart (R)"
        >
          <Icon name="replay" size={20} />
        </button>
      </div>

      <div className="btr-controls__timeline">
        <span className="btr-time" ref={timeRef} aria-hidden="true">
          0:00
        </span>
        <div className="btr-seek">
          <input
            ref={seekRef}
            className="btr-range btr-range--seek"
            type="range"
            min={0}
            max={duration}
            step={0.1}
            defaultValue={0}
            aria-label="Song position"
            aria-valuetext={spoken}
            onChange={onSeekInput}
            onKeyDown={onSeekKey}
            onPointerDown={() => {
              scrubbing.current = true;
            }}
            onPointerUp={() => {
              scrubbing.current = false;
            }}
            onPointerCancel={() => {
              scrubbing.current = false;
            }}
            onBlur={() => {
              scrubbing.current = false;
            }}
          />
          <span className="btr-seek__chapters" aria-hidden="true">
            {chapters.slice(1).map((chapter) => (
              <span
                key={chapter.start}
                className="btr-seek__chapter"
                style={{ left: `${(chapter.start / Math.max(1, duration)) * 100}%` }}
                title={chapter.title}
              />
            ))}
          </span>
        </div>
        <span className="btr-time btr-time--total" aria-hidden="true">
          {formatTime(Math.round(duration))}
        </span>
      </div>

      <div className="btr-controls__buttons btr-controls__buttons--end">
        <button
          type="button"
          className="btr-control"
          onClick={player.toggleMute}
          aria-label={silent ? "Unmute" : "Mute"}
          aria-pressed={silent}
          title={silent ? "Unmute (M)" : "Mute (M)"}
        >
          <Icon name={silent ? "volume-off" : "volume"} size={20} />
        </button>
        <input
          className="btr-range btr-range--volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={silent ? 0 : volume}
          aria-label="Volume"
          aria-valuetext={`${Math.round((silent ? 0 : volume) * 100)}%`}
          style={{ "--progress": `${(silent ? 0 : volume) * 100}%` } as CSSProperties}
          onChange={(event) => player.setVolume(Number(event.currentTarget.value))}
          onKeyDown={(event) => event.stopPropagation()}
        />
        {canFullscreen ? (
          <button
            type="button"
            className="btr-control btr-control--fullscreen"
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            title={fullscreen ? "Exit full screen (F)" : "Full screen (F)"}
          >
            <Icon name={fullscreen ? "minimize" : "maximize"} size={20} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
