import { useMemo, useRef, useState } from 'react';
import { FormRenderer, formPages, issuesForSections } from '@indigen-world/console-ui';
import { defaultAnswers, validateAnswers } from '@indigen-world/contracts/forms';
import type { Answers, FormDefinition, Issue } from '@indigen-world/contracts/forms';
import { Button, Notice, Segmented, cx } from '../../ui/primitives';

/* ==========================================================================
   The form as a contributor sees it, drawn by the same renderer and checked
   by the same validateAnswers as the contributor portal. Answers typed here
   stay in this browser tab; uploads are checked but never sent.
   ========================================================================== */

type Device = 'desktop' | 'mobile';

export function Preview({ definition }: { definition: FormDefinition }) {
  const [device, setDevice] = useState<Device>('desktop');
  const [answers, setAnswers] = useState<Answers>(() => defaultAnswers(definition));
  const [page, setPage] = useState(0);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [focusKey, setFocusKey] = useState(0);
  const [checked, setChecked] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const pages = useMemo(() => formPages(definition, answers), [definition, answers]);
  const index = Math.min(page, Math.max(0, pages.length - 1));
  const current = pages[index];
  const paged = definition.presentation === 'paged' && pages.length > 1;
  const last = index >= pages.length - 1;

  const pageIssues = (next: Answers, sectionIds: string[] | null) => {
    const all = validateAnswers(definition, next, { mode: 'submit' }).issues;
    return sectionIds ? issuesForSections(definition, all, sectionIds) : all;
  };
  const goTo = (target: number) => {
    setPage(target);
    setIssues([]);
    window.requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start' }));
  };
  const next = () => {
    const found = pageIssues(answers, current?.sectionIds ?? []);
    if (found.length) { setIssues(found); setFocusKey((value) => value + 1); return; }
    goTo(index + 1);
  };
  const check = () => {
    const found = pageIssues(answers, null);
    setIssues(found);
    setChecked(found.length === 0);
    if (found.length) setFocusKey((value) => value + 1);
  };
  const reset = () => {
    setAnswers(defaultAnswers(definition));
    setIssues([]);
    setChecked(false);
    setPage(0);
  };

  return (
    <div className="afm-preview">
      <div className="afm-preview__bar">
        <Segmented<Device> label="Preview size" value={device} onChange={setDevice}
          options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile (390 px)' }]} />
        <Button size="sm" variant="ghost" icon="undo" onClick={reset}>Reset answers</Button>
      </div>
      <Notice tone="info">This is a preview: nothing you type is saved or sent. Upload questions check the file type and size but do not upload anything. The Kasem character bar and dictionary suggestions appear only in the contributor portal.</Notice>
      <div ref={top} className={cx('afm-device', device === 'mobile' && 'afm-device--mobile')} data-device={device}>
        <div className="afm-device__screen">
          <header className="afm-device__head">
            <h2 className="afm-device__title">{definition.title || 'Untitled form'}</h2>
            {definition.description ? <p>{definition.description}</p> : null}
            {definition.estimatedMinutes ? <p className="ts-hint">About {definition.estimatedMinutes} minutes</p> : null}
            {definition.instructions ? <p className="afm-device__instructions">{definition.instructions}</p> : null}
            {paged && current ? <p className="afm-device__step" aria-live="polite">Page {index + 1} of {pages.length}: {current.title}</p> : null}
          </header>
          {/* One renderer for every page: uploads live in it, so it is never remounted. */}
          <FormRenderer
            definition={definition}
            answers={answers}
            onChange={(value) => {
              setAnswers(value);
              setChecked(false);
              if (issues.length) setIssues(pageIssues(value, paged ? current?.sectionIds ?? [] : null));
            }}
            issues={issues}
            errorFocusKey={focusKey}
            mode="preview"
            sectionIds={paged ? current?.sectionIds : undefined}
            idPrefix="afm-preview"
            headingLevel={3}
          />
          {checked ? (
            <Notice tone="success" title="All answers pass the form’s rules">
              {definition.submission.successMessage}{definition.submission.nextSteps ? ` ${definition.submission.nextSteps}` : ''}
            </Notice>
          ) : null}
          <div className="afm-device__actions">
            {paged && index > 0 ? <Button icon="back" onClick={() => goTo(index - 1)}>Back</Button> : null}
            {paged && !last ? <Button variant="primary" iconRight="arrow" onClick={next}>Next</Button> : null}
            {!paged || last ? <Button variant="primary" onClick={check}>Check answers</Button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
