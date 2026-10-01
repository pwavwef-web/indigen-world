import { useEffect, useRef, useState } from "react";
import type { LabsSource } from "@indigen-world/contracts/labs";
import { Link } from "../../app/router";
import { labsCall, errorMessage } from "./api";

interface Quest { day: string; cards: LabsSource[]; completed: string[]; xp: number; missions: number }
const stops = ["The word grove", "The story bridge", "The lookout"];
const badges = [[1, "First footsteps"], [3, "Trail finder"], [10, "Culture keeper"]] as const;
export function QuestWorkspace() {
  const [quest, setQuest] = useState<Quest | null>(null);
  const [index, setIndex] = useState(0), [kind, setKind] = useState("usage");
  const [note, setNote] = useState(""), [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [celebration, setCelebration] = useState("");
  const [cluePrompt, setCluePrompt] = useState("When would you use it?");
  const drafts = useRef<Record<string, { note: string; evidence: string; kind: string; prompt: string }>>({});
  const challengeRef = useRef<HTMLElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let live = true;
    setError("");
    labsCall<{ quest: Quest }>("quest").then(({ quest }) => { if (live) setQuest(quest); })
      .catch((e) => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [retry]);
  const source = quest?.cards[index];
  const completed = source && quest?.completed.includes(source.ref);
  const level = quest ? Math.floor(quest.xp / 100) + 1 : 1;
  const discovered = !!source && (completed || revealed.includes(source.ref));
  // All choices are exact reviewed source meanings. Ambiguous cards become reveals.
  const reverse = index === 1;
  const answer = source ? reverse ? source.original : source.meaning : "";
  const choices = source && quest ? [...new Set(quest.cards.map((s) => reverse ? s.original : s.meaning))].sort((a, b) => a.localeCompare(b)) : [];
  const canMatch = !!source && ["word", "expression", "sentence"].includes(source.kind) && choices.length > 1 && quest?.cards.filter((s) => (reverse ? s.meaning : s.original).trim().toLowerCase() === (reverse ? source.meaning : source.original).trim().toLowerCase()).length === 1;
  const nextBadge = badges.find(([threshold]) => (quest?.missions ?? 0) < threshold);
  const move = (i: number) => {
    if (source && !completed) drafts.current[source.ref] = { note, evidence, kind, prompt: cluePrompt };
    const draft = quest && drafts.current[quest.cards[i]?.ref ?? ""];
    setIndex(i); setNote(draft?.note ?? ""); setEvidence(draft?.evidence ?? ""); setKind(draft?.kind ?? "usage"); setCluePrompt(draft?.prompt ?? "When would you use it?");
    setMessage(""); setError(""); setCelebration("");
    requestAnimationFrame(() => { challengeRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); challengeRef.current?.focus({ preventScroll:true }); });
  };
  return <div className="quest-game">
    <div className="quest-welcome"><span className="quest-compass" aria-hidden="true">✦</span><div><p className="labs-eyebrow">CULTURE QUEST / DAILY EXPEDITION</p><h3>A little adventure.<br />A lasting contribution.</h3><p>Uncover a source, try a discovery challenge, then leave a clue for the next explorer.</p></div></div>
    {error && <p className="labs-notice labs-error" role="alert">{error} {!quest && <button className="labs-text-button" onClick={() => setRetry(retry + 1)}>Retry</button>}</p>}
    {!quest && !error && <p role="status">Preparing your expedition…</p>}
    {quest && <>
      <details className="quest-passport"><summary>Explorer passport · Level {level} · {quest.xp} XP</summary>
      <div className="quest-stats"><span><strong>{quest.xp}</strong> XP</span><span><strong>{level}</strong> Explorer level</span><span><strong>{quest.missions}</strong> Clues contributed</span></div>
      <progress aria-label="Progress to next level" value={quest.xp % 100} max={100} />
      <p className="labs-meta">{100 - quest.xp % 100} XP to level {level + 1} · Expedition resets at 00:00 UTC.</p>
      <div className="quest-badges" aria-label="Earned badges">{badges.map(([count, label]) => <span className={`quest-badge ${quest.missions >= count ? "earned" : ""}`} key={label} aria-label={`${label}: ${quest.missions >= count ? "earned" : "locked"}`}><span aria-hidden="true">{quest.missions >= count ? "★" : "◇"}</span> {label}</span>)}</div>
      {nextBadge && <p className="labs-meta">Your next keepsake: {nextBadge[1]} · {nextBadge[0] - quest.missions} more contribution{nextBadge[0] - quest.missions === 1 ? "" : "s"}.</p>}
      </details>
      {!quest.cards.length ? <p className="labs-notice">No eligible reviewed sources are available in the current sample. Try again later.</p> : <>
        <div className="quest-daily-goal"><div><strong>Today’s quest: leave {quest.cards.length} useful clue{quest.cards.length === 1 ? "" : "s"}</strong><span>{quest.completed.length}/{quest.cards.length} shared · up to {quest.cards.length * 20} XP</span></div><progress aria-label="Today's contribution goal" value={quest.completed.length} max={quest.cards.length} /></div>
        <div className="quest-map"><span className="quest-map-label">YOUR TRAIL TODAY</span><span className="quest-map-sun" aria-hidden="true">☀</span><nav className="quest-trail" aria-label="Expedition missions">{quest.cards.map((s, i) => <button key={s.ref} className={`quest-node ${i === index ? "active" : ""} ${quest.completed.includes(s.ref) ? "done" : ""}`} aria-current={i === index ? "step" : undefined} disabled={busy} onClick={() => move(i)}><span className="quest-island" aria-hidden="true">{quest.completed.includes(s.ref) ? "⚑" : ["♧", "⌁", "✦"][i]}</span><span>{stops[i]}</span><small>{quest.completed.includes(s.ref) ? "Clue shared ✓" : `Mission ${i + 1} · explore`}</small></button>)}</nav><p>No timer. No lost lives. Follow your curiosity.</p></div>
        <section className="quest-stage" ref={challengeRef} tabIndex={-1} aria-label={`Current mission: ${stops[index]}`}>
        <ol className="quest-steps" aria-label="Mission steps"><li aria-current={!discovered ? "step" : undefined}>{discovered ? "✓" : "1"} Discover</li><li aria-current={discovered && !completed ? "step" : undefined}>{completed ? "✓" : "2"} Leave a clue</li><li aria-current={completed ? "step" : undefined}>3 Collect XP</li></ol>
        {source && !discovered && <section className="quest-discovery" key={source.ref}>
          <p className="labs-eyebrow">DISCOVERY {index + 1} / {stops[index]}</p>
          <h3>{reverse && canMatch ? source.meaning : source.original}</h3>
          {source.developmentFixture && <p className="labs-meta">Development fixture — not an authentic translation.</p>}
          <p>{canMatch ? reverse ? "Flip the challenge: which source matches this meaning?" : "Which meaning belongs to this source? Take a guess, or peek at the answer." : "There’s a source waiting here. Open it to discover what it means."}</p>
          {source.audioUrl && !reverse && <div className="quest-listen"><p>Listen for a clue</p><audio controls preload="none" src={source.audioUrl} aria-label="Reviewed source pronunciation" /><p className="labs-meta">{source.audioCredit}</p></div>}
          {canMatch && <div className="quest-choices">{choices.map((option, i) => <button type="button" key={option} onClick={() => { setGuesses((g) => ({ ...g, [source.ref]: option })); setRevealed((r) => [...r, source.ref]); }}><span className="quest-choice-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{option}</span><span aria-hidden="true">↗</span></button>)}</div>}
          <button type="button" className="labs-text-button" onClick={() => setRevealed((r) => [...r, source.ref])}>{canMatch ? "Let me peek →" : "Uncover this source →"}</button>
          <p className="labs-meta">This warm-up is just for discovery. Contribution XP comes from sharing a useful note.</p>
        </section>}
        {source && discovered && <article className="quest-source">
          {!completed && <p className="quest-match-result" role="status">{guesses[source.ref] ? guesses[source.ref] === answer ? "✦ You found the match! Now add a little of your own knowledge." : "A new discovery! Here’s the reviewed meaning — every explorer learns along the way." : "✦ Source uncovered. What can you add to the story?"}</p>}
          <p className="labs-meta">{source.topic} · {source.developmentFixture ? "Development fixture — simulated review" : "Reviewed source"}</p>
          <h3>{source.original}</h3><p>{source.meaning}</p>{source.context && <p>{source.context}</p>}
          <details className="quest-source-details"><summary>Source credits and reference</summary><p className="labs-meta">{source.attribution} · {source.ref} · revision {source.revision}</p></details>
          {source.url && <a href={source.url}>Open source ↗</a>}
        </article>}
        {completed ? <div className="quest-complete" role="status"><span className="quest-reward" aria-hidden="true">✦</span><h3>{quest.completed.length === quest.cards.length ? "Today’s trail is complete!" : "A clue for the next explorer!"}</h3><p>Mission complete! Your contribution is awaiting review.</p>{quest.completed.length === quest.cards.length ? <p>You’ve explored every stop. Come back tomorrow for a fresh trail.</p> : <button className="labs-button" onClick={() => move(quest.cards.findIndex((s) => !quest.completed.includes(s.ref)))}>On to the next discovery →</button>}</div> : discovered && <form className="labs-form quest-contribution" onSubmit={async (e) => {
          e.preventDefault(); if (!source || submitting.current) return;
          submitting.current = true; setBusy(true); setError(""); setMessage("");
          try {
            const result = await labsCall<{ quest: Quest }>("submitQuest", { day: quest.day, sourceRef: source.ref, kind, description: note, evidence });
            const earned = badges.find(([threshold]) => quest.missions < threshold && result.quest.missions >= threshold);
            const leveledUp = Math.floor(result.quest.xp / 100) > Math.floor(quest.xp / 100);
            setCelebration(earned ? `Keepsake unlocked: ${earned[1]}!` : leveledUp ? `You reached explorer level ${Math.floor(result.quest.xp / 100) + 1}!` : "Thanks for leaving the trail a little richer.");
            delete drafts.current[source.ref]; setQuest(result.quest); setNote(""); setEvidence(""); setMessage("+20 XP. Your note was sent to the review queue!");
          } catch (e) { setError(errorMessage(e)); } finally { submitting.current = false; setBusy(false); }
        }}>
          <h3>Leave a clue, earn 20 XP</h3><p>A detail you know could make this source more useful to someone else.</p>
          <div className="quest-mission-types" role="group" aria-label="Choose your mission"><button type="button" disabled={busy} aria-pressed={kind === "usage"} onClick={() => setKind("usage")}><span aria-hidden="true">✎</span> Share a detail<small>Add usage or cultural context</small></button><button type="button" disabled={busy} aria-pressed={kind === "correction"} onClick={() => setKind("correction")}><span aria-hidden="true">⌕</span> Spot a fix<small>Propose a correction with evidence</small></button></div>
          {kind === "usage" && <div className="quest-prompts" role="group" aria-label="Ideas for your clue">{["When would you use it?", "Who taught you?", "What should visitors know?"].map((prompt) => <button type="button" key={prompt} disabled={busy} aria-pressed={cluePrompt === prompt} onClick={() => setCluePrompt(prompt)}>{prompt}</button>)}</div>}
          <label className="labs-field"><span>{kind === "usage" ? "What should someone know about using this?" : "What needs changing, and why?"}</span><textarea placeholder={kind === "usage" ? cluePrompt === "When would you use it?" ? "Describe a real situation, who is speaking, and any dialect context…" : cluePrompt === "Who taught you?" ? "Share how you learned this, without revealing anyone’s private details…" : "Share a helpful detail a newcomer might miss…" : "Describe the proposed change and why it is needed…"} required minLength={20} maxLength={3000} rows={3} disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="labs-field"><span>Context or evidence (where you learned this, dialect, or a public reference)</span><textarea required minLength={10} maxLength={1500} rows={2} disabled={busy} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
          <p className="labs-meta">Share only material you have permission to share. Avoid private or restricted knowledge. Reviewers decide whether a proposal can be used.</p>
          <p className="quest-clue-ready" role="status">{note.trim().length >= 20 && evidence.trim().length >= 10 ? "✓ Your clue has a note and evidence. Ready to send for review." : "Add a note (at least 20 characters) and evidence (at least 10). Your own experience counts as context."}</p>
          <div className="labs-row"><button className="labs-button" disabled={busy}>{busy ? "Sharing your clue…" : "Complete mission · +20 XP"}</button></div>
        </form>}
        {message && <div className="quest-celebration" role="status"><div className="quest-sparkles" aria-hidden="true">✦ · ✧ · ✦</div><strong>{celebration}</strong><p>{message}</p></div>}
        {!completed && <button type="button" className="labs-text-button quest-skip" disabled={busy} onClick={() => move((index + 1) % quest.cards.length)}>Skip for now →</button>}
        </section>
        {(revealed.length > 0 || quest.completed.length > 0) && <details className="quest-journal"><summary>Your field guide · {quest.cards.filter((s) => revealed.includes(s.ref) || quest.completed.includes(s.ref)).length} discoveries</summary><p className="labs-meta">Your discoveries from this visit and sources with saved contributions. Discoveries do not earn contribution XP.</p>{quest.cards.filter((s) => revealed.includes(s.ref) || quest.completed.includes(s.ref)).map((s) => <article key={s.ref}><strong>{s.original}</strong><p>{s.meaning}</p><span className="labs-meta">{s.topic} · {quest.completed.includes(s.ref) ? "Clue shared" : "Discovered"}</span></article>)}</details>}
      </>}
      <p className="labs-meta">XP rewards participation; it does not verify accuracy or award contributor payments.</p>
      <Link to="/labs/activity">Follow your submissions and reviewer responses →</Link>
    </>}
  </div>;
}
