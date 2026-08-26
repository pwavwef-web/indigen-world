import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * The Kasem learning path, as configured from the console.
 *
 * Lessons used to be a constant compiled into the mobile app, so adding one
 * meant shipping a release — and every member below that version kept the old
 * unit for as long as they went without updating. They live in Firestore now.
 * The app still bundles a copy as its first-launch fallback, so an empty
 * collection here is safe: it means members see the built-in preview, not an
 * empty path.
 */

/** Icon names the mobile app can draw. Anything else falls back to a book. */
export const LESSON_ICONS = [
  'wave',
  'headphones',
  'puzzle',
  'chat',
  'school',
  'book',
  'music',
  'family',
  'market',
  'map',
  'sun',
  'star',
] as const;

export type LessonIcon = (typeof LESSON_ICONS)[number];

export interface LessonQuestion {
  prompt: string;
  support: string;
  answers: string[];
  /** Index into `answers`. */
  correctAnswer: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  unitTitle: string;
  unitSubtitle: string;
  unitOrder: number;
  /** Position on the path. The app walks lessons in this order. */
  order: number;
  minutes: number;
  xp: number;
  iconName: LessonIcon | string;
  published: boolean;
  questions: LessonQuestion[];
}

export function emptyQuestion(): LessonQuestion {
  return { prompt: '', support: '', answers: ['', ''], correctAnswer: 0, explanation: '' };
}

export function emptyLesson(order: number): Lesson {
  return {
    id: '',
    title: '',
    unitTitle: 'Start a conversation',
    unitSubtitle: '',
    unitOrder: 1,
    order,
    minutes: 3,
    xp: 15,
    iconName: 'school',
    published: false,
    questions: [emptyQuestion()],
  };
}

/**
 * A stable, readable document id derived from the unit and title.
 *
 * Progress is remembered against these ids, so one is chosen once and then
 * left alone: renaming a lesson must not orphan the record of everybody who
 * already finished it. The editor keeps an existing id rather than recomputing
 * it, and this is only used when a lesson is first created.
 */
export function slugFor(unitOrder: number, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `unit${unitOrder}-${slug || 'lesson'}`;
}

/** Everything wrong with a lesson, in the order somebody would fix it. */
export function lessonProblems(lesson: Lesson): string[] {
  const problems: string[] = [];
  if (!lesson.title.trim()) problems.push('Give the lesson a title.');
  if (!lesson.unitTitle.trim()) problems.push('Give the unit a title.');
  if (lesson.questions.length === 0) problems.push('Add at least one question.');
  lesson.questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.prompt.trim()) problems.push(`${label}: add the prompt.`);
    const answers = question.answers.filter((answer) => answer.trim().length > 0);
    if (answers.length < 2) problems.push(`${label}: needs at least two answers.`);
    if (question.correctAnswer < 0 || question.correctAnswer >= question.answers.length) {
      problems.push(`${label}: mark which answer is correct.`);
    } else if (!question.answers[question.correctAnswer]?.trim()) {
      problems.push(`${label}: the answer marked correct is empty.`);
    }
  });
  // A published lesson is put in front of learners as guidance, so the bar for
  // publishing is higher than the bar for saving a draft.
  if (lesson.published && lesson.questions.some((q) => !q.explanation.trim())) {
    problems.push('Every question needs an explanation before the lesson is published.');
  }
  return problems;
}

function normalise(lesson: Lesson): Omit<Lesson, 'id'> {
  return {
    title: lesson.title.trim(),
    unitTitle: lesson.unitTitle.trim(),
    unitSubtitle: lesson.unitSubtitle.trim(),
    unitOrder: Math.max(1, Math.round(lesson.unitOrder)),
    order: Math.max(0, Math.round(lesson.order)),
    minutes: Math.max(1, Math.round(lesson.minutes)),
    xp: Math.max(0, Math.round(lesson.xp)),
    iconName: lesson.iconName,
    published: lesson.published,
    questions: lesson.questions.map((question) => {
      // Empty answer slots are dropped on save, which can move the correct
      // index — so it is re-resolved against the answer that was marked, not
      // carried over as a number that now points somewhere else.
      const marked = question.answers[question.correctAnswer];
      const answers = question.answers.map((a) => a.trim()).filter((a) => a.length > 0);
      const correctAnswer = Math.max(0, answers.indexOf((marked ?? '').trim()));
      return {
        prompt: question.prompt.trim(),
        support: question.support.trim(),
        answers,
        correctAnswer,
        explanation: question.explanation.trim(),
      };
    }),
  };
}

export async function listLessons(): Promise<Lesson[]> {
  const snapshot = await getDocs(query(collection(db, 'learnLessons'), orderBy('order')));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Partial<Lesson>;
    return {
      id: entry.id,
      title: data.title ?? '',
      unitTitle: data.unitTitle ?? 'Unit 1',
      unitSubtitle: data.unitSubtitle ?? '',
      unitOrder: typeof data.unitOrder === 'number' ? data.unitOrder : 1,
      order: typeof data.order === 'number' ? data.order : 0,
      minutes: typeof data.minutes === 'number' ? data.minutes : 3,
      xp: typeof data.xp === 'number' ? data.xp : 15,
      iconName: data.iconName ?? 'school',
      published: data.published === true,
      questions: Array.isArray(data.questions)
        ? data.questions.map((question) => ({
            prompt: question?.prompt ?? '',
            support: question?.support ?? '',
            answers: Array.isArray(question?.answers) ? question.answers : ['', ''],
            correctAnswer: typeof question?.correctAnswer === 'number' ? question.correctAnswer : 0,
            explanation: question?.explanation ?? '',
          }))
        : [emptyQuestion()],
    };
  });
}

export async function saveLesson(lesson: Lesson): Promise<string> {
  const id = lesson.id || slugFor(lesson.unitOrder, lesson.title);
  await setDoc(
    doc(db, 'learnLessons', id),
    { id, ...normalise(lesson), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return id;
}

export async function deleteLesson(id: string): Promise<void> {
  await deleteDoc(doc(db, 'learnLessons', id));
}
