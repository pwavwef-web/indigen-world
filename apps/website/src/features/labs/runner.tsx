import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { RunnerRun } from "@indigen-world/contracts/labs";
import lexicalSchema from "../../../../../packages/contracts/schemas/lexical-entry.schema.json";
import { errorMessage, labsCall } from "./api";
import { drawTrail } from "./runner-art";
import { jumpTrail, moveTrail, newTrail, tickTrail, trailScore } from "./runner-engine";
import "./runner.css";

type Mode = "intro" | "running" | "paused" | "crashed" | "saving" | "gate-error";
export function RunnerWorkspace() {
  const [run, setRun] = useState<RunnerRun | null>(null), [mode, setMode] = useState<Mode>("intro");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [hud, setHud] = useState({ distance: 0, score: 0, lives: 3 });
  const [translation, setTranslation] = useState(""), [dialect, setDialect] = useState("");
  const [wordClass, setWordClass] = useState(""), [notes, setNotes] = useState("");
  const [publish, setPublish] = useState(true), [training, setTraining] = useState(false), [credit, setCredit] = useState(false);
  const [calm, setCalm] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), gate = useRef<HTMLHeadingElement>(null);
  const engine = useRef(newTrail()), swipe = useRef<{ x: number; y: number } | null>(null);
  const alive = useRef(true);
  async function request(action: string, data: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const result = await labsCall<{ run: RunnerRun }>(action, data);
      if (alive.current) setRun(result.run);
      return result.run;
    } catch (e) { if (alive.current) setError(errorMessage(e)); throw e; }
    finally { if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true;
    void request("runner").catch(() => {});
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { if (run?.phase === "checkpoint") gate.current?.focus(); }, [run?.phase]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setMode(m => m === "running" ? "paused" : m); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  async function saveCheckpoint() {
    if (!run) return;
    setMode("saving");
    try {
      await request("runnerCheckpoint", { id: run.id, section: run.section, score: trailScore(engine.current) });
      setMode("intro");
    } catch { setMode("gate-error"); }
  }
  useEffect(() => {
    let animation = 0, previous = 0, lastHud = 0;
    const frame = (time: number) => {
      if (mode === "running") {
        tickTrail(engine.current, previous ? (time - previous) / 1000 : 0);
        if (time - lastHud > 100 || engine.current.status !== "running") {
          setHud({ distance: Math.floor(engine.current.elapsed * 10), score: trailScore(engine.current), lives: engine.current.lives });
          lastHud = time;
        }
        if (engine.current.status === "crashed") { setMode("crashed"); return; }
        if (engine.current.status === "checkpoint") { void saveCheckpoint(); return; }
      }
      if (canvas.current) drawTrail(canvas.current, engine.current, calm);
      previous = time;
      if (mode === "running") animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [mode, calm, run?.id, run?.section]);

  async function start() {
    if (!run) return;
    try {
      await request("beginRunnerSection", { id: run.id, section: run.section });
      engine.current = newTrail(run.section);
      setHud({ distance: 0, score: 0, lives: 3 }); setMode("running");
      stage.current?.focus();
    } catch { /* The saved trail stays visible for retry. */ }
  }
  function key(event: KeyboardEvent) {
    if (!["running", "paused"].includes(mode)) return;
    if (event.key === " " && event.target instanceof HTMLElement && event.target.closest("button")) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "p", "P", "Escape"].includes(event.key)) event.preventDefault();
    if (event.key.toLowerCase() === "p" || event.key === "Escape") { setMode(mode === "running" ? "paused" : "running"); return; }
    if (mode !== "running") return;
    if (event.key === "ArrowLeft") moveTrail(engine.current, -1);
    if (event.key === "ArrowRight") moveTrail(engine.current, 1);
    if ((event.key === "ArrowUp" || event.key === " ") && !event.repeat) jumpTrail(engine.current);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!run) return;
    try {
      await request("submitRunnerWord", { id: run.id, section: run.section,
        translations: translation.trim(), dialect: dialect.trim(), partOfSpeech: wordClass,
        notes: notes.trim(), publicationPermission: publish, aiTraining: training, credit: credit ? "name" : "anonymous" });
      setTranslation(""); setNotes(""); setWordClass(""); setMode("intro");
    } catch { /* Unsent writing stays in the form. */ }
  }
  async function another() {
    if (!run) return;
    try {
      await request("runnerWord", { id: run.id, section: run.section, another: !!run.word });
      setTranslation(""); setNotes(""); setWordClass("");
    } catch { /* Changing words failed; keep this answer. */ }
  }
  const active = mode === "running" || mode === "paused", checkpoint = run?.phase === "checkpoint";
  return <div className="word-trail">
    <div className="trail-topline"><span className="trail-kicker">THE LIVING LANGUAGE TRAIL</span><span>Section {run?.section ?? 1}</span></div>
    <div className="trail-stats" aria-label="Trail progress">
      <div><span>Game points</span><strong>{(run?.score ?? 0) + (active ? hud.score : 0)}<small>✦</small></strong></div>
      <div><span>Translations saved</span><strong>{run?.checkpoints ?? 0}<small>↗</small></strong></div>
      <div><span>Next checkpoint</span><strong>{checkpoint || mode === "gate-error" || mode === "saving" ? 0 : active ? 300 - hud.distance : 300}<small>m</small></strong></div>
    </div>
    {error && <div className="labs-notice labs-error" role="alert">{error}{!run && <button className="labs-button" onClick={() => void request("runner").catch(() => {})}>Retry loading trail</button>}</div>}
    {checkpoint ? <section className="trail-gate">
      <div className="trail-gate-symbol" aria-hidden="true">✦</div>
      <p className="trail-kicker">CHECKPOINT / SECTION {run.section}</p>
      <h3 ref={gate} tabIndex={-1}>A word opens the way.</h3>
      <p>Your run is safe here. Share a translation you know, then carry on. Saving adds <strong>100 game points</strong>.</p>
      {run.word ? <form onSubmit={submit}>
        <div className="trail-word-card"><span>ENGLISH → KASEM</span><h4>{run.word.word}</h4>
          {run.word.sentence && <p>“{run.word.sentence}”</p>}
          {run.word.attribution && <small>Example: <a href={`https://tatoeba.org/en/sentences/show/${encodeURIComponent(run.word.attribution.tatoebaId)}`} target="_blank" rel="noreferrer">Tatoeba #{run.word.attribution.tatoebaId}</a>{run.word.attribution.contributor && ` by ${run.word.attribution.contributor}`} · {run.word.attribution.licence}</small>}
        </div>
        <label className="trail-field">Kasem translation<input required maxLength={2000} value={translation} onChange={e => setTranslation(e.target.value)} placeholder="The word or expression you use" autoComplete="off" /></label>
        <div className="trail-letters" aria-label="Kasem letters">{["ɛ", "ɔ", "ŋ"].map(letter => <button type="button" key={letter} aria-label={`Add ${letter}`} onClick={() => setTranslation(t => t + letter)}>{letter}</button>)}</div>
        <div className="trail-form-row">
          <label className="trail-field">Word class<select aria-label="Word class" required value={wordClass} onChange={e => setWordClass(e.target.value)}><option value="">Choose a class</option>{lexicalSchema.properties.partOfSpeech.enum.map(value => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}</select></label>
          <label className="trail-field">Dialect or community<input required maxLength={80} value={dialect} onChange={e => setDialect(e.target.value)} placeholder="Where you use this translation" /></label>
        </div>
        <label className="trail-field">Meaning or usage note <span>(optional)</span><textarea maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Explain the meaning you translated, especially if the English word has several senses." rows={2} /></label>
        <details className="trail-permissions"><summary>Publication, credit and language tools</summary>
          <label><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} />Allow publication after review</label>
          <label><input type="checkbox" checked={credit} onChange={e => setCredit(e.target.checked)} />Credit my account name (otherwise anonymous)</label>
          <label><input type="checkbox" checked={training} onChange={e => setTraining(e.target.checked)} />Allow this answer to test and train Indigen language tools</label>
        </details>
        <p className="trail-review-note">Your answer enters the word queue review workflow. It is a proposed translation until reviewers check it.</p>
        <div className="trail-actions"><button className="labs-button trail-primary" disabled={busy || !translation.trim() || !dialect.trim() || !wordClass}>{busy ? "Saving…" : "Save translation & open trail →"}</button><button type="button" className="trail-secondary" disabled={busy} onClick={() => void another()}>I’m unsure — try another word</button></div>
      </form> : <div className="trail-empty"><h4>No queue word is available right now.</h4><p>The gate will open after a real translation is saved. Check again later; your checkpoint and points are kept.</p><button className="labs-button" disabled={busy} onClick={() => void another()}>Check the word queue again</button></div>}
    </section> : <div className="trail-game" onKeyDown={key}>
      <div className="trail-stage" ref={stage} tabIndex={0} aria-label="Word Trail game. Left and right arrows change lanes; up or space jumps; P pauses."
        onPointerDown={e => { if (e.target !== canvas.current && e.target !== e.currentTarget) return; swipe.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerUp={e => { const start = swipe.current; swipe.current = null; if (!start || mode !== "running") return; const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy)) moveTrail(engine.current, dx > 0 ? 1 : -1); else if (dy < -25) jumpTrail(engine.current); }}>
        <canvas ref={canvas} role="img" aria-label="A runner on a three-lane woodland trail with rocks, logs and golden sparks." />
        {active && <div className="trail-inrun"><span aria-label={`${hud.lives} lives remaining`}>{"♥".repeat(hud.lives)}{"♡".repeat(3 - hud.lives)}</span><span>{hud.distance} / 300 m</span><button onClick={() => setMode(mode === "paused" ? "running" : "paused")}>{mode === "paused" ? "Resume" : "Pause"}</button></div>}
        {mode !== "running" && <div className="trail-overlay"><div>
          <p className="trail-kicker">{mode === "crashed" ? "EVERY RUN IS A NEW CHANCE" : mode === "paused" ? "TAKE A BREATH" : mode === "saving" || mode === "gate-error" ? "CHECKPOINT REACHED" : "RUN. DODGE. CONTRIBUTE."}</p>
          <h3>{mode === "crashed" ? "Back on your feet." : mode === "paused" ? "The trail can wait." : mode === "saving" ? "Securing your checkpoint…" : mode === "gate-error" ? "Your checkpoint is waiting." : run?.lastReceipt ? "Your word made a way." : "A little adventure. A living language."}</h3>
          <p>{mode === "crashed" ? "Your saved points and translations are safe. Try this section again." : mode === "paused" ? "Resume when you’re ready. Movement stops while this tab is hidden." : mode === "saving" ? "The game pauses while the word queue loads." : mode === "gate-error" ? "Retry saving this section when your connection is ready." : run?.lastReceipt ? "Translation saved for review. +100 game points. The next section is open." : "Collect sparks. Dodge rocks. Jump logs. At every gate, a Kasem translation keeps the trail moving."}</p>
          {mode === "paused" ? <button className="trail-start" onClick={() => { setMode("running"); stage.current?.focus(); }}>Resume run →</button> : mode === "gate-error" ? <button className="trail-start" disabled={busy} onClick={() => void saveCheckpoint()}>Retry checkpoint →</button> : mode !== "saving" && <button className="trail-start" disabled={busy || !run} onClick={() => void start()}>{!run ? "Loading trail…" : mode === "crashed" ? "Try section again →" : `Run section ${run.section} →`}</button>}
        </div></div>}
      </div>
      <div className="trail-controls"><button disabled={mode !== "running"} aria-label="Move left" onClick={() => moveTrail(engine.current, -1)}>← <span>Left</span></button><button disabled={mode !== "running"} onClick={() => jumpTrail(engine.current)}>↑ <span>Jump</span></button><button disabled={mode !== "running"} aria-label="Move right" onClick={() => moveTrail(engine.current, 1)}><span>Right</span> →</button></div>
      <p className="trail-control-hint">← → change lanes · ↑ / space jump · P pause<br />On touch screens, use the buttons or swipe.</p>
    </div>}
    <div className="trail-footer"><label><input type="checkbox" checked={calm} onChange={e => setCalm(e.target.checked)} />Calm scenery</label><span>Game points have no cash value.</span></div>
    {run && !active && mode !== "saving" && <details className="trail-reset"><summary>End this trail</summary><p>Start at section 1 with zero game points. Your submitted translations stay in the review workflow.</p><button className="trail-secondary" disabled={busy} onClick={() => void request("runner", { restart: true }).then(() => { engine.current = newTrail(); setMode("intro"); setTranslation(""); setNotes(""); }).catch(() => {})}>Start a fresh trail</button></details>}
  </div>;
}
