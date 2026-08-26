import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@indigen-world/web-ui';
import {
  deleteLesson,
  emptyLesson,
  emptyQuestion,
  lessonProblems,
  listLessons,
  LESSON_ICONS,
  saveLesson,
  type Lesson,
  type LessonQuestion,
} from './data';
import './learning.css';

/**
 * The Kasem learning path editor.
 *
 * Two things this screen has to get right, because a language course is not a
 * blog: a lesson is only visible to learners once somebody publishes it, and
 * the id a lesson is saved under never changes after creation — member
 * progress is keyed by it, and a rename that reissued the id would silently
 * un-finish the lesson for everybody who had done it.
 */
export function LearningAdmin() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lesson | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLessons(await listLessons());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the lesson path.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const units = useMemo(() => {
    const grouped = new Map<string, Lesson[]>();
    for (const lesson of lessons) {
      const key = `${lesson.unitOrder}::${lesson.unitTitle}`;
      const existing = grouped.get(key);
      if (existing) existing.push(lesson);
      else grouped.set(key, [lesson]);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [lessons]);

  const nextOrder = lessons.reduce((highest, lesson) => Math.max(highest, lesson.order), 0) + 1;

  if (editing) {
    return (
      <LessonEditor
        lesson={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  return (
    <div className="learning-admin">
      <section className="panel">
        <h2>Learning path</h2>
        <p className="panel__hint">
          Lessons the mobile Learn tab walks members through, in order. A lesson holds one or more
          questions and is only shown to learners once it is published. Members' progress is stored
          against the lesson id, so reordering the path is safe and renaming a lesson never costs
          anybody their ticks.
        </p>
        <div className="learning-admin__actions">
          <Button onClick={() => setEditing(emptyLesson(nextOrder))}>New lesson</Button>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        {error ? <p className="error-line">{error}</p> : null}
        {loading ? <p className="muted">Loading lessons…</p> : null}
        {!loading && lessons.length === 0 ? (
          <p className="muted">
            No lessons configured yet. Until one is published, the app shows its bundled preview
            unit.
          </p>
        ) : null}
      </section>

      {units.map(([key, unitLessons]) => (
        <section className="panel" key={key}>
          <h3>
            Unit {unitLessons[0].unitOrder} · {unitLessons[0].unitTitle}
          </h3>
          {unitLessons[0].unitSubtitle ? (
            <p className="panel__hint">{unitLessons[0].unitSubtitle}</p>
          ) : null}
          <table className="learning-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Lesson</th>
                <th>Questions</th>
                <th>XP</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {unitLessons
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((lesson) => (
                  <tr key={lesson.id}>
                    <td>{lesson.order}</td>
                    <td>
                      <strong>{lesson.title || 'Untitled'}</strong>
                      <div className="muted learning-table__id">{lesson.id}</div>
                    </td>
                    <td>{lesson.questions.length}</td>
                    <td>{lesson.xp}</td>
                    <td>
                      <span
                        className={`learning-status learning-status--${
                          lesson.published ? 'live' : 'draft'
                        }`}
                      >
                        {lesson.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="learning-table__actions">
                      <Button variant="ghost" onClick={() => setEditing(lesson)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete "${lesson.title}"? Members keep the XP they already earned, ` +
                                'but the lesson disappears from the path.',
                            )
                          ) {
                            return;
                          }
                          await deleteLesson(lesson.id);
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
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Editor */

function LessonEditor({
  lesson: initial,
  onCancel,
  onSaved,
}: {
  lesson: Lesson;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [lesson, setLesson] = useState<Lesson>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = lessonProblems(lesson);
  const update = (patch: Partial<Lesson>) => setLesson((current) => ({ ...current, ...patch }));

  const updateQuestion = (index: number, patch: Partial<LessonQuestion>) =>
    setLesson((current) => ({
      ...current,
      questions: current.questions.map((question, position) =>
        position === index ? { ...question, ...patch } : question,
      ),
    }));

  const save = async () => {
    if (problems.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await saveLesson(lesson);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The lesson could not be saved.');
      setSaving(false);
    }
  };

  return (
    <div className="learning-admin">
      <section className="panel">
        <h2>{lesson.id ? 'Edit lesson' : 'New lesson'}</h2>
        <p className="panel__hint">
          {lesson.id
            ? `Saved as ${lesson.id}. The id is fixed once a lesson exists, because member progress is keyed by it.`
            : 'The id is generated from the unit number and title when you first save, and never changes afterwards.'}
        </p>

        <div className="learning-grid">
          <label>
            Lesson title
            <input
              value={lesson.title}
              onChange={(event) => update({ title: event.target.value })}
              placeholder="Say hello"
            />
          </label>
          <label>
            Position on the path
            <input
              type="number"
              min={0}
              value={lesson.order}
              onChange={(event) => update({ order: Number(event.target.value) })}
            />
          </label>
          <label>
            Unit number
            <input
              type="number"
              min={1}
              value={lesson.unitOrder}
              onChange={(event) => update({ unitOrder: Number(event.target.value) })}
            />
          </label>
          <label>
            Unit title
            <input
              value={lesson.unitTitle}
              onChange={(event) => update({ unitTitle: event.target.value })}
              placeholder="Start a conversation"
            />
          </label>
          <label className="learning-grid__wide">
            Unit subtitle
            <input
              value={lesson.unitSubtitle}
              onChange={(event) => update({ unitSubtitle: event.target.value })}
              placeholder="Greetings, introductions and everyday courtesy"
            />
          </label>
          <label>
            Minutes
            <input
              type="number"
              min={1}
              value={lesson.minutes}
              onChange={(event) => update({ minutes: Number(event.target.value) })}
            />
          </label>
          <label>
            XP awarded
            <input
              type="number"
              min={0}
              value={lesson.xp}
              onChange={(event) => update({ xp: Number(event.target.value) })}
            />
          </label>
          <label>
            Icon
            <select
              value={lesson.iconName}
              onChange={(event) => update({ iconName: event.target.value })}
            >
              {LESSON_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </label>
          <label className="learning-checkbox">
            <input
              type="checkbox"
              checked={lesson.published}
              onChange={(event) => update({ published: event.target.checked })}
            />
            Published — visible to every learner
          </label>
        </div>
      </section>

      {lesson.questions.map((question, index) => (
        <QuestionEditor
          key={index}
          index={index}
          question={question}
          canRemove={lesson.questions.length > 1}
          onChange={(patch) => updateQuestion(index, patch)}
          onRemove={() =>
            setLesson((current) => ({
              ...current,
              questions: current.questions.filter((_, position) => position !== index),
            }))
          }
        />
      ))}

      <section className="panel">
        <Button
          variant="ghost"
          onClick={() =>
            setLesson((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }))
          }
        >
          Add another question
        </Button>
      </section>

      <section className="panel">
        {problems.length > 0 ? (
          <ul className="learning-problems">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="error-line">{error}</p> : null}
        <div className="learning-admin__actions">
          <Button onClick={() => void save()} disabled={saving || problems.length > 0}>
            {saving ? 'Saving…' : 'Save lesson'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}

function QuestionEditor({
  index,
  question,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  question: LessonQuestion;
  canRemove: boolean;
  onChange: (patch: Partial<LessonQuestion>) => void;
  onRemove: () => void;
}) {
  const setAnswer = (position: number, value: string) =>
    onChange({ answers: question.answers.map((a, i) => (i === position ? value : a)) });

  return (
    <section className="panel">
      <div className="learning-question__head">
        <h3>Question {index + 1}</h3>
        {canRemove ? (
          <Button variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>

      <div className="learning-grid">
        <label className="learning-grid__wide">
          Prompt
          <input
            value={question.prompt}
            onChange={(event) => onChange({ prompt: event.target.value })}
            placeholder="Choose the greeting"
          />
        </label>
        <label className="learning-grid__wide">
          Supporting line
          <input
            value={question.support}
            onChange={(event) => onChange({ support: event.target.value })}
            placeholder="Which phrase would you use to welcome someone?"
          />
        </label>
      </div>

      <p className="panel__hint">
        Choose which answer is correct with the radio button. Leave an answer blank to drop it.
      </p>
      <ol className="learning-answers">
        {question.answers.map((answer, position) => (
          <li key={position}>
            <input
              type="radio"
              name={`correct-${index}`}
              checked={question.correctAnswer === position}
              onChange={() => onChange({ correctAnswer: position })}
              aria-label={`Answer ${position + 1} is correct`}
            />
            <input
              value={answer}
              onChange={(event) => setAnswer(position, event.target.value)}
              placeholder={`Answer ${position + 1}`}
            />
            {question.answers.length > 2 ? (
              <Button
                variant="ghost"
                onClick={() =>
                  onChange({
                    answers: question.answers.filter((_, i) => i !== position),
                    // Keep the mark on the same answer after one above it goes.
                    correctAnswer:
                      question.correctAnswer > position
                        ? question.correctAnswer - 1
                        : Math.min(question.correctAnswer, question.answers.length - 2),
                  })
                }
              >
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      {question.answers.length < 6 ? (
        <Button variant="ghost" onClick={() => onChange({ answers: [...question.answers, ''] })}>
          Add answer
        </Button>
      ) : null}

      <label className="learning-explanation">
        Explanation shown after the answer is checked
        <textarea
          rows={2}
          value={question.explanation}
          onChange={(event) => onChange({ explanation: event.target.value })}
          placeholder="Say why this is the answer — this is where the teaching happens."
        />
      </label>
    </section>
  );
}
