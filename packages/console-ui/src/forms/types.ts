import type { ReactNode } from 'react';
import type { Answers, AttachmentRef, ConsentRecord, FormDefinition, FormField, Issue } from '@indigen-world/contracts/forms';

/**
 * How the renderer stores files. The renderer checks format, size and count
 * against the question before it calls `upload`, and never calls the adapter
 * in preview mode.
 */
export interface FormUploadAdapter {
  /** Upload one file for an upload question; report progress 0..1; resolve to the stored attachment. Throw an Error with a readable message to show it. */
  upload(input: { fieldId: string; file: File; onProgress(fraction: number): void; signal: AbortSignal }): Promise<AttachmentRef>;
  /**
   * Optional: release an upload the contributor removed from an answer. The
   * removal may not be saved yet, so the store must keep a file that saved
   * answers or a submitted revision still list, and delete it only once
   * nothing saved uses it.
   */
  remove?(attachment: AttachmentRef): Promise<void>;
  /** Optional: open a short-lived download link for an attachment. */
  open?(attachment: AttachmentRef): Promise<void>;
}

export interface KasemTextProps {
  field: FormField;
  id: string;
  /** Exactly what the contributor typed. Hand it back unchanged: no trimming or normalisation. */
  value: string;
  onChange(value: string): void;
  multiline: boolean;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  placeholder?: string;
  /**
   * The question's limit, for display. The renderer already shows a counter
   * and the contract reports an over-long answer; avoid the native
   * `maxlength` attribute, which truncates pastes and can split a tone mark
   * from its letter.
   */
  maxLength?: number;
  dictionarySuggestions: boolean;
  kasemKeyboard: boolean;
  /** Whether the question is required now (for `aria-required`). */
  required?: boolean;
}

export interface FormRecorderProps {
  field: FormField;
  disabled: boolean;
  onRecorded(file: File): void;
}

export interface FormRendererProps {
  definition: FormDefinition;
  answers: Answers;
  onChange(next: Answers): void;
  /** Issues to show inline, by path: 'fieldId', 'groupId.2.subId', 'fieldId.0' (attachment). Unknown paths go to a top summary. */
  issues?: Issue[];
  disabled?: boolean;
  /** 'preview' (admin builder): editable, but uploads show a note and never call the adapter. */
  mode?: 'fill' | 'preview';
  /** Render only these section ids (paged mode = the current page). Default: every visible section. */
  sectionIds?: string[];
  uploads?: FormUploadAdapter;
  /** For short_text/long_text with settings.kasemKeyboard or dictionarySuggestions. Without it, a plain input/textarea is used. */
  renderKasemText?(props: KasemTextProps): ReactNode;
  /** For audio questions with settings.allowRecording: an in-browser recorder that hands back a File, which the renderer then uploads like a chosen file. */
  renderRecorder?(props: FormRecorderProps): ReactNode;
  idPrefix?: string;
  /**
   * Optional. Change this value on every failed Next/Submit to move focus to
   * the error summary again. Focus also moves there whenever issues appear
   * after there were none.
   */
  errorFocusKey?: string | number;
  /** Optional. Heading level of section titles and the error summary (default 2); headings inside sections use the next level. */
  headingLevel?: 2 | 3;
  /** Optional. Hide section titles and descriptions, for a page that already shows them. */
  hideSectionTitles?: boolean;
  /** Optional. Called with the number of uploads in progress whenever it changes (to hold Save/Submit until they finish). */
  onUploadingChange?(count: number): void;
}

export interface FormResponseViewProps {
  definition: FormDefinition;
  answers: Answers;
  consents?: ConsentRecord[];
  /** Called when a reviewer/contributor asks to open an attachment. */
  onOpenAttachment?(attachment: AttachmentRef & { fieldId: string }): void;
  /** Show questions without an answer as "No answer" (default true). */
  showEmpty?: boolean;
  /** Optional: answers of an earlier revision to mark changed questions. */
  compareWith?: Answers | null;
  /** Optional. Heading level of section titles (default 3). */
  headingLevel?: 2 | 3 | 4;
}

export interface FormReviewSummaryProps {
  definition: FormDefinition;
  answers: Answers;
  onEdit(sectionId: string): void;
  issues?: Issue[];
  /** Optional. Heading level of section titles (default 3). */
  headingLevel?: 2 | 3 | 4;
}

export interface FormPage {
  id: string;
  title: string;
  sectionIds: string[];
}
