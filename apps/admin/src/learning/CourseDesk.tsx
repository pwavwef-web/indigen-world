import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Button } from '@indigen-world/web-ui';
import { Alert, EmptyState, Loading, StatusPill, TableShell, toneForStatus } from '@indigen-world/console-ui';
import { auth } from '../firebase';
import {
  ILLUSTRATION_RATIOS,
  ILLUSTRATION_SIZES,
  decideRecording,
  deleteUnit,
  emptyUnit,
  generateIllustration,
  listIllustrations,
  listSubmittedRecordings,
  listUnits,
  previewUrl,
  recordingUrl,
  reviewIllustration,
  saveUnit,
  unitProblems,
  uploadReference,
  type CourseUnit,
  type Illustration,
  type IllustrationQuality,
  type IllustrationTarget,
  type PronunciationRecording,
} from './courseData';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/* ------------------------------------------------------------------ Units */

/**
 * The course outline: the units the Learn tab's "Explore next" strip and the
 * course screen are drawn from. Lessons join a unit by its number, so a unit
 * can be published before its lessons, and the app shows it as in preparation.
 */
export function UnitsPanel() {
  const [units, setUnits] = useState<CourseUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CourseUnit | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUnits(await listUnits());
    } catch (err) {
      setError(messageOf(err, 'Could not load the units.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    const problems = unitProblems(editing);
    const update = (patch: Partial<CourseUnit>) => setEditing({ ...editing, ...patch });
    return (
      <section className="panel">
        <h2>{editing.id ? 'Edit unit' : 'New unit'}</h2>
        <p className="panel__hint">
          {editing.id
            ? `Saved as ${editing.id}.`
            : 'The id is made from the course and unit number when you first save.'}{' '}
          Pictures are attached from the illustration desk, after review.
        </p>
        <div className="learning-grid">
          <label>
            Unit title
            <input value={editing.title} onChange={(event) => update({ title: event.target.value })} placeholder="Family & people" />
          </label>
          <label>
            Unit number
            <input
              type="number"
              min={1}
              value={editing.order}
              disabled={Boolean(editing.id)}
              onChange={(event) => update({ order: Number(event.target.value) })}
            />
          </label>
          <label>
            Course
            <input value={editing.courseId} disabled={Boolean(editing.id)} onChange={(event) => update({ courseId: event.target.value.trim() })} />
          </label>
          <label>
            One-line description
            <input value={editing.subtitle} onChange={(event) => update({ subtitle: event.target.value })} placeholder="Relatives, names and the people around you" />
          </label>
          <label className="learning-checkbox">
            <input type="checkbox" checked={editing.published} onChange={(event) => update({ published: event.target.checked })} />
            Published
          </label>
        </div>
        {problems.length > 0 ? (
          <ul className="learning-problems">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="error-line">{error}</p> : null}
        <div className="learning-admin__actions">
          <Button
            disabled={saving || problems.length > 0}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await saveUnit(editing);
                setEditing(null);
                await load();
              } catch (err) {
                setError(messageOf(err, 'The unit could not be saved.'));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save unit'}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  const nextOrder = units.reduce((highest, unit) => Math.max(highest, unit.order), 0) + 1;
  return (
    <section className="panel">
      <h2>Units</h2>
      <p className="panel__hint">
        Until any unit is published, the app shows its bundled outline: Start a conversation, Family &amp;
        people, Food &amp; home and Around town. Publishing even one unit replaces that outline, so publish
        them together.
      </p>
      <div className="learning-admin__actions">
        <Button onClick={() => setEditing(emptyUnit(nextOrder))}>New unit</Button>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
      {loading ? <Loading label="Loading units" /> : null}
      {!loading && units.length === 0 ? <EmptyState title="No units yet" body="The app is showing its bundled Kasem outline." /> : null}
      {units.length > 0 ? (
        <TableShell label="Units">
          <table className="learning-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Unit</th>
                <th>Picture</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.order}</td>
                  <td>
                    <strong>{unit.title}</strong>
                    <div className="muted learning-table__id">
                      {unit.courseId} · {unit.id}
                    </div>
                  </td>
                  <td>{unit.imageUrl ? <img className="course-desk__thumb" src={unit.imageUrl} alt="" /> : <span className="muted">None</span>}</td>
                  <td>
                    <StatusPill tone={unit.published ? 'success' : 'warning'}>{unit.published ? 'Published' : 'Draft'}</StatusPill>
                  </td>
                  <td className="learning-table__actions">
                    <Button variant="ghost" onClick={() => setEditing(unit)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (!window.confirm(`Delete unit "${unit.title}"? Its lessons stay, and are grouped under their unit number.`)) return;
                        await deleteUnit(unit.id);
                        await load();
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------- Illustrations */

const TARGET_KINDS: IllustrationTarget['kind'][] = ['none', 'unit', 'lesson', 'course'];

/**
 * Nano Banana on Vertex AI, through `generateLearnIllustration`.
 *
 * Standard is Nano Banana 2 (gemini-3.1-flash-image); best quality is Nano
 * Banana Pro (gemini-3-pro-image). Every picture arrives as a DRAFT with its
 * prompt, model and creator recorded, and reaches learners only when an
 * administrator approves it and attaches it to a unit, lesson or course.
 */
export function IllustrationDesk({ canApprove }: { canApprove: boolean }) {
  const [items, setItems] = useState<Illustration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [ratio, setRatio] = useState<string>('16:9');
  const [quality, setQuality] = useState<IllustrationQuality>('standard');
  const [size, setSize] = useState('1K');
  const [houseStyle, setHouseStyle] = useState(true);
  const [target, setTarget] = useState<IllustrationTarget>({ kind: 'none', id: '' });
  const [references, setReferences] = useState<string[]>([]);
  const [editFrom, setEditFrom] = useState<Illustration | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listIllustrations());
    } catch (err) {
      setError(messageOf(err, 'Could not load illustrations.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sizes = ILLUSTRATION_SIZES[quality];
  const chooseQuality = (next: IllustrationQuality) => {
    setQuality(next);
    if (!ILLUSTRATION_SIZES[next].includes(size)) setSize(ILLUSTRATION_SIZES[next][0]);
  };

  const onReference = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const uid = auth.currentUser?.uid;
    if (!file || !uid) return;
    if (references.length >= 3) {
      setError('Attach at most three reference images.');
      return;
    }
    try {
      setReferences([...references, await uploadReference(file, uid)]);
    } catch (err) {
      setError(messageOf(err, 'The reference image could not be uploaded.'));
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await generateIllustration({
        prompt,
        title,
        aspectRatio: ratio,
        imageSize: size,
        quality,
        style: houseStyle ? 'course' : 'none',
        mode: editFrom ? 'edit' : 'generate',
        sourceIllustrationId: editFrom?.id,
        referenceImagePaths: references,
        target,
      });
      if (result.status === 'failed') setError(result.errorMessage ?? 'The illustration could not be made.');
      setEditFrom(null);
      setReferences([]);
      await load();
    } catch (err) {
      setError(messageOf(err, 'The illustration could not be made.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="learning-admin">
      <section className="panel">
        <h2>{editFrom ? 'Edit an illustration' : 'Illustration desk'}</h2>
        <p className="panel__hint">
          Pictures for the Learn tab, made with Vertex AI on the server. Every picture starts as a draft and is only
          shown to learners after an administrator approves it. Portray Kassena life with care: no masks, shrines or
          rituals, and no real people.
        </p>
        {editFrom ? (
          <Alert tone="info" title={`Editing "${editFrom.title || editFrom.id}"`} action={<Button variant="ghost" onClick={() => setEditFrom(null)}>Stop editing</Button>}>
            Describe only what should change. The original is sent to the model as the first image.
          </Alert>
        ) : null}
        <div className="learning-grid">
          <label className="course-desk__wide">
            Prompt
            <textarea
              rows={4}
              maxLength={2000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A Kassena family outside their painted compound in warm late-afternoon light…"
            />
          </label>
          <label>
            Title (for this desk)
            <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Unit 2 card" />
          </label>
          <label>
            Shape
            <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
              {ILLUSTRATION_RATIOS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Quality
            <select value={quality} onChange={(event) => chooseQuality(event.target.value as IllustrationQuality)}>
              <option value="standard">Standard · Nano Banana 2</option>
              <option value="best">Best · Nano Banana Pro</option>
            </select>
          </label>
          <label>
            Resolution
            <select value={size} onChange={(event) => setSize(event.target.value)}>
              {sizes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            For
            <select value={target.kind} onChange={(event) => setTarget({ kind: event.target.value as IllustrationTarget['kind'], id: target.id })}>
              {TARGET_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind === 'none' ? 'Nothing yet' : kind}
                </option>
              ))}
            </select>
          </label>
          {target.kind !== 'none' ? (
            <label>
              {target.kind} id
              <input value={target.id} onChange={(event) => setTarget({ ...target, id: event.target.value.trim() })} placeholder="kasem-unit-2" />
            </label>
          ) : null}
          <label className="learning-checkbox">
            <input type="checkbox" checked={houseStyle} onChange={(event) => setHouseStyle(event.target.checked)} />
            Use the course house style
          </label>
          <label>
            Reference images ({references.length}/3)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void onReference(event)} />
          </label>
        </div>
        {error ? <p className="error-line">{error}</p> : null}
        <div className="learning-admin__actions">
          <Button disabled={busy || !prompt.trim()} onClick={() => void generate()}>
            {busy ? 'Drawing… (up to a minute)' : editFrom ? 'Make the edit' : 'Generate draft'}
          </Button>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </section>

      <section className="panel">
        <h3>Recent illustrations</h3>
        {loading ? <Loading label="Loading illustrations" /> : null}
        {!loading && items.length === 0 ? <EmptyState title="Nothing drawn yet" /> : null}
        <div className="course-desk__grid">
          {items.map((item) => (
            <IllustrationCard
              key={item.id}
              item={item}
              canApprove={canApprove}
              onEdit={() => {
                setEditFrom(item);
                setPrompt('');
                setRatio(item.aspectRatio || '16:9');
                setTarget(item.target);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onChanged={load}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function IllustrationCard({
  item,
  canApprove,
  onEdit,
  onChanged,
}: {
  item: Illustration;
  canApprove: boolean;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<IllustrationTarget>(item.target);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    previewUrl(item)
      .then((value) => {
        if (live) setUrl(value);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [item]);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await reviewIllustration(item.id, decision, note, target.kind === 'none' ? null : target);
      await onChanged();
    } catch (err) {
      setError(messageOf(err, 'The decision could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="course-desk__card">
      <div className="course-desk__image">
        {url ? <img src={url} alt={item.prompt} /> : <span className="muted">{item.status === 'generating' ? 'Drawing…' : 'No picture'}</span>}
      </div>
      <div className="course-desk__meta">
        <StatusPill tone={toneForStatus(item.status)}>{item.status}</StatusPill>
        <strong>{item.title || item.prompt.slice(0, 60)}</strong>
        <span className="muted">
          {item.modelLabel ?? item.quality} · {item.aspectRatio} · {item.imageSize} · {item.creatorName || 'staff'}
        </span>
        <details>
          <summary>Prompt</summary>
          <p>{item.prompt}</p>
        </details>
        {item.errorMessage ? <p className="error-line">{item.errorMessage}</p> : null}
        {item.reviewNote ? <p className="muted">Note: {item.reviewNote}</p> : null}
        {item.attribution ? <p className="muted">{item.attribution}</p> : null}
        {item.storagePath ? (
          <Button variant="ghost" onClick={onEdit}>
            Edit this picture
          </Button>
        ) : null}
        {canApprove && (item.status === 'draft' || item.status === 'approved') ? (
          <div className="course-desk__review">
            <label>
              Attach to
              <select value={target.kind} onChange={(event) => setTarget({ kind: event.target.value as IllustrationTarget['kind'], id: target.id })}>
                {TARGET_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === 'none' ? 'Nothing' : kind}
                  </option>
                ))}
              </select>
            </label>
            {target.kind !== 'none' ? (
              <input value={target.id} placeholder="id" onChange={(event) => setTarget({ ...target, id: event.target.value.trim() })} />
            ) : null}
            <input value={note} placeholder="Review note (required to reject)" onChange={(event) => setNote(event.target.value)} />
            <div className="learning-admin__actions">
              <Button disabled={busy} onClick={() => void decide('approve')}>
                {item.status === 'approved' ? 'Re-attach' : 'Approve'}
              </Button>
              <Button variant="ghost" disabled={busy || !note.trim()} onClick={() => void decide('reject')}>
                Reject
              </Button>
            </div>
            {error ? <p className="error-line">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* -------------------------------------------------------- Pronunciations */

/**
 * Recordings learners made in Speak practice. A person listens; nothing was
 * transcribed or scored. Approving attaches the sound to the word only when
 * the learner agreed and the word has no recording yet — a published
 * recording is never replaced from here.
 */
export function PronunciationReviewPanel() {
  const [items, setItems] = useState<PronunciationRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSubmittedRecordings());
    } catch (err) {
      setError(messageOf(err, 'Could not load recordings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">
      <h2>Pronunciation recordings</h2>
      <p className="panel__hint">
        Kasem words recorded by learners in Speak practice, waiting for a person to listen. Approve a recording that
        says the word well. It becomes the word’s pronunciation only if the learner agreed and the word has none yet.
      </p>
      <div className="learning-admin__actions">
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
      {loading ? <Loading label="Loading recordings" /> : null}
      {!loading && items.length === 0 ? <EmptyState title="Nothing waiting" body="New recordings from Speak practice appear here." /> : null}
      {items.map((item) => (
        <RecordingRow key={item.id} item={item} onChanged={load} />
      ))}
    </section>
  );
}

function RecordingRow({ item, onChanged }: { item: PronunciationRecording; onChanged: () => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    recordingUrl(item)
      .then((value) => {
        if (live) setUrl(value);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [item]);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await decideRecording(item.id, decision, note);
      await onChanged();
    } catch (err) {
      setError(messageOf(err, 'The decision could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="course-desk__recording">
      <div>
        <strong>{item.headword}</strong> <span className="muted">— {item.meaning}</span>
        <div className="muted">
          {item.contributorName || 'A learner'} · {(item.durationMs / 1000).toFixed(1)} s ·{' '}
          {item.publishConsent ? 'may be published' : 'feedback only'}
        </div>
      </div>
      {url ? <audio controls src={url} preload="none" /> : <span className="muted">Audio unavailable</span>}
      <input value={note} placeholder="Note (required to reject)" onChange={(event) => setNote(event.target.value)} />
      <div className="learning-admin__actions">
        <Button disabled={busy} onClick={() => void decide('approve')}>
          Approve
        </Button>
        <Button variant="ghost" disabled={busy || !note.trim()} onClick={() => void decide('reject')}>
          Reject
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
    </div>
  );
}
