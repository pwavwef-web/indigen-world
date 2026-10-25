import { useId, useState, type ReactNode } from 'react';
import {
  AUDIENCE_CONTRIBUTION_TYPES,
  CONSENT_PURPOSES,
  DESTINATIONS,
  FIELD_TYPES,
  FORM_CATEGORIES,
  FORM_DIALECTS,
  FORM_LANGUAGES,
  FORM_LIMITS,
  REVIEWER_GROUPS,
  audienceText,
  slugId,
  topLevelFields,
} from '@indigen-world/contracts/forms';
import type { DestinationType, FormDefinition, Issue, ReviewCheck, ReviewerGroup } from '@indigen-world/contracts/forms';
import type { Cohort, FormSummary, FormsAccess, VersionMeta } from '@indigen-world/contracts/forms-api';
import { Link } from '../../router';
import { Icon } from '../../ui/icons';
import { Badge, Button, Field, IconButton, Notice } from '../../ui/primitives';
import { VERSION_STATE_LABEL, VERSION_STATE_TONE, dateOnly, dateTime, fromLocalInput, timeZoneName, toLocalInput } from '../format';
import type { SettingsTab } from '../model';
import { CheckList, ChoiceCards, NumberInput, Switch, TabPanel, Tabs } from '../ui';
import type { Apply } from './types';

/* ==========================================================================
   Everything about the form that is not a question: details, presentation,
   schedule, submission, audience, review and points, destination mapping,
   and versions. Each tab writes straight into the draft definition; Save
   draft stores it.
   ========================================================================== */

export const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'submission', label: 'Submission' },
  { id: 'audience', label: 'Audience' },
  { id: 'review', label: 'Review and points' },
  { id: 'destination', label: 'Destination' },
  { id: 'versions', label: 'Versions' },
];

interface Props {
  definition: FormDefinition;
  readOnly: boolean;
  apply: Apply;
  issues: Issue[];
  issueCounts: Map<SettingsTab, number>;
  access: FormsAccess | null;
  cohorts: Cohort[];
  form: FormSummary;
  versions: VersionMeta[];
  onRetire: (version: number) => void;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
}

const text = (value: string | undefined | null, max: number) => `${(value ?? '').length.toLocaleString('en-GB')} / ${max.toLocaleString('en-GB')}`;

export function FormSettings(props: Props) {
  const { tab, onTab, issueCounts } = props;
  const idPrefix = 'afm-settings';
  return (
    <div className="afm-form-settings">
      <Tabs label="Form settings" idPrefix={idPrefix} value={tab} onChange={onTab} vertical className="afm-form-settings__tabs"
        tabs={SETTINGS_TABS.map((item) => ({
          id: item.id,
          label: item.label,
          badge: issueCounts.get(item.id) ? <Badge tone="warning">{issueCounts.get(item.id)}</Badge> : undefined,
        }))} />
      <TabPanel idPrefix={idPrefix} id={tab} className="afm-form-settings__panel">
        <SettingsBody {...props} />
      </TabPanel>
    </div>
  );
}

function SettingsBody({ definition, readOnly, apply, issues, access, cohorts, form, versions, onRetire, tab }: Props) {
  const set = (patch: Partial<FormDefinition>) => apply({ ...definition, ...patch });
  const errorFor = (...paths: string[]) => {
    const messages = issues.filter((issue) => paths.some((path) => issue.path === path || issue.path.startsWith(`${path}.`))).map((issue) => issue.message);
    return messages.length ? [...new Set(messages)].join(' ') : undefined;
  };
  if (tab === 'details') {
    const language = definition.languageContext;
    return (
      <SettingsSection readOnly={readOnly} title="Details" intro="What contributors see at the top of the form and in the list of forms.">
        <Field label="Title" required error={errorFor('title')} counter={text(definition.title, FORM_LIMITS.maxTitle)}>
          <input className="ts-input" data-focus-key="settings-title" value={definition.title} onChange={(event) => set({ title: event.target.value })} />
        </Field>
        <Field label="Short description" optional hint="One or two sentences shown in the list of forms." error={errorFor('description')} counter={text(definition.description, 2000)}>
          <textarea className="ts-textarea" rows={2} value={definition.description} onChange={(event) => set({ description: event.target.value })} />
        </Field>
        <div className="afm-grid-2">
          <Field label="Category" error={errorFor('category')}>
            <select className="ts-select" value={definition.category} onChange={(event) => set({ category: event.target.value })}>
              {FORM_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Estimated minutes" optional hint="1 to 600." error={errorFor('estimatedMinutes')}>
            <NumberInput integer value={definition.estimatedMinutes} onValue={(value) => set({ estimatedMinutes: value })} />
          </Field>
        </div>
        <Field label="Instructions" optional hint="Shown before the first question." error={errorFor('instructions')} counter={text(definition.instructions, FORM_LIMITS.maxText)}>
          <textarea className="ts-textarea" rows={4} value={definition.instructions} onChange={(event) => set({ instructions: event.target.value })} />
        </Field>
        <h3 className="afm-h3">Language context</h3>
        <CheckList legend="Languages used in the answers" options={FORM_LANGUAGES} value={language.languageIds} disabled={readOnly} columns
          onChange={(next) => set({ languageContext: { ...language, languageIds: next } })} />
        <CheckList legend="Kasem varieties this form is about" hint="Leave all unticked if any variety is welcome." options={FORM_DIALECTS} value={language.dialectIds} disabled={readOnly} columns
          onChange={(next) => set({ languageContext: { ...language, dialectIds: next } })} />
        <Field label="Language note" optional hint="For example “Answers are in Kasem with English meanings.”" error={errorFor('languageContext')} counter={text(language.note, 500)}>
          <input className="ts-input" value={language.note} onChange={(event) => set({ languageContext: { ...language, note: event.target.value } })} />
        </Field>
      </SettingsSection>
    );
  }

  if (tab === 'presentation') {
    return (
      <SettingsSection readOnly={readOnly} title="Presentation">
        <ChoiceCards legend="How the questions are laid out" name="afm-presentation" value={definition.presentation} disabled={readOnly}
          onChange={(value) => set({ presentation: value })}
          options={[
            { value: 'single_page', label: 'All on one page', hint: 'Best for short forms. Sections appear one under another.' },
            { value: 'paged', label: 'One page per section', hint: 'Contributors move through the sections with Next and Back, and check their answers before sending.' },
          ]} />
      </SettingsSection>
    );
  }

  if (tab === 'schedule') {
    const schedule = definition.schedule;
    return (
      <SettingsSection readOnly={readOnly} title="Schedule" intro={`Times are in ${timeZoneName()}. Leave both empty to accept responses from publishing until you close the form.`}>
        <TabProblems issues={issues} paths={['schedule']} />
        <div className="afm-grid-2">
          <Field label="Opens" optional hint="Before this, contributors see that it is not open yet." error={errorFor('schedule.opensAt')}>
            <input className="ts-input" type="datetime-local" value={toLocalInput(schedule.opensAt)} onChange={(event) => set({ schedule: { ...schedule, opensAt: fromLocalInput(event.target.value) } })} />
          </Field>
          <Field label="Closes" optional hint="After this, no new responses are accepted. Drafts are kept." error={errorFor('schedule.closesAt')}>
            <input className="ts-input" type="datetime-local" value={toLocalInput(schedule.closesAt)} onChange={(event) => set({ schedule: { ...schedule, closesAt: fromLocalInput(event.target.value) } })} />
          </Field>
        </div>
        {(schedule.opensAt || schedule.closesAt) && !readOnly ? <Button size="sm" variant="ghost" icon="close" onClick={() => set({ schedule: { opensAt: null, closesAt: null } })}>Clear both dates</Button> : null}
        <p className="ts-hint">{schedule.opensAt ? `Opens ${dateTime(schedule.opensAt)}` : 'Opens when published'} · {schedule.closesAt ? `closes ${dateTime(schedule.closesAt)}` : 'no closing date'}.</p>
      </SettingsSection>
    );
  }

  if (tab === 'submission') {
    const submission = definition.submission;
    const patch = (value: Partial<FormDefinition['submission']>) => set({ submission: { ...submission, ...value } });
    return (
      <SettingsSection readOnly={readOnly} title="Submission">
        <TabProblems issues={issues} paths={['submission']} />
        <ChoiceCards legend="Responses per contributor" name="afm-policy" value={submission.policy} disabled={readOnly} onChange={(value) => patch({ policy: value })}
          options={[
            { value: 'multiple', label: 'Several responses', hint: 'For collections: one word, recording or story per response.' },
            { value: 'once', label: 'One response', hint: 'For surveys and sign-ups. They can still correct it when a reviewer asks for changes.' },
          ]} />
        <Switch label="Allow saving a draft" hint="Contributors can save and come back before sending." checked={submission.allowDrafts} disabled={readOnly} onChange={(checked) => patch({ allowDrafts: checked })} />
        <Switch label="Allow attachments" hint="Needed for any upload question." checked={submission.allowAttachments} disabled={readOnly} onChange={(checked) => patch({ allowAttachments: checked })} />
        <Field label="Message after sending" error={errorFor('submission.successMessage')} counter={text(submission.successMessage, 1000)}>
          <textarea className="ts-textarea" rows={2} value={submission.successMessage} onChange={(event) => patch({ successMessage: event.target.value })} />
        </Field>
        <Field label="What happens next" optional hint="For example how long review takes and how they will hear back." error={errorFor('submission.nextSteps')} counter={text(submission.nextSteps, 2000)}>
          <textarea className="ts-textarea" rows={3} value={submission.nextSteps} onChange={(event) => patch({ nextSteps: event.target.value })} />
        </Field>
      </SettingsSection>
    );
  }

  if (tab === 'audience') {
    const audience = definition.audience;
    const patch = (value: Partial<FormDefinition['audience']>) => set({ audience: { ...audience, ...value } });
    const cohortNames = Object.fromEntries(cohorts.map((cohort) => [cohort.id, cohort.name]));
    const missing = audience.cohortIds.filter((id) => !cohortNames[id]);
    return (
      <SettingsSection readOnly={readOnly} title="Audience" intro="Only active contributors can open forms. A direct link does not get anyone else in.">
        <TabProblems issues={issues} paths={['audience']} />
        <ChoiceCards legend="Who can see and fill this form" name="afm-audience" value={audience.mode} disabled={readOnly} onChange={(value) => patch({ mode: value })}
          options={[
            { value: 'all_contributors', label: 'All contributors', hint: 'Every active contributor sees it.' },
            { value: 'groups', label: 'Chosen groups', hint: 'Contributors who match at least one of the groups ticked below.' },
          ]} />
        {audience.mode === 'groups' ? (
          <>
            <CheckList legend="Speakers of these Kasem varieties" hint="From the variety on the contributor’s profile." options={FORM_DIALECTS} value={audience.dialectIds} disabled={readOnly} columns
              onChange={(next) => patch({ dialectIds: next })} />
            <CheckList legend="Contributors who chose these contribution types" hint="From the contributor’s profile." options={AUDIENCE_CONTRIBUTION_TYPES} value={audience.contributionTypes} disabled={readOnly} columns
              onChange={(next) => patch({ contributionTypes: next })} />
            {cohorts.length ? (
              <CheckList legend="Cohorts" hint={<>Named groups of contributors, managed in <Link to="/forms/settings" className="ts-link">Forms settings</Link>.</>}
                options={cohorts.map((cohort) => ({ id: cohort.id, label: cohort.name, hint: `${cohort.memberCount} ${cohort.memberCount === 1 ? 'member' : 'members'}` }))}
                value={audience.cohortIds} disabled={readOnly} onChange={(next) => patch({ cohortIds: [...next, ...missing] })} />
            ) : <p className="ts-hint">No cohorts yet. Create one in <Link to="/forms/settings" className="ts-link">Forms settings</Link> to target a named list of contributors.</p>}
            {missing.length ? <Notice tone="warning">This form names {missing.length === 1 ? 'a cohort that no longer exists' : `${missing.length} cohorts that no longer exist`} ({missing.join(', ')}). Publishing will be refused until it is removed.
              {!readOnly ? <Button size="sm" variant="ghost" onClick={() => patch({ cohortIds: audience.cohortIds.filter((id) => cohortNames[id]) })}>Remove {missing.length === 1 ? 'it' : 'them'}</Button> : null}</Notice> : null}
          </>
        ) : null}
        <p className="afm-summary-line"><Icon name="users" /> {audienceText(audience, cohortNames)}</p>
      </SettingsSection>
    );
  }

  if (tab === 'review') {
    const review = definition.review;
    const patch = (value: Partial<FormDefinition['review']>) => set({ review: { ...review, ...value } });
    const rewards = access?.rewards;
    const cap = Math.min(FORM_LIMITS.maxPoints, rewards?.maxPointsPerResponse ?? FORM_LIMITS.maxPoints);
    return (
      <SettingsSection readOnly={readOnly} title="Review and points">
        <TabProblems issues={issues} paths={['review']} />
        <Switch label="Review every response" hint="Reviewers approve, reject or ask for changes. Without review, responses are kept as received, earn no points and are never sent to a destination." checked={review.required} disabled={readOnly} onChange={(checked) => patch({ required: checked })} />
        {review.required ? (
          <>
            <ChoiceCards legend="Who reviews" hint="Administrators can review in every group. Nobody reviews their own response." name="afm-reviewers" value={review.reviewerGroup} disabled={readOnly}
              onChange={(value) => patch({ reviewerGroup: value as ReviewerGroup })}
              options={(Object.entries(REVIEWER_GROUPS) as Array<[ReviewerGroup, { label: string; description: string }]>).map(([id, item]) => ({ value: id, label: item.label, hint: item.description }))} />
            <Field label="Instructions for reviewers" optional error={errorFor('review.instructions')} counter={text(review.instructions, 3000)}>
              <textarea className="ts-textarea" rows={3} value={review.instructions} onChange={(event) => patch({ instructions: event.target.value })} />
            </Field>
            <ChecksEditor checks={review.checks} readOnly={readOnly} onChange={(checks) => patch({ checks })} error={errorFor('review.checks')} />
            <Field label="Points on approval" hint={`0 to ${cap}. 0 means no points.`} error={errorFor('review.points')}>
              <NumberInput integer value={review.points} onValue={(value) => patch({ points: value ?? 0 })} />
            </Field>
            <Notice tone="info" icon="award">
              Points go through the existing contributor points ledger, once per response, when a reviewer approves it, never twice for the same response.
              {rewards ? <> Finance limits form points to {rewards.maxPointsPerResponse} per response and {rewards.dailyCap} per contributor per day.{rewards.enabled ? '' : ' Finance has switched form points off, so approvals currently award nothing.'}</> : null}
              {review.points > cap ? <strong> This form asks for more than the limit; publishing will be refused.</strong> : null}
            </Notice>
          </>
        ) : null}
      </SettingsSection>
    );
  }

  if (tab === 'destination') {
    const destination = definition.destination;
    const info = DESTINATIONS[destination.type];
    const inputs = topLevelFields(definition).map((entry) => entry.field).filter((field) => FIELD_TYPES[field.type]?.collects);
    const consentPurposes = new Set(inputs.filter((field) => field.type === 'consent').map((field) => field.settings?.consentPurpose));
    return (
      <SettingsSection readOnly={readOnly} title="Destination" intro="Where an approved response goes. Nothing is ever published automatically: the created record waits in that workflow’s own review queue.">
        <TabProblems issues={issues} paths={['destination']} />
        <ChoiceCards legend="Send approved responses to" name="afm-destination" value={destination.type} disabled={readOnly}
          onChange={(value) => set({ destination: { type: value as DestinationType, mapping: {} } })}
          options={(Object.entries(DESTINATIONS) as Array<[DestinationType, (typeof DESTINATIONS)[DestinationType]]>).map(([id, item]) => ({ value: id, label: item.label, hint: item.description }))} />
        <Notice tone="neutral" icon="info" title="On approval">{info.effect}</Notice>
        {info.slots.length ? (
          <div className="afm-stack">
            <h3 className="afm-h3">Which question fills each field</h3>
            <p className="ts-hint">Each list offers only questions whose answers fit. Nothing is matched by name: choose every mapping yourself.</p>
            <div className="afm-mapping">
              {info.slots.map((slot) => {
                const compatible = inputs.filter((field) => slot.accepts.includes(field.type));
                const current = destination.mapping[slot.id] ?? '';
                const known = !current || compatible.some((field) => field.id === current);
                return (
                  <Field key={slot.id} label={slot.label} required={slot.required} optional={!slot.required}
                    hint={`Accepts ${slot.accepts.map((type) => FIELD_TYPES[type].label.toLowerCase()).join(', ')} questions.`}
                    error={errorFor(`destination.mapping.${slot.id}`)}>
                    <select className="ts-select" value={current}
                      onChange={(event) => {
                        const mapping = { ...destination.mapping };
                        if (event.target.value) mapping[slot.id] = event.target.value; else delete mapping[slot.id];
                        set({ destination: { ...destination, mapping } });
                      }}>
                      <option value="">{compatible.length ? 'Not mapped' : 'No question of a fitting type'}</option>
                      {!known ? <option value={current}>{current} (missing or not compatible)</option> : null}
                      {compatible.map((field) => <option key={field.id} value={field.id}>{field.label || field.id} ({field.id})</option>)}
                    </select>
                  </Field>
                );
              })}
            </div>
          </div>
        ) : null}
        {info.requiredConsents.length ? (
          <div className="afm-stack-sm">
            <h3 className="afm-h3">Consents a response needs before it is sent</h3>
            <ul className="afm-consent-needs">
              {info.requiredConsents.map((purpose) => (
                <li key={purpose}>
                  <Icon name={consentPurposes.has(purpose) ? 'check-circle' : 'alert'} className={consentPurposes.has(purpose) ? 'afm-ok' : 'afm-warn'} />
                  <span><strong>{CONSENT_PURPOSES[purpose].label}</strong> — {consentPurposes.has(purpose) ? 'this form asks for it.' : 'add a consent question for it before publishing.'}</span>
                </li>
              ))}
            </ul>
            <p className="ts-hint">A response whose contributor did not grant these is approved but not sent; the response shows why.</p>
          </div>
        ) : null}
      </SettingsSection>
    );
  }

  // Versions
  return (
    <div className="afm-stack">
      <h2 className="afm-h2">Versions</h2>
      <p className="ts-hint">Contributors who started a draft on an older version keep that version. They can submit it while the form is open and the version is not retired; retiring it makes them start again on the current version. Submitted responses always keep their original questions.</p>
      {versions.length ? (
        <ol className="afm-versions">
          {[...versions].sort((a, b) => b.version - a.version).map((version) => {
            const isCurrent = form.currentVersion === version.version;
            return (
              <li key={version.version} className="afm-version">
                <div className="afm-version__head">
                  <strong>Version {version.version}</strong>
                  <Badge tone={VERSION_STATE_TONE[version.state]}>{VERSION_STATE_LABEL[version.state]}</Badge>
                  {isCurrent ? <Badge tone="accent">Live</Badge> : null}
                </div>
                <p className="ts-hint">
                  Created {dateOnly(version.createdAt)}
                  {version.publishedAt ? ` · published ${dateTime(version.publishedAt)}` : ''}
                  {version.retiredAt ? ` · retired ${dateTime(version.retiredAt)}` : ''}
                  {` · ${version.responses} ${version.responses === 1 ? 'response' : 'responses'}`}
                </p>
                {version.state === 'published' && !isCurrent && access?.canManage ? (
                  <Button size="sm" variant="danger-ghost" icon="archive" onClick={() => onRetire(version.version)}>Retire version {version.version}</Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="ts-hint">No versions yet.</p>}
    </div>
  );
}

/* Defined once, outside the settings body, so typing never remounts the inputs inside them. */
function TabProblems({ issues, paths }: { issues: Issue[]; paths: string[] }) {
  const list = issues.filter((issue) => paths.some((path) => issue.path === path || issue.path.startsWith(`${path}.`)));
  return list.length ? <Notice tone="warning" title="To fix before publishing"><ul className="afm-issue-lines">{list.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></Notice> : null;
}

function SettingsSection({ title, intro, readOnly, children }: { title: string; intro?: ReactNode; readOnly: boolean; children: ReactNode }) {
  const id = `afm-settings-heading-${useId().replace(/:/g, '')}`;
  return (
    <fieldset className="afm-fieldset afm-stack" disabled={readOnly} aria-labelledby={id}>
      <h2 id={id} className="afm-h2">{title}</h2>
      {intro ? <p className="ts-hint">{intro}</p> : null}
      {children}
    </fieldset>
  );
}

function ChecksEditor({ checks, readOnly, onChange, error }: { checks: ReviewCheck[]; readOnly: boolean; onChange: (checks: ReviewCheck[]) => void; error?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    // The id is made once from the first wording and kept when the wording changes.
    onChange([...checks, { id: slugId(draft, 'check', checks.map((check) => check.id)), label: draft }]);
    setDraft('');
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= checks.length) return;
    const next = [...checks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <fieldset className="afm-fieldset" disabled={readOnly}>
      <legend className="ts-label">Checks before approving</legend>
      <p className="ts-hint">A reviewer must tick every check to approve. Up to {FORM_LIMITS.maxChecks}.</p>
      {checks.length ? (
        <ol className="afm-options">
          {checks.map((check, index) => (
            <li key={check.id} className="afm-option">
              <div className="afm-option__main">
                <label className="sr-only" htmlFor={`check-${check.id}`}>Check {index + 1}</label>
                <input id={`check-${check.id}`} className="ts-input ts-input--sm" value={check.label} onChange={(event) => onChange(checks.map((item) => (item.id === check.id ? { ...item, label: event.target.value } : item)))} />
              </div>
              <div className="afm-option__tools">
                <IconButton icon="up" size="sm" label={`Move check ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton icon="down" size="sm" label={`Move check ${index + 1} down`} disabled={index === checks.length - 1} onClick={() => move(index, 1)} />
                <IconButton icon="trash" size="sm" label={`Remove check ${index + 1}`} onClick={() => onChange(checks.filter((item) => item.id !== check.id))} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {checks.length < FORM_LIMITS.maxChecks ? (
        <div className="afm-add-row">
          <label className="sr-only" htmlFor="afm-new-check">New check</label>
          <input id="afm-new-check" className="ts-input ts-input--sm" value={draft} placeholder="For example “Spelling and tone marks checked”" onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
          <Button size="sm" icon="plus" disabled={!draft.trim()} onClick={add}>Add check</Button>
        </div>
      ) : null}
      {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : null}
    </fieldset>
  );
}
