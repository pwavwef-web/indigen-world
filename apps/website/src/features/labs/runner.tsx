import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { RunnerRun } from "@indigen-world/contracts/labs";
import lexicalSchema from "../../../../../packages/contracts/schemas/lexical-entry.schema.json";
import { errorMessage, labsCall } from "./api";
import { createTrailView, type TrailView } from "./runner-art";
import { TRAIL, jumpTrail, slideTrail, moveTrail, newTrail, nextTrail, tickTrail, trailScore } from "./runner-engine";
import { TrailAudio } from "./runner-audio";
import "./runner.css";

type Mode = "loading" | "ready" | "countdown" | "running" | "paused" | "checkpoint" | "saving" | "gate-error" | "feedback" | "crashed" | "unsupported";
function readSetting(key: string, fallback: boolean) { try { const value = localStorage.getItem(key); return value === null ? fallback : value === "true"; } catch { return fallback; } }
function readBest(practice: boolean) { try { return Number(localStorage.getItem(practice ? "trail-practice-best" : "trail-best")) || 0; } catch { return 0; } }
function TrailPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    let view: TrailView | undefined, resize: ResizeObserver | undefined;
    const init = requestAnimationFrame(() => { try {
      if (!canvas.current) return;
      view = createTrailView(canvas.current);
      const s = newTrail(); s.distance = 65; s.totalDistance = 65;
      s.items = [{ id: 1, lane: 2, kind: "log", hit: false, z: 15 }, { id: 2, lane: 0, kind: "rock", hit: false, z: 28 },
        ...[8, 11, 14].map((z, i) => ({ id: i + 3, lane: 1, kind: "spark" as const, hit: false, z }))];
      const draw = () => { view?.render(s, true, true, false, .05); };
      resize = new ResizeObserver(draw); resize.observe(canvas.current); draw();
    } catch { setFailed(true); } });
    return () => { cancelAnimationFrame(init); resize?.disconnect(); view?.dispose(); };
  }, []);
  return <div className="trail-preview"><canvas ref={canvas} aria-label="Actual Word Trail 3D scene: blue-clad explorer on a sunlit stone trail." role="img" />{failed && <p className="trail-preview-fallback">The 3D preview is unavailable.<br />Try a current browser with WebGL 2.</p>}<span>{failed ? "3D PREVIEW UNAVAILABLE" : "IN-GAME VIEW · THE BLUE HORIZON"}</span></div>;
}
export function RunnerWorkspace({ canContribute = true }: { canContribute?: boolean }) {
  const [playing, setPlaying] = useState(false), [practice, setPractice] = useState(false);
  const launchFocus = useRef<HTMLElement | null>(null);
  return <div className="word-trail">
    <div className="trail-launch">
      {!playing && <TrailPreview />}
      <div className="trail-launch-copy"><span className="trail-kicker">A LANGUAGE ADVENTURE / ALPHA</span>
        <h2>Chase the horizon.<br /><em>Make a word matter.</em></h2>
        <p>A blue horizon, a living trail, and a word that opens the way. Dodge, jump, slide and collect sparks. Every 300 metres, stop safely to share a Kasem translation.</p>
        <div className="trail-launch-actions">
          <button className="trail-primary" disabled={!canContribute} onClick={e => { launchFocus.current = e.currentTarget; setPractice(false); setPlaying(true); }}>Play Word Trail <span>↗</span></button>
          <button className="trail-secondary" onClick={e => { launchFocus.current = e.currentTarget; setPractice(true); setPlaying(true); }}>Try practice · no sign-in</button>
        </div>
        {!canContribute && <p className="trail-launch-note">Sign in above for contribution runs. Availability and invitation rules still apply.</p>}
        <div className="trail-launch-facts"><span><b>300 m</b>between checkpoints</span><span><b>3 hearts</b>one more chance</span><span><b>+100</b>per saved contribution</span></div>
      </div>
    </div>
    <div className="trail-launch-bottom"><p><b>Keyboard</b> A / D or ← / → to switch lanes · Space / ↑ to jump · S / ↓ to slide · Esc to pause.</p><p><b>Touch</b> Swipe in the direction you want, or use the large on-screen controls. Sound is optional.</p><p>Practice runs stay on this device. Run score has no cash value. Contributions enter community review.</p></div>
    {playing && createPortal(<TrailGame key={practice ? "practice" : "contribute"} practice={practice} onExit={() => { setPlaying(false); requestAnimationFrame(() => launchFocus.current?.focus()); }} />, document.body)}
  </div>;
}
function TrailGame({ practice: initialPractice, onExit }: { practice: boolean; onExit: () => void }) {
  const [practice, setPractice] = useState(initialPractice), [run, setRun] = useState<RunnerRun | null>(null);
  const [mode, setModeState] = useState<Mode>("loading"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [hud, setHud] = useState({ distance: 0, total: 0, score: 0, lives: 3, coins: 0 });
  const [count, setCount] = useState(3), [best, setBest] = useState(() => readBest(initialPractice));
  const [translation, setTranslation] = useState(""), [dialect, setDialect] = useState(""), [wordClass, setWordClass] = useState(""), [notes, setNotes] = useState("");
  const [previousDraft, setPreviousDraft] = useState<{ word: string; translation: string; dialect: string; wordClass: string; notes: string } | null>(null);
  const [publish, setPublish] = useState(true), [training, setTraining] = useState(false), [credit, setCredit] = useState(false);
  const [muted, setMuted] = useState(() => readSetting("trail-muted", true));
  const [calm, setCalm] = useState(() => readSetting("trail-calm", matchMedia("(prefers-reduced-motion: reduce)").matches));
  const [shake, setShake] = useState(() => readSetting("trail-shake", false));
  const [touch, setTouch] = useState(() => readSetting("trail-touch", true));
  const [flash, setFlash] = useState(""), [fullscreenNote, setFullscreenNote] = useState("");
  const shell = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), panel = useRef<HTMLDivElement>(null);
  const translationInput = useRef<HTMLInputElement>(null);
  const engine = useRef(newTrail(1, initialPractice)), view = useRef<TrailView | null>(null), audio = useRef(new TrailAudio());
  const modeRef = useRef<Mode>("loading"), runRef = useRef<RunnerRun | null>(null), practiceRef = useRef(initialPractice);
  const live = useRef(true), lock = useRef(false), baseScore = useRef(0), savedCount = useRef(0);
  const resumeMode = useRef<Mode>("running"), countdown = useRef(0), swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const eventId = useRef(0), continuation = useRef(false);
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };
  async function request(action: string, data: Record<string, unknown> = {}) {
    if (lock.current) throw new Error("A trail request is already in progress.");
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await labsCall<{ run: RunnerRun }>(action, data);
      if (live.current) { runRef.current = result.run; setRun(result.run); }
      return result.run;
    } catch (e) { if (live.current) setError(errorMessage(e)); throw e; }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  const scoreNow = () => {
    const s = engine.current;
    if (s.status === "checkpoint") {
      if (practiceRef.current) return baseScore.current;
      const saved = runRef.current;
      if (saved && (saved.phase === "checkpoint" || saved.lastReceipt?.section === s.section)) return saved.score;
    }
    return baseScore.current + trailScore(s);
  };
  const refreshHud = () => {
    const s = engine.current;
    setHud({ distance: Math.floor(s.distance), total: Math.floor(s.totalDistance),
      score: scoreNow(), lives: s.lives, coins: s.coins });
  };
  useEffect(() => {
    live.current = true;
    const root = document.getElementById("root"), oldOverflow = document.body.style.overflow;
    const oldInert = root?.inert ?? false, oldAria = root?.getAttribute("aria-hidden");
    document.body.style.overflow = "hidden"; if (root) { root.inert = true; root.setAttribute("aria-hidden", "true"); }
    const resize = () => { shell.current?.style.setProperty("--trail-height", (window.visualViewport?.height ?? innerHeight) + "px"); };
    window.visualViewport?.addEventListener("resize", resize); window.addEventListener("resize", resize); resize();
    // Yield the click event so the loading shell can paint before actual shader preparation.
    const init = requestAnimationFrame(() => {
    try { view.current = createTrailView(canvas.current!); view.current.render(engine.current, false, calm, false, .05); }
    catch { setMode("unsupported"); }
    if (view.current) {
      if (initialPractice) setMode("ready");
      else void request("runner").then(r => {
        if (!live.current) return;
        engine.current = newTrail(r.section); baseScore.current = r.score; savedCount.current = r.checkpoints;
        if (r.phase === "checkpoint") {
          engine.current.distance = TRAIL.checkpointMetres; engine.current.totalDistance = r.section * TRAIL.checkpointMetres;
          engine.current.status = "checkpoint"; setMode("checkpoint");
        } else setMode("ready");
        refreshHud();
      }).catch(() => { if (live.current) setMode("ready"); });
    }
    });
    const hidden = () => {
      if (document.hidden) {
        audio.current.pause();
        if (["running", "countdown"].includes(modeRef.current)) { resumeMode.current = "running"; setMode("paused"); }
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      live.current = false; cancelAnimationFrame(init); view.current?.dispose(); view.current = null; audio.current.dispose();
      document.body.style.overflow = oldOverflow;
      if (root) { root.inert = oldInert; if (oldAria === null) root.removeAttribute("aria-hidden"); else root.setAttribute("aria-hidden", oldAria!); }
      window.visualViewport?.removeEventListener("resize", resize); window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", hidden);
      if (document.fullscreenElement === shell.current) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    audio.current.mute(muted);
    try { localStorage.setItem("trail-muted", String(muted)); localStorage.setItem("trail-calm", String(calm)); localStorage.setItem("trail-shake", String(shake)); localStorage.setItem("trail-touch", String(touch)); } catch { /* Device storage is optional. */ }
  }, [muted, calm, shake, touch]);
  // The loop owns simulation/rendering; React only receives a compact HUD at 8 Hz.
  useEffect(() => {
    let frame = 0, previous = 0, lastHud = 0, lastDraw = 0;
    const loop = (time: number) => {
      const dt = previous ? Math.max(0, Math.min((time - previous) / 1000, TRAIL.maxDelta)) : 0; previous = time;
      const m = modeRef.current, s = engine.current;
      if (m === "countdown") {
        countdown.current -= dt;
        const n = Math.max(1, Math.ceil(countdown.current)); setCount(c => c === n ? c : n);
        if (countdown.current <= 0) { setMode("running"); shell.current?.focus(); }
      }
      if (m === "running") {
        tickTrail(s, dt);
        if (!muted && s.jump === 0 && s.slide === 0) audio.current.footsteps(s.totalDistance);
        if (s.eventId !== eventId.current) {
          eventId.current = s.eventId; audio.current.cue(s.event);
          setFlash(s.event === "hit" ? "Ouch · a heart lost" : s.event === "pickup" ? trailScore(s) >= TRAIL.sectionScoreCap ? "Spark collected · section score capped" : "+10 · spark collected" : "");
        }
        if (s.status === "checkpoint") { audio.current.cue("checkpoint"); void reachCheckpoint(); }
        else if (s.status === "crashed") {
          audio.current.pause(); refreshHud(); setMode("crashed");
          const score = baseScore.current + trailScore(s), previousBest = readBest(practiceRef.current);
          if (score > previousBest) {
            setBest(score); try { localStorage.setItem(practiceRef.current ? "trail-practice-best" : "trail-best", String(score)); } catch { /* Optional local progress. */ }
          }
        }
      }
      if (time - lastHud > 125) { if (m === "running") refreshHud(); lastHud = time; }
      const renderInterval = ["running", "countdown"].includes(m) ? 1000 / 60 : 500;
      if (!document.hidden && time - lastDraw >= renderInterval) {
        view.current?.render(s, m === "running", calm, shake, dt || .016); lastDraw = time;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [calm, shake, muted]);
  useEffect(() => { if (!flash) return; const timer = setTimeout(() => setFlash(""), 900); return () => clearTimeout(timer); }, [flash, hud.coins, hud.lives]);
  // Trap modal focus, then return it to the game surface after countdown.
  useEffect(() => {
    if (["running", "countdown", "loading"].includes(mode)) return;
    const p = panel.current; p?.focus();
    const trap = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Tab" || !p) return;
      const nodes = [...p.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary")].filter(n => n.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1]; if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === p)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === p)) { e.preventDefault(); first.focus(); }
    };
    shell.current?.addEventListener("keydown", trap); return () => shell.current?.removeEventListener("keydown", trap);
  }, [mode]);
  function beginCountdown() { audio.current.resume(); countdown.current = 3; setCount(3); setFlash(""); setMode("countdown"); shell.current?.focus(); }
  async function start() {
    audio.current.unlock(); if (lock.current) return;
    if (!practiceRef.current) {
      const r = runRef.current;
      if (!r) { try { const recovered = await request("runner"); baseScore.current = recovered.score; savedCount.current = recovered.checkpoints;
        engine.current = newTrail(recovered.section); refreshHud(); setMode(recovered.phase === "checkpoint" ? "checkpoint" : "ready"); } catch {} return; }
      try { await request("beginRunnerSection", { id: r.id, section: r.section }); } catch { return; }
    }
    if (modeRef.current === "crashed") {
      engine.current = newTrail(runRef.current?.section ?? 1, practiceRef.current);
      if (practiceRef.current) baseScore.current = 0;
      continuation.current = false;
    }
    if (continuation.current) { engine.current = nextTrail(engine.current); continuation.current = false; }
    refreshHud(); audio.current.cue("continue"); beginCountdown();
  }
  async function reachCheckpoint() {
    refreshHud();
    if (practiceRef.current) { baseScore.current += trailScore(engine.current); setMode("checkpoint"); return; }
    const r = runRef.current; if (!r) { setMode("gate-error"); return; }
    setMode("saving");
    try {
      const updated = await request("runnerCheckpoint", { id: r.id, section: r.section, score: trailScore(engine.current) });
      if (!live.current) return;
      baseScore.current = updated.score; setMode("checkpoint");
    } catch { if (live.current) setMode("gate-error"); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); const r = runRef.current; if (!r || lock.current) return;
    setMode("saving");
    try {
      const updated = await request("submitRunnerWord", { id: r.id, section: r.section, expectedWordId: r.word?.id, translations: translation.trim(),
        dialect: dialect.trim(), partOfSpeech: wordClass, notes: notes.trim(),
        publicationPermission: publish, aiTraining: training, credit: credit ? "name" : "anonymous" });
      if (!live.current) return;
      baseScore.current = updated.score; savedCount.current = updated.checkpoints;
      setTranslation(""); setNotes(""); setWordClass(""); continuation.current = true;
      audio.current.cue("checkpoint"); setMode("feedback");
    } catch { if (live.current) setMode("checkpoint"); }
  }
  async function another() {
    const r = runRef.current; if (!r || lock.current) return;
    try { await request("runnerWord", { id: r.id, section: r.section, another: !!r.word }); setTranslation(""); setNotes(""); setWordClass(""); } catch {}
  }
  async function recoverCheckpoint() {
    const old = runRef.current; if (!old || lock.current) return;
    try {
      const updated = await request("runner"); if (!live.current) return;
      baseScore.current = updated.score; savedCount.current = updated.checkpoints;
      if (updated.word?.id !== old.word?.id && (translation || notes)) {
        setPreviousDraft({ word: old.word?.word ?? "previous prompt", translation, dialect, wordClass, notes });
        setTranslation(""); setNotes(""); setWordClass("");
      }
      if (updated.id === old.id && updated.lastReceipt?.section === old.section) {
        continuation.current = true; setMode("feedback");
      } else if (updated.phase === "checkpoint") {
        engine.current.status = "checkpoint"; setMode("checkpoint");
      } else {
        engine.current = newTrail(updated.section); continuation.current = false; refreshHud(); setMode("ready");
      }
    } catch { /* The current draft and paused simulation remain available. */ }
  }
  function continuePractice() {
    if (!practiceRef.current) {
      // Leave the saved contribution gate intact; this is a separate local-only continuation.
      baseScore.current = 0; practiceRef.current = true; setPractice(true); setBest(readBest(true)); engine.current.practice = true;
    }
    engine.current = nextTrail(engine.current); continuation.current = false; setError(""); refreshHud(); beginCountdown();
  }
  function pause() {
    if (modeRef.current === "paused") {
      if (resumeMode.current === "running") beginCountdown(); else setMode(resumeMode.current);
    } else if (["running", "countdown", "checkpoint", "feedback"].includes(modeRef.current)) {
      resumeMode.current = modeRef.current === "countdown" ? "running" : modeRef.current; audio.current.pause(); setMode("paused");
    }
  }
  function action(kind: string) {
    if (modeRef.current !== "running") return;
    if (kind === "left") moveTrail(engine.current, -1); if (kind === "right") moveTrail(engine.current, 1);
    if (kind === "jump") { const before = engine.current.jump; jumpTrail(engine.current); if (!before && engine.current.jump) audio.current.cue("jump"); }
    if (kind === "slide") slideTrail(engine.current);
  }
  function key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable]")) return;
    if (e.key === "Escape") { e.preventDefault(); if (!e.repeat) pause(); return; }
    if (e.target instanceof HTMLElement && e.target.closest("button,a,summary") && [" ", "Enter"].includes(e.key)) return;
    const map: Record<string, string> = { a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right", " ": "jump", ArrowUp: "jump", s: "slide", ArrowDown: "slide" };
    const input = map[e.key] ?? map[e.key.toLowerCase()]; if (input && modeRef.current === "running") { e.preventDefault(); if (!e.repeat) action(input); }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.current?.requestFullscreen) await shell.current.requestFullscreen();
      else setFullscreenNote("Browser fullscreen is unavailable. The game already fills your viewport.");
    } catch { setFullscreenNote("Fullscreen was declined. You can keep playing in this viewport."); }
  }
  function exit() { audio.current.pause(); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); onExit(); }
  const gateVisible = mode === "checkpoint" || mode === "saving" && engine.current.status === "checkpoint" && !!run?.word;
  const totalScore = scoreNow();
  function modal(children: ReactNode, label: string, large = false) {
    return <div className={"trail-shade" + (large ? " trail-shade-gate" : "")}><div className={"trail-modal" + (large ? " trail-modal-gate" : "")} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panel}>{children}<button className="trail-modal-exit" onClick={exit}>Exit to Labs</button></div></div>;
  }
  return <div className={"trail-shell" + (calm ? " trail-calm" : "")} ref={shell} tabIndex={-1} onKeyDown={key} data-mode={mode} data-practice={practice}>
    <canvas ref={canvas} className="trail-world" role="img" aria-label="Three-lane 3D runner on a fictional sunlit trail."
      onPointerDown={e => { if (modeRef.current !== "running") return; swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId); shell.current?.focus(); }}
      onPointerCancel={() => { swipe.current = null; }}
      onPointerUp={e => { const start = swipe.current; swipe.current = null; if (!start || start.id !== e.pointerId) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
        action(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "slide" : "jump"); }} />
    <div className="trail-hud"><div className="trail-hud-brand"><span>IW / WORD TRAIL</span><small>{practice ? "PRACTICE · LOCAL ONLY" : "CONTRIBUTION RUN"}</small></div>
      <div className="trail-hud-numbers"><span><small>RUN SCORE</small><b>{totalScore.toLocaleString()}</b></span><span><small>METRES</small><b>{hud.total.toLocaleString()}</b></span><span className="trail-hearts" aria-label={hud.lives + " hearts remaining"}>{"♥".repeat(hud.lives)}{"♡".repeat(3 - hud.lives)}</span></div>
      <div className="trail-tools"><button aria-label="Pause" disabled={busy || !["running", "countdown", "checkpoint", "feedback", "paused"].includes(mode)} onClick={pause}>Ⅱ</button><button aria-label={muted ? "Turn sound on" : "Mute sound"} aria-pressed={!muted} onClick={() => { audio.current.unlock(); setMuted(!muted); }}>{muted ? "♪̸" : "♪"}</button><button aria-label="Fullscreen" onClick={() => void fullscreen()}>⛶</button><button aria-label="Exit to Labs" onClick={exit}>×</button></div>
    </div>
    <div className="trail-progress"><div><span>{TRAIL.checkpointMetres - hud.distance <= 60 ? "THE GATE IS NEAR" : "NEXT LANGUAGE CHECKPOINT"}</span><b>{Math.max(0, TRAIL.checkpointMetres - hud.distance)} m</b></div><progress aria-label="Distance to checkpoint" max={TRAIL.checkpointMetres} value={hud.distance} /></div>
    {fullscreenNote && <button className="trail-fullscreen-note" onClick={() => setFullscreenNote("")}>{fullscreenNote} ×</button>}
    <span className={"trail-flash" + (flash.startsWith("Ouch") ? " trail-flash-hit" : "")} aria-hidden="true">{flash}</span>
    {mode === "running" && touch && <div className="trail-touch">{[["left", "←", "Move left"], ["jump", "↑", "Jump"], ["slide", "↓", "Slide"], ["right", "→", "Move right"]].map(([id, icon, label]) => <button key={id} aria-label={label} onClick={() => action(id)}>{icon}<small>{label.replace("Move ", "")}</small></button>)}</div>}
    {mode === "running" && engine.current.totalDistance < 40 && <p className="trail-tutorial">← → switch lanes · ↑ jump · ↓ slide<br />Swipe or use the buttons. Follow the sparks.</p>}
    <div className="trail-announcement" role="status" aria-live="polite">{mode === "checkpoint" ? "Checkpoint reached. Gameplay is paused." : mode === "crashed" ? "Run finished." : mode === "feedback" ? "Saved for community review." : ""}</div>
    {mode === "countdown" && <div className="trail-countdown" aria-label="Get ready"><span key={count}>{count}</span><p>THE TRAIL IS YOURS</p></div>}
    {mode === "loading" && modal(<><span className="trail-kicker">PREPARING YOUR TRAIL</span><h1>Finding the horizon…</h1><p>Loading your saved run and preparing the 3D scene.</p></>, "Loading trail")}
    {mode === "ready" && modal(<><span className="trail-kicker">{practice ? "YOUR OWN PACE / PRACTICE" : "THE BLUE HORIZON / SECTION " + (run?.section ?? 1)}</span><h1>Let the trail<br /><em>take you further.</em></h1><p>{practice ? "A slower run to find your feet. Checkpoints are restful pauses; no translations are saved." : "Collect sparks. Dodge rocks. Jump logs. Slide under blue awnings. At 300 metres, a word opens the way."}</p><p className="trail-mini">Three hearts · Keyboard, swipes or touch buttons · Run score has no cash value</p>{error && <p className="trail-error" role="alert">{error}</p>}<button className="trail-primary" disabled={busy} onClick={() => void start()}>{busy ? "Opening trail…" : !practice && !run ? "Retry saved run" : "Start running →"}</button></>, "Ready to run")}
    {mode === "paused" && modal(<><span className="trail-kicker">TAKE A BREATH</span><h1>The horizon<br />can wait.</h1><p>Your runner and the world are paused.</p><div className="trail-settings">
      <label><input type="checkbox" checked={calm} onChange={e => setCalm(e.target.checked)} />Reduced camera motion</label>
      <label><input type="checkbox" checked={shake} onChange={e => setShake(e.target.checked)} />Gentle hit camera shake</label>
      <label><input type="checkbox" checked={touch} onChange={e => setTouch(e.target.checked)} />Show touch controls</label>
      <label><input type="checkbox" checked={!muted} onChange={e => setMuted(!e.target.checked)} />Sound effects</label></div>
      <p className="trail-mini">A/D or ←/→ lanes · Space/↑ jump · S/↓ slide · Esc pause. On phones, swipe. This is a visual action game.</p><button className="trail-primary" onClick={pause}>Resume run →</button></>, "Run paused")}
    {mode === "gate-error" && modal(<><span className="trail-kicker">CHECKPOINT REACHED</span><h1>Your run is safe.</h1><p>The trail is paused while your connection recovers.</p><p className="trail-error" role="alert">{error}</p><button className="trail-primary" disabled={busy} onClick={() => void reachCheckpoint()}>Retry checkpoint</button><button className="trail-secondary" onClick={continuePractice}>Continue as local practice</button></>, "Checkpoint recovery")}
    {mode === "saving" && !gateVisible && modal(<><span className="trail-kicker">CHECKPOINT REACHED</span><h1>Securing your<br />checkpoint…</h1><p>Gameplay is paused while the saved word queue loads.</p></>, "Saving checkpoint")}
    {gateVisible && (practice ? modal(<><span className="trail-kicker">PRACTICE CHECKPOINT</span><h1>A moment<br />at the horizon.</h1><p>You reached {hud.total} metres. Your {hud.lives} hearts carry into the next section. Practice doesn't save contributions or award contribution bonuses.</p><button className="trail-primary" onClick={continuePractice}>Keep running →</button><button className="trail-secondary" onClick={pause}>Pause & settings</button></>, "Practice checkpoint") :
      modal(<><span className="trail-kicker">LANGUAGE CHECKPOINT / SECTION {run?.section}</span><h1>A word opens the way.</h1><p className="trail-gate-intro">The world is paused. Share the translation you use in this context. Saved answers earn 100 run points and enter community review.</p>
      {error && <div className="trail-error" role="alert">{error}<button className="trail-secondary" type="button" disabled={busy} onClick={() => void recoverCheckpoint()}>Reload saved checkpoint</button></div>}
      {run?.word ? <form onSubmit={submit} aria-busy={busy}>
        {previousDraft && <details className="trail-context"><summary>Previous unsent draft for {previousDraft.word}</summary><p>The prompt changed. Your previous writing is kept here for reference.</p><label className="trail-field">Previous translation<textarea aria-label="Previous translation" readOnly rows={2} value={previousDraft.translation} /></label><p>{previousDraft.notes}</p><button className="trail-secondary" type="button" onClick={() => { setTranslation(previousDraft.translation); setDialect(previousDraft.dialect); setWordClass(previousDraft.wordClass); setNotes(previousDraft.notes); setPreviousDraft(null); }}>Use this draft for the current word</button></details>}
        <div className="trail-word-card"><span>ENGLISH → KASEM</span><h2>{run.word.word}</h2><p>{run.word.sentence}</p>
          {run.word.attribution && <small>Example: <a href={"https://tatoeba.org/en/sentences/show/" + encodeURIComponent(run.word.attribution.tatoebaId)} target="_blank" rel="noreferrer">Tatoeba #{run.word.attribution.tatoebaId}</a>{run.word.attribution.contributor && " by " + run.word.attribution.contributor} · {run.word.attribution.licence}</small>}</div>
        <label className="trail-field">Kasem translation<input ref={translationInput} required maxLength={2000} value={translation} disabled={busy} onChange={e => setTranslation(e.target.value)} autoComplete="off" placeholder="The word or expression you use" /></label>
        <div className="trail-letters" aria-label="Kasem letters">{["ɛ", "ɔ", "ŋ"].map(letter => <button key={letter} type="button" disabled={busy} aria-label={"Add " + letter} onPointerDown={e => e.preventDefault()} onClick={() => {
          const start = translationInput.current?.selectionStart ?? translation.length, end = translationInput.current?.selectionEnd ?? start;
          setTranslation(t => { const next = t.slice(0, start) + letter + t.slice(end); return next.length <= 2000 ? next : t; });
          requestAnimationFrame(() => { translationInput.current?.focus({ preventScroll: true }); translationInput.current?.setSelectionRange(start + letter.length, start + letter.length); });
        }}>{letter}</button>)}</div>
        <div className="trail-form-row"><label className="trail-field">Word class<select aria-label="Word class" required disabled={busy} value={wordClass} onChange={e => setWordClass(e.target.value)}><option value="">Choose a class</option>{lexicalSchema.properties.partOfSpeech.enum.map(value => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}</select></label>
        <label className="trail-field">Dialect or community<input required disabled={busy} maxLength={80} value={dialect} onChange={e => setDialect(e.target.value)} placeholder="Where you use this translation" /></label></div>
        <details className="trail-context"><summary>Meaning, usage & permissions</summary>
          <label className="trail-field">Meaning or usage note (optional)<textarea aria-label="Meaning or usage note" disabled={busy} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></label>
          <label><input type="checkbox" disabled={busy} checked={publish} onChange={e => setPublish(e.target.checked)} />Allow publication after review</label>
          <label><input type="checkbox" disabled={busy} checked={credit} onChange={e => setCredit(e.target.checked)} />Credit my account name</label>
          <label><input type="checkbox" disabled={busy} checked={training} onChange={e => setTraining(e.target.checked)} />Allow testing and training of Indigen language tools</label>
        </details><p className="trail-mini">This is a proposed translation, not a verified dictionary entry. Context and source attribution stay with the queue record.</p>
        <div className="trail-submit-bar"><button className="trail-primary" disabled={busy || !translation.trim() || !dialect.trim() || !wordClass}>{busy ? "Saving…" : "Submit translation →"}</button>
        <button className="trail-secondary" type="button" disabled={busy} onClick={() => void another()}>I don't know · another word</button>
        </div>
      </form> : <><h2>No queue word is available right now.</h2><p>Your saved gate stays here. You can check again or continue in separate practice mode.</p><button className="trail-primary" disabled={busy} onClick={() => void another()}>Check the word queue again</button></>}
      <div className="trail-gate-links"><button disabled={busy} onClick={continuePractice}>Continue without contributing · practice</button><button disabled={busy} onClick={pause}>Pause & settings</button></div></>, "Language contribution checkpoint", true))}
    {mode === "feedback" && modal(<><div className="trail-success-mark">✦</div><span className="trail-kicker">YOUR WORD MADE A WAY</span><h1>Saved for<br /><em>community review.</em></h1><p>+100 run points. Your proposed translation is safely in the existing review workflow.</p><p className="trail-mini">Reviewer approval and contributor rewards follow their own rules.</p><button className="trail-primary" disabled={busy} onClick={() => void start()}>Continue running →</button></>, "Contribution saved")}
    {mode === "crashed" && modal(<><span className="trail-kicker">EVERY RUN IS A NEW CHANCE</span><h1>One more run?</h1><div className="trail-results"><span><b>{hud.total} m</b>distance</span><span><b>{hud.score}</b>run score</span><span><b>{best}</b>device best</span><span><b>{savedCount.current}</b>saved contributions{savedCount.current > 0 && <small>on this account trail</small>}</span></div><p>Your saved contributions stay in review. Retry this section with three hearts.</p>{error && <p className="trail-error" role="alert">{error}</p>}<button className="trail-primary" disabled={busy} onClick={() => void start()}>Retry section →</button></>, "Run finished")}
    {mode === "unsupported" && modal(<><span className="trail-kicker">3D GRAPHICS UNAVAILABLE</span><h1>A clearer path<br />back to Labs.</h1><p>Word Trail needs WebGL 2. Try a current browser with hardware acceleration enabled. Your saved account trail is unchanged.</p><button className="trail-primary" onClick={exit}>Return to Labs →</button></>, "Graphics unavailable")}
  </div>;
}
