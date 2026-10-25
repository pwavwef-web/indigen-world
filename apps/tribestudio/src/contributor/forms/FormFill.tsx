import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ANSWERS_BYTE_BUDGET, FORM_CATEGORIES, FORM_LANGUAGES, answersByteSize, carryAnswers, defaultAnswers, findField, largestAnswers, topLevelFields, validateAnswers,
} from '@indigen-world/contracts/forms';
import type { Answers, FormDefinition, Issue } from '@indigen-world/contracts/forms';
import type { FormsContributorResponses, OpenedForm } from '@indigen-world/contracts/forms-api';
import { FormRenderer, FormReviewSummary, formPages, issuesForSections, type FormRecorderProps, type KasemTextProps } from '@indigen-world/console-ui';
import { Badge, Button, ButtonLink, Disclosure, Icon, KeyValue, LoadFailure, Notice, Panel, ProgressBar, SaveState, Skeleton, Steps, type SaveStatus } from '../../ui';
import { VoiceRecorder } from '../../creator/components';
import { useRoute } from '../../router';
import { PageHeader } from '../components';
import { relativeTime } from '../model';
import { useWorkspace } from '../workspace';
import {
  announceFormsChanged, asFormsFailure, formsCall, formsFailure, formsUploadAdapter, readPendingSubmit, writePendingSubmit,
  type FormsFailure, type FormsRequest, type PendingSubmit,
} from './forms-data';
import { estimatedTime, openIssues, scheduleText, statusMeaning, submitRequest, windowNotice } from './forms-model';
import { FormKasemText } from './FormKasemText';
import { FormsCrumbs, FormsUnavailable, Multiline, ReferenceId } from './parts';

/*
 * Filling one form: /contributor/forms/{formId}[?response={id} | ?new=1].
 *
 * One FormRenderer stays mounted for the whole visit (uploads in progress live
 * inside it); paged forms change the sections it shows. Next checks the
 * current page with the contract's validateAnswers, the review step checks
 * everything again, and the server checks once more on submit. Answers are
 * kept exactly as typed. A submit carries a request id that is stored on the
 * device until the server confirms it, so a retry, a double click or a reload
 * can never create a second submission.
 */

const EDITABLE = ['draft', 'changes_requested'];
/** Reasons a saved draft can be read but not changed here. */
const READ_ONLY = ['closed', 'past_deadline', 'archived', 'not_published', 'retired'];
const AUTOSAVE_MS = 30_000;

type Saved = { responseId: string; draftRevision: number };
type SaveRequest = FormsRequest<'saveDraft'>;
type Confirmation = FormsContributorResponses['submit'] & { resubmission: boolean };
type Problem = { kind: 'uncertain' | 'conflict' | 'blocked' | 'invalid' | 'submitted'; message: string; responseId?: string };
type SaveView = { kind: 'idle' | 'saving' | 'saved' | 'error'; at: string | null; message: string; uncertain: boolean };

const signature = (answers: Answers) => JSON.stringify(answers);
const asFailure = asFormsFailure;
const kilobytes = (bytes: number) => `${Math.ceil(bytes / 1000)} KB`;

/**
 * The server keeps a response in one document and refuses answers above
 * ANSWERS_BYTE_BUDGET. The same measure is checked here before sending, so the
 * contributor is told which answers to shorten instead of being refused.
 */
function tooLarge(definition: FormDefinition, answers: Answers, measured = answersByteSize(answers)): FormsFailure | null {
  if (measured <= ANSWERS_BYTE_BUDGET) return null;
  const longest = largestAnswers(definition, answers, 3);
  return {
    code: 'invalid-argument',
    reason: 'too-large',
    uncertain: false,
    message: `This response is too large to save: ${kilobytes(measured)}, and a response can hold ${kilobytes(ANSWERS_BYTE_BUDGET)}. Shorten the longest answers${longest.length ? `: ${longest.map((row) => row.label).join('; ')}` : ''}.`,
    issues: longest.map((row) => ({ path: row.path, message: 'One of the longest answers. Shorten it so the response fits.' })),
  };
}

/** "Meaning", or "Words: Meaning" for a sub-question of a group (`groupId.subId`). */
function droppedLabel(definition: FormDefinition, key: string): string {
  const [top, sub] = key.split('.');
  const field = findField(definition, top);
  if (!sub) return field?.label || key;
  return `${field?.label || top}: ${field?.fields?.find((item) => item.id === sub)?.label || sub}`;
}

function unique(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function savedLabel(at: string | null): string {
  if (!at) return 'Saved';
  const time = new Date(at);
  return Number.isNaN(time.getTime()) ? 'Saved' : `Saved at ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Keeps one fill session per visit. When the first save creates the response,
 * the address changes to ?response={id} so a reload continues it; that change
 * must not start a new session (it would drop uploads in progress).
 */
export function FormFillRoute({ formId, query }: { formId: string; query: URLSearchParams }) {
  const requested = query.get('response');
  const startNew = query.get('new') === '1' && !requested;
  const own = useRef<string | null>(null);
  const seen = useRef<string | null>(null);
  const session = useRef('');
  const count = useRef(0);
  const address = `${requested ?? ''}|${startNew ? 'new' : ''}`;
  if (address !== seen.current) {
    // Any other change of address (another response, "start another") is a new visit.
    if (!(requested && requested === own.current)) {
      count.current += 1;
      session.current = `${address}#${count.current}`;
    }
    seen.current = address;
  }
  return (
    <FormFill
      key={session.current}
      formId={formId}
      requestedResponse={requested}
      startNew={startNew}
      onOwnResponse={(id) => { own.current = id; }}
    />
  );
}

function FormFill({ formId, requestedResponse, startNew, onOwnResponse }: {
  formId: string;
  requestedResponse: string | null;
  startNew: boolean;
  onOwnResponse: (id: string) => void;
}) {
  const data = useWorkspace();
  const { navigate } = useRoute();
  const preview = data.preview;
  const initial = useRef({ responseId: requestedResponse, startNew });

  const [opened, setOpened] = useState<OpenedForm | null>(null);
  const [loadFailure, setLoadFailure] = useState<FormsFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [denied, setDenied] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [responseId, setResponseId] = useState<string | null>(null);
  const [savedSig, setSavedSig] = useState('');
  const [saveView, setSaveView] = useState<SaveView>({ kind: 'idle', at: null, message: '', uncertain: false });
  const [saveProblem, setSaveProblem] = useState<Problem | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [found, setFound] = useState<{ issues: Issue[]; answers: Answers } | null>(null);
  const [serverFound, setServerFound] = useState<{ issues: Issue[]; answers: Answers } | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, setPending] = useState<PendingSubmit | null>(() => readPendingSubmit(data.uid, formId));
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  /** Answers moved to a newer version: by the contributor (moveToLatest), or because one was published while an unsaved response was being filled in. */
  const [moved, setMoved] = useState<{ version: number; dropped: string[]; whileFilling?: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const [actionError, setActionError] = useState('');

  // What the asynchronous save and submit steps read: always the latest.
  const answersRef = useRef<Answers>({});
  const openedRef = useRef<OpenedForm | null>(null);
  const responseIdRef = useRef<string | null>(null);
  const draftRevisionRef = useRef<number | null>(null);
  const savedSigRef = useRef('');
  const pendingRef = useRef<PendingSubmit | null>(pending);
  const submittingRef = useRef(false);
  const uploadingRef = useRef(0);
  const dirtyRef = useRef(false);
  const skipGuard = useRef(false);
  const unconfirmedSave = useRef<SaveRequest | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const focusAfter = useRef<'page' | 'review' | 'done' | null>(null);
  const pageHead = useRef<HTMLDivElement>(null);
  const reviewHead = useRef<HTMLHeadingElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  const live = useRef({ paths: data.paths, navigate, onOwnResponse });
  live.current = { paths: data.paths, navigate, onOwnResponse };

  /* -- Opening the form --------------------------------------------------------------------- */

  useEffect(() => {
    let active = true;
    setOpened(null);
    setLoadFailure(null);
    formsCall(preview, { action: 'open', formId, responseId: initial.current.responseId ?? null, startNew: initial.current.startNew })
      .then((next) => {
        if (!active) return;
        const start = next.response ? next.response.answers : defaultAnswers(next.definition);
        answersRef.current = start;
        openedRef.current = next;
        responseIdRef.current = next.response?.id ?? null;
        draftRevisionRef.current = next.response?.draftRevision ?? null;
        savedSigRef.current = signature(start);
        setAnswers(start);
        setResponseId(responseIdRef.current);
        setSavedSig(savedSigRef.current);
        setSaveView({ kind: 'idle', at: next.response?.updatedAt ?? null, message: '', uncertain: false });
        setPageIndex(0);
        setReviewing(false);
        setOpened(next);
      })
      .catch((error) => { if (active) setLoadFailure(formsFailure(error, 'This form')); });
    return () => { active = false; };
  }, [attempt, formId, preview]);

  const reload = useCallback(() => {
    initial.current = {
      responseId: responseIdRef.current ?? initial.current.responseId,
      startNew: !responseIdRef.current && initial.current.startNew,
    };
    setFound(null);
    setServerFound(null);
    setProblem(null);
    setSaveProblem(null);
    setAttempt((count) => count + 1);
  }, []);

  /* -- What may happen now ------------------------------------------------------------------- */

  const definition = opened?.definition ?? null;
  const reason = opened?.window.reason ?? null;
  const status = opened?.response?.status ?? 'draft';
  const sent = Boolean(opened?.response && !EDITABLE.includes(opened.response.status));
  const lockedByWindow = opened
    ? opened.response ? READ_ONLY.includes(reason ?? '') : !(opened.window.open || reason === 'not_yet_open')
    : true;
  // A once-only form this contributor has already answered (or started) offers no blank form to fill.
  const alreadyAnswered = Boolean(opened && !opened.response && !opened.canStartNew && definition?.submission.policy === 'once' && !lockedByWindow);
  const canEdit = Boolean(opened) && !sent && !alreadyAnswered && !lockedByWindow && !pending && !confirmation;
  const canSubmit = canEdit && Boolean(opened?.window.open);
  const allowDrafts = definition?.submission.allowDrafts !== false;
  const dirty = canEdit && signature(answers) !== savedSig;
  dirtyRef.current = dirty;
  uploadingRef.current = uploading;

  const pages = useMemo(() => (definition ? formPages(definition, answers) : []), [definition, answers]);
  const index = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[index];
  const paged = pages.length > 1;

  const pageIssues = useMemo(() => {
    if (!definition || !page) return [];
    return unique(issuesForSections(definition, [...openIssues(found, answers), ...openIssues(serverFound, answers)], page.sectionIds));
  }, [definition, page, found, serverFound, answers]);
  const reviewIssues = useMemo(() => {
    if (!definition || !reviewing) return [];
    return unique([...validateAnswers(definition, answers, { mode: 'submit' }).issues, ...openIssues(serverFound, answers)]);
  }, [definition, reviewing, answers, serverFound]);

  /* -- Saving ------------------------------------------------------------------------------------ */

  const applySaved = useCallback((result: { responseId: string; draftRevision: number; savedAt: string }, sentAnswers: Answers) => {
    const created = !responseIdRef.current;
    responseIdRef.current = result.responseId;
    draftRevisionRef.current = result.draftRevision;
    savedSigRef.current = signature(sentAnswers);
    setResponseId(result.responseId);
    setSavedSig(savedSigRef.current);
    setSaveView({ kind: 'saved', at: result.savedAt, message: '', uncertain: false });
    if (created) {
      // Continue this response after a reload, without starting a new visit.
      live.current.onOwnResponse(result.responseId);
      skipGuard.current = true;
      try {
        live.current.navigate(live.current.paths.form(formId, { response: result.responseId }), { replace: true });
      } finally {
        skipGuard.current = false;
      }
      announceFormsChanged();
    }
  }, [formId]);

  /**
   * A response that was never saved can only start on the current version. If
   * a new version was published while this one was being filled in, reopen
   * the form on it and carry the answers over, as moving a draft does, rather
   * than offer only a reload that would lose everything typed.
   */
  const carryToCurrentVersion = useCallback(async (): Promise<boolean> => {
    const before = openedRef.current;
    if (!before || responseIdRef.current) return false;
    let next: OpenedForm;
    try {
      next = await formsCall(preview, { action: 'open', formId, responseId: null, startNew: true });
    } catch {
      return false;
    }
    if (next.response || !next.canStartNew || next.version === before.version) return false;
    const { answers: carried, dropped } = carryAnswers(before.definition, next.definition, answersRef.current);
    openedRef.current = next;
    answersRef.current = carried;
    setOpened(next);
    setAnswers(carried);
    setFound(null);
    setServerFound(null);
    setMoved({ version: next.version, dropped: dropped.map((key) => droppedLabel(before.definition, key)), whileFilling: true });
    return true;
  }, [formId, preview]);

  const performSave = useCallback(async (): Promise<Saved> => {
    // A save whose reply was lost goes again first, unchanged: the server replays it if it
    // already landed, so the next save carries the right revision and no second response is made.
    if (unconfirmedSave.current) {
      const lost = unconfirmedSave.current;
      try {
        const result = await formsCall(preview, lost);
        unconfirmedSave.current = null;
        applySaved(result, lost.answers);
      } catch (error) {
        const failure = formsFailure(error, 'Saving');
        if (!failure.uncertain) unconfirmedSave.current = null;
        throw failure;
      }
    }
    const send = async (): Promise<Saved> => {
      const sentAnswers = answersRef.current;
      if (responseIdRef.current && draftRevisionRef.current !== null && signature(sentAnswers) === savedSigRef.current) {
        return { responseId: responseIdRef.current, draftRevision: draftRevisionRef.current };
      }
      const form = openedRef.current;
      if (!form) throw formsFailure(new Error('The form is still opening.'), 'Saving');
      const over = tooLarge(form.definition, sentAnswers);
      if (over) throw over;
      const request: SaveRequest = {
        action: 'saveDraft', formId, responseId: responseIdRef.current, version: form.version,
        answers: sentAnswers, expectedDraftRevision: draftRevisionRef.current, requestId: crypto.randomUUID(),
      };
      try {
        const result = await formsCall(preview, request);
        applySaved(result, sentAnswers);
        return { responseId: result.responseId, draftRevision: result.draftRevision };
      } catch (error) {
        const failure = formsFailure(error, 'Saving');
        if (failure.uncertain) unconfirmedSave.current = request;
        throw failure;
      }
    };
    try {
      return await send();
    } catch (error) {
      const failure = asFailure(error, 'Saving');
      if (failure.reason === 'version' && !failure.uncertain && await carryToCurrentVersion()) return send();
      throw failure;
    }
  }, [applySaved, carryToCurrentVersion, formId, preview]);

  /** Point at the longest answers when a response is over the size budget (found here or by the server). */
  const flagLongest = useCallback((failure: FormsFailure) => {
    const form = openedRef.current;
    if (failure.reason !== 'too-large' || !form) return;
    const issues = failure.issues.length ? failure.issues : tooLarge(form.definition, answersRef.current, Infinity)?.issues ?? [];
    setServerFound({ issues, answers: answersRef.current });
  }, []);

  /** Save the current answers (one save at a time; a clean form is not saved again). */
  const save = useCallback((): Promise<Saved> => {
    const run = chain.current.catch(() => undefined).then(async () => {
      const clean = responseIdRef.current && draftRevisionRef.current !== null && signature(answersRef.current) === savedSigRef.current && !unconfirmedSave.current;
      if (clean) return { responseId: responseIdRef.current!, draftRevision: draftRevisionRef.current! };
      setSaveView((view) => ({ ...view, kind: 'saving', message: '' }));
      try {
        const saved = await performSave();
        setSaveProblem(null);
        return saved;
      } catch (error) {
        const failure = asFailure(error, 'Saving');
        setSaveView((view) => ({ ...view, kind: 'error', message: failure.message, uncertain: failure.uncertain }));
        flagLongest(failure);
        if (failure.code === 'permission-denied') setDenied(true);
        else if (failure.code === 'aborted') setSaveProblem({ kind: 'conflict', message: failure.message });
        else if (failure.reason === 'not-editable') setSaveProblem({ kind: 'submitted', message: failure.message, responseId: failure.responseId ?? undefined });
        else if (failure.reason === 'version') setSaveProblem({ kind: 'conflict', message: failure.message });
        else if (!failure.uncertain) setSaveProblem({ kind: 'blocked', message: failure.message });
        throw failure;
      }
    });
    chain.current = run.catch(() => undefined);
    return run;
  }, [flagLongest, performSave]);

  // Autosave every 30 seconds while there are unsaved answers.
  useEffect(() => {
    if (!allowDrafts || !canEdit) return;
    const timer = window.setInterval(() => {
      if (dirtyRef.current && !submittingRef.current) void save().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [allowDrafts, canEdit, save]);

  // Leaving with unsaved answers, uploads on their way or a submit in flight asks first.
  useEffect(() => {
    const busy = () => dirtyRef.current || uploadingRef.current > 0 || submittingRef.current;
    const guard = (event: Event) => {
      if (skipGuard.current || !busy()) return;
      const message = uploadingRef.current > 0
        ? 'Files are still uploading and will not be attached if you leave. Leave this form anyway?'
        : submittingRef.current ? 'Your submission is still being sent. Leave this page anyway?'
          : 'Some answers are not saved yet. Leave this form anyway?';
      if (!window.confirm(message)) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!busy()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('studio:before-navigate', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('studio:before-navigate', guard);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);

  /* -- Moving through the form -------------------------------------------------------------------- */

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const element = target === 'review' ? reviewHead.current : target === 'done' ? doneHead.current : pageIssues.length ? null : pageHead.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'start' });
  });

  const goTo = (next: number | 'review') => {
    setFound(null);
    if (allowDrafts && dirtyRef.current) void save().catch(() => undefined);
    if (next === 'review') {
      setReviewing(true);
      focusAfter.current = 'review';
    } else {
      setReviewing(false);
      setPageIndex(Math.max(0, next));
      focusAfter.current = 'page';
    }
  };

  const nextPage = () => {
    if (!definition || !page) return;
    if (canEdit) {
      const issues = issuesForSections(definition, validateAnswers(definition, answers, { mode: 'submit' }).issues, page.sectionIds);
      if (issues.length) {
        setFound({ issues, answers });
        setFocusKey((count) => count + 1);
        return;
      }
    }
    goTo(index + 1 < pages.length ? index + 1 : 'review');
  };

  const editSection = (sectionId: string) => {
    const target = pages.findIndex((entry) => entry.sectionIds.includes(sectionId));
    goTo(target >= 0 ? target : 0);
  };

  const change = useCallback((next: Answers) => {
    answersRef.current = next;
    setAnswers(next);
  }, []);

  /* -- Submitting ------------------------------------------------------------------------------------ */

  const forgetPending = useCallback(() => {
    writePendingSubmit(data.uid, formId, null);
    pendingRef.current = null;
    setPending(null);
  }, [data.uid, formId]);

  const submit = async () => {
    if (submittingRef.current || !definition) return;
    let request = pendingRef.current;
    if (!request) {
      if (!canSubmit || uploadingRef.current > 0) return;
      if (validateAnswers(definition, answersRef.current, { mode: 'submit' }).issues.length) {
        reviewHead.current?.focus();
        return;
      }
    }
    submittingRef.current = true;
    setSubmitting(true);
    setProblem(null);
    try {
      if (!request) {
        const saved = await save();
        const payload = { responseId: saved.responseId, answers: answersRef.current, expectedDraftRevision: saved.draftRevision };
        const ids = submitRequest(null, payload, () => crypto.randomUUID());
        request = { ...ids, ...payload, startedAt: new Date().toISOString() };
        // Kept on the device until the server answers: a retry after a reload sends the same request.
        writePendingSubmit(data.uid, formId, request);
        pendingRef.current = request;
        setPending(request);
      }
      const reply = await formsCall(preview, {
        action: 'submit', responseId: request.responseId, answers: request.answers,
        expectedDraftRevision: request.expectedDraftRevision, requestId: request.requestId,
      });
      forgetPending();
      savedSigRef.current = signature(answersRef.current);
      setSavedSig(savedSigRef.current);
      setConfirmation({ ...reply, resubmission: reply.revision > 1 });
      focusAfter.current = 'done';
      announceFormsChanged();
    } catch (error) {
      const failure = asFailure(error, 'Your submission');
      if (failure.uncertain) {
        setProblem({ kind: 'uncertain', message: failure.message });
      } else {
        forgetPending();
        flagLongest(failure);
        if (failure.code === 'permission-denied') setDenied(true);
        else if (failure.code === 'failed-precondition' && failure.reason === 'invalid') {
          setServerFound({ issues: failure.issues, answers: answersRef.current });
          setProblem({ kind: 'invalid', message: failure.message });
        } else if (failure.code === 'aborted') setProblem({ kind: 'conflict', message: failure.message });
        else if (failure.reason === 'not-editable') setProblem({ kind: 'submitted', message: failure.message, responseId: request?.responseId });
        else setProblem({ kind: 'blocked', message: failure.message });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const moveToLatest = async () => {
    const id = responseIdRef.current;
    const before = openedRef.current?.definition;
    if (!id || !before || moving) return;
    setMoving(true);
    setActionError('');
    try {
      if (dirtyRef.current) await save();
      const result = await formsCall(preview, { action: 'moveToLatest', responseId: id });
      setMoved({ version: result.version, dropped: result.dropped.map((key) => droppedLabel(before, key)) });
      reload();
    } catch (error) {
      setActionError(asFailure(error, 'Moving your draft').message);
    } finally {
      setMoving(false);
    }
  };

  /* -- Renderer hooks ------------------------------------------------------------------------------------ */

  const adapter = useMemo(() => formsUploadAdapter({
    preview,
    ensureResponse: async () => (await save()).responseId,
    currentResponse: () => responseIdRef.current,
  }), [preview, save]);
  const renderKasemText = useCallback((props: KasemTextProps) => <FormKasemText {...props} />, []);
  const renderRecorder = useCallback((props: FormRecorderProps) => (props.disabled ? null : <VoiceRecorder onAudioReady={props.onRecorded} />), []);

  /* -- Screens ------------------------------------------------------------------------------------------- */

  if (denied || loadFailure?.code === 'permission-denied') return <FormsUnavailable kind="denied" />;
  if (loadFailure?.code === 'not-found') return <FormsUnavailable kind="missing" message={loadFailure.message} />;
  if (loadFailure) {
    return (
      <div className="ts-page fm-page">
        <PageHeader breadcrumb={<FormsCrumbs current="Form" />} title="This form could not be opened" />
        <LoadFailure title="The form did not load" body={loadFailure.message} onRetry={reload} />
      </div>
    );
  }
  if (!opened || !definition) {
    return <div className="ts-page fm-page"><Skeleton title lines={7} label="Opening the form" /></div>;
  }

  const category = FORM_CATEGORIES.find((entry) => entry.id === definition.category)?.label ?? 'Form';
  const schedule = scheduleText(definition.schedule);
  const time = estimatedTime(definition.estimatedMinutes);
  const notice = confirmation ? null : windowNotice(reason);
  const resubmission = status === 'changes_requested';
  const consentCount = topLevelFields(definition).filter(({ field }) => field.type === 'consent').length;
  const languages = definition.languageContext.languageIds.map((id) => FORM_LANGUAGES.find((entry) => entry.id === id)?.label ?? id);
  const saveStatus: SaveStatus = saveView.kind === 'saving' ? 'saving' : saveView.kind === 'error' ? 'error' : dirty ? 'unsaved' : responseId ? 'saved' : 'idle';
  const saveLabel = saveView.kind === 'saving' ? 'Saving…'
    : saveView.kind === 'error' ? (saveView.uncertain ? 'Not saved · check your connection' : 'Not saved')
      : dirty ? 'Unsaved changes'
        : saveView.kind === 'saved' ? savedLabel(saveView.at)
          : responseId ? `Saved ${relativeTime(saveView.at)}`
            : allowDrafts ? 'Not saved yet' : 'Kept on this page until you submit';
  // What went wrong with the last Submit (except a lost reply, which has its own notice).
  const problemNotice = problem && problem.kind !== 'uncertain' ? (
    <Notice
      tone={problem.kind === 'submitted' ? 'info' : 'danger'}
      role="alert"
      title={problem.kind === 'invalid' ? 'Some answers need attention' : problem.kind === 'conflict' ? 'This response changed somewhere else' : undefined}
      action={problem.kind === 'conflict'
        ? <Button size="sm" icon="refresh" onClick={reload}>Reload the form</Button>
        : problem.kind === 'submitted' && (problem.responseId ?? responseId) ? <ButtonLink size="sm" to={data.paths.formSubmission((problem.responseId ?? responseId)!)}>View the response</ButtonLink> : undefined}
    >
      {problem.message}
    </Notice>
  ) : null;
  const unconfirmedNotice = pending ? (
    <Notice
      tone="warning"
      role="alert"
      title="Your submission was not confirmed"
      action={(
        <span className="fm-notice-actions">
          <Button size="sm" variant="primary" busy={submitting} onClick={() => void submit()}>Finish submitting</Button>
          <Button size="sm" variant="ghost" disabled={submitting} onClick={() => { forgetPending(); setProblem(null); reload(); }}>Keep editing instead</Button>
        </span>
      )}
    >
      {problem?.kind === 'uncertain' ? `${problem.message} ` : ''}
      It was sent, but no reply arrived. Finishing sends exactly the same request again, so it cannot be submitted twice. The form is locked until then.
    </Notice>
  ) : null;
  const moveAction = (
    <Button size="sm" variant="primary" busy={moving} onClick={() => void moveToLatest()}>Start again on the current version</Button>
  );

  return (
    <div className="ts-page fm-page fm-fill">
      <PageHeader
        breadcrumb={<FormsCrumbs current={definition.title} />}
        kicker={category}
        title={definition.title}
        description={definition.description || undefined}
        meta={(
          <span className="fm-meta">
            {time ? <span className="fm-chip"><Icon name="clock" />{time}</span> : null}
            {schedule ? <span className={`fm-chip fm-tone--${schedule.tone}`}><Icon name="calendar" />{schedule.label}</span> : null}
            {resubmission ? <Badge tone="warning" dot>Changes requested</Badge> : null}
          </span>
        )}
      />

      {pending && !confirmation && !reviewing ? unconfirmedNotice : null}
      {!reviewing && !confirmation ? problemNotice : null}

      {notice && !sent && !alreadyAnswered ? (
        <Notice tone={notice.tone} title={notice.title} role="status" action={reason === 'retired' && responseId ? moveAction : undefined}>
          {opened.window.message}
          {reason === 'not_yet_open' && definition.schedule.opensAt ? ' You can save a draft now and submit it once the form opens.' : ''}
          {(reason === 'closed' || reason === 'past_deadline' || reason === 'archived') && opened.response ? ' Your saved answers are shown below but can no longer be submitted.' : ''}
        </Notice>
      ) : null}
      {opened.newerVersion && reason !== 'retired' && !confirmation ? (
        <Notice tone="info" title="A newer version of this form is available" action={moveAction}>
          {`Your draft uses version ${opened.version}. You can submit it as it is, or move it to version ${opened.newerVersion}; answers to questions that changed are left out and listed for you, and each permission is asked again in the new wording.`}
        </Notice>
      ) : null}
      {moved ? (
        <Notice
          tone={moved.whileFilling ? 'info' : 'success'}
          title={moved.whileFilling ? `This form was updated to version ${moved.version} while you were filling it in` : `Your draft now uses version ${moved.version}`}
          role="status"
        >
          {moved.whileFilling ? 'Your answers were moved to the new version. Check them before you submit. ' : ''}
          {moved.dropped.length ? (
            <>
              These answers no longer apply and were removed:
              <ul className="fm-dropped">{moved.dropped.map((label, position) => <li key={position}>{label}</li>)}</ul>
            </>
          ) : 'All of your answers still apply.'}
        </Notice>
      ) : null}
      {actionError ? <Notice tone="danger" role="alert">{actionError}</Notice> : null}

      {confirmation ? (
        <section className="ts-panel fm-done" aria-labelledby="fm-done-title">
          <span className="fm-done__icon" aria-hidden="true"><Icon name="check-circle" /></span>
          <h2 className="fm-done__title" id="fm-done-title" tabIndex={-1} ref={doneHead}>{confirmation.resubmission ? 'Response resubmitted' : 'Response submitted'}</h2>
          <ReferenceId value={confirmation.referenceId} large />
          <p className="ts-hint">Keep this reference if you need to ask about your response.</p>
          {confirmation.successMessage ? <Multiline className="fm-done__message" text={confirmation.successMessage} /> : null}
          {confirmation.nextSteps ? (
            <div className="fm-done__next">
              <h3>What happens next</h3>
              <Multiline text={confirmation.nextSteps} />
            </div>
          ) : null}
          <div className="ts-cluster fm-done__actions">
            <ButtonLink variant="primary" iconRight="arrow" to={data.paths.formSubmission(confirmation.responseId)}>View this response</ButtonLink>
            <ButtonLink variant="secondary" to={data.paths.section('forms', { tab: 'mine' })}>My submissions</ButtonLink>
            <ButtonLink variant="ghost" to={data.paths.section('forms')}>Available forms</ButtonLink>
          </div>
        </section>
      ) : sent && opened.response ? (
        <Panel title="This response has already been sent">
          <div className="ts-stack ts-stack--sm">
            <p>{statusMeaning(opened.response.status, definition.review.required)}</p>
            {opened.response.referenceId ? <ReferenceId value={opened.response.referenceId} /> : null}
            <div className="ts-cluster">
              <ButtonLink variant="primary" iconRight="arrow" to={data.paths.formSubmission(opened.response.id)}>View your response</ButtonLink>
              {opened.canStartNew ? <ButtonLink variant="secondary" icon="plus" to={data.paths.form(formId, { new: '1' })}>Start another response</ButtonLink> : null}
              <ButtonLink variant="ghost" to={data.paths.section('forms')}>Available forms</ButtonLink>
            </div>
          </div>
        </Panel>
      ) : alreadyAnswered ? (
        <Panel title="You have already responded to this form">
          <div className="ts-stack ts-stack--sm">
            <p>This form takes one response per contributor, and yours is already under My submissions. Open it there to see where it stands or to continue it.</p>
            <div className="ts-cluster">
              <ButtonLink variant="primary" iconRight="arrow" to={data.paths.section('forms', { tab: 'mine' })}>My submissions</ButtonLink>
              <ButtonLink variant="ghost" to={data.paths.section('forms')}>Available forms</ButtonLink>
            </div>
          </div>
        </Panel>
      ) : (
        <div className="ts-split fm-fill__grid">
          <div className="ts-stack ts-stack--md fm-fill__main">
            {resubmission && opened.response?.feedback ? (
              <section className="fm-feedback" aria-labelledby="fm-feedback-title">
                <h2 className="fm-feedback__title" id="fm-feedback-title"><Icon name="message" />Feedback from the reviewer</h2>
                <Multiline text={opened.response.feedback} />
                <p className="ts-hint">Change what the reviewer asked for, then resubmit. Your earlier submission stays in this response’s history.</p>
              </section>
            ) : null}
            {definition.instructions ? (
              <Disclosure summary="Instructions" icon="info" defaultOpen className="fm-instructions">
                <Multiline text={definition.instructions} />
              </Disclosure>
            ) : null}

            <section className="ts-panel fm-sheet" aria-label={`${definition.title}: your answers`}>
              <div className="fm-sheet__head">
                <div className="fm-sheet__where" ref={pageHead} tabIndex={-1}>
                  {reviewing ? 'Check and submit' : paged ? `Section ${index + 1} of ${pages.length}` : 'Your answers'}
                  {!reviewing && paged && page ? <span className="ts-sr">{`: ${page.title}`}</span> : null}
                </div>
                {canEdit ? <SaveState status={saveStatus} label={saveLabel} /> : null}
              </div>
              {paged ? <ProgressBar small value={reviewing ? pages.length : index} max={pages.length} label="Progress through the form" /> : null}
              {paged ? (
                <Steps
                  compact
                  className="fm-steps"
                  label="Sections of this form"
                  current={reviewing ? pages.length : index}
                  steps={[...pages.map((entry) => ({ title: entry.title })), { title: 'Check and submit' }]}
                />
              ) : null}
              {saveProblem ? (
                <Notice
                  tone={saveProblem.kind === 'submitted' ? 'info' : 'danger'}
                  role="alert"
                  action={saveProblem.kind === 'conflict'
                    ? <Button size="sm" icon="refresh" onClick={reload}>Reload the form</Button>
                    : saveProblem.kind === 'submitted' && (saveProblem.responseId ?? responseId)
                      ? <ButtonLink size="sm" to={data.paths.formSubmission((saveProblem.responseId ?? responseId)!)}>View the response</ButtonLink> : undefined}
                >
                  {saveProblem.message}
                  {saveProblem.kind === 'conflict' ? ' Reloading shows the saved version; copy anything you typed here first.' : ''}
                </Notice>
              ) : null}

              {/* One renderer for the whole visit: hidden on the review step, never unmounted. */}
              <div hidden={reviewing} className="fm-sheet__body">
                <FormRenderer
                  definition={definition}
                  answers={answers}
                  onChange={change}
                  issues={reviewing ? [] : pageIssues}
                  disabled={!canEdit || submitting}
                  sectionIds={page ? page.sectionIds : []}
                  uploads={adapter}
                  renderKasemText={renderKasemText}
                  renderRecorder={renderRecorder}
                  idPrefix="fm"
                  errorFocusKey={focusKey}
                  headingLevel={2}
                  onUploadingChange={setUploading}
                />
              </div>

              {reviewing ? (
                <div className="fm-review">
                  <h2 className="fm-review__title" tabIndex={-1} ref={reviewHead}>Check your answers before you submit</h2>
                  <p className="ts-hint">Use Edit to change a section. Permissions show the exact wording you are agreeing to.</p>
                  <FormReviewSummary definition={definition} answers={answers} issues={reviewIssues} onEdit={editSection} headingLevel={3} />
                  {problemNotice}
                  {pending ? unconfirmedNotice : null}
                  {problem?.kind === 'uncertain' && !pending ? (
                    <Notice tone="warning" role="alert" title="Your answers were not sent" action={<Button size="sm" variant="primary" busy={submitting} onClick={() => void submit()}>Try again</Button>}>
                      {problem.message}
                    </Notice>
                  ) : null}
                  {consentCount ? <p className="fm-review__consent"><Icon name="shield" />Each permission is a separate choice. Approval of your response does not grant any permission you did not tick.</p> : null}
                </div>
              ) : null}

              <div className="fm-actions">
                <div className="fm-actions__back">
                  {reviewing || index > 0 ? (
                    <Button icon="back" disabled={submitting} onClick={() => goTo(reviewing ? pages.length - 1 : index - 1)}>Back</Button>
                  ) : null}
                </div>
                <div className="fm-actions__main">
                  {allowDrafts && canEdit ? (
                    <Button variant="ghost" icon="cloud" busy={saveView.kind === 'saving'} disabled={submitting || (!dirty && Boolean(responseId))} onClick={() => void save().catch(() => undefined)}>Save draft</Button>
                  ) : null}
                  {reviewing ? (
                    <Button variant="primary" icon="send" busy={submitting} disabled={!canSubmit || uploading > 0} onClick={() => void submit()}>
                      {resubmission ? 'Resubmit' : 'Submit'}
                    </Button>
                  ) : (
                    <Button variant="primary" iconRight="arrow" onClick={nextPage}>{index + 1 < pages.length ? 'Next' : 'Review answers'}</Button>
                  )}
                </div>
              </div>
              {uploading > 0 ? <p className="ts-hint fm-actions__note" role="status">{`Waiting for ${uploading} file${uploading === 1 ? '' : 's'} to finish uploading.`}</p> : null}
              {reviewing && !canSubmit && !pending ? (
                <p className="ts-hint fm-actions__note">{opened.window.open ? 'This response cannot be changed here.' : `${opened.window.message || 'This form is not taking submissions now.'}`}</p>
              ) : null}
            </section>
          </div>

          <aside className="ts-stack ts-stack--md fm-fill__aside" aria-label="About this form">
            <Panel title="About this form" variant="tight">
              <KeyValue
                stacked
                items={[
                  { label: 'Time', value: time, hidden: !time },
                  { label: 'Deadline', value: schedule?.label ?? 'No closing date' },
                  { label: 'Languages', value: <>{languages.join(', ') || 'Any'}{definition.languageContext.note ? <span className="fm-aside__note">{definition.languageContext.note}</span> : null}</> },
                  { label: 'Responses', value: definition.submission.policy === 'once' ? 'One response per contributor' : 'You can send more than one' },
                  { label: 'Drafts', value: allowDrafts ? 'Saved to your account, so you can finish later' : 'Not saved until you submit' },
                  { label: 'Review', value: definition.review.required ? 'Every response is checked by a reviewer' : 'Kept as received, without review' },
                  { label: 'Points', value: `${definition.review.points} points if approved`, hidden: !definition.review.required || !definition.review.points },
                  { label: 'Version', value: `Version ${opened.version}` },
                ]}
              />
            </Panel>
            {consentCount ? (
              <Panel title="Your permissions" variant="tint">
                <p className="ts-hint">This form asks for {consentCount === 1 ? 'one permission' : `${consentCount} permissions`}. Each is a separate choice with its own wording, stored with your response. Approval never grants a permission you did not give.</p>
              </Panel>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
