import { createContext, useContext, type ReactNode } from 'react';
import type { AnswerValue, AttachmentRef, Visibility } from '@indigen-world/contracts/forms';
import type { IssueIndex } from './model';
import type { FormRecorderProps, KasemTextProps } from './types';

export interface Transfer {
  id: string;
  /** 'fieldId' for a top-level question, 'groupId:entryKey:subId' inside a repeatable group. */
  slot: string;
  /** The upload question's id, as the adapter and the server know it. */
  fieldId: string;
  file: File;
  progress: number;
  status: 'uploading' | 'failed';
  error: string | null;
}

export interface UploadManager {
  transfers: Transfer[];
  /** Latest status line per slot, for a polite live region. */
  notices: Record<string, string>;
  /** An adapter is present (fill mode). */
  available: boolean;
  canOpen: boolean;
  start(slot: string, fieldId: string, file: File): void;
  cancel(id: string): void;
  retry(id: string): void;
  dismiss(id: string): void;
  removeAttachment(attachment: AttachmentRef): void;
  open(slot: string, attachment: AttachmentRef): void;
  notify(slot: string, message: string): void;
}

export interface RendererContextValue {
  prefix: string;
  mode: 'fill' | 'preview';
  disabled: boolean;
  visibility: Visibility;
  issues: IssueIndex;
  headingLevel: 2 | 3;
  renderKasemText?: (props: KasemTextProps) => ReactNode;
  renderRecorder?: (props: FormRecorderProps) => ReactNode;
  uploads: UploadManager;
  setAnswer(fieldId: string, value: AnswerValue): void;
  /** Stable React keys for the entries of a repeatable group, so moved entries keep their state and uploads. */
  groupKeys(groupId: string, length: number): string[];
  newKey(): string;
  /**
   * Change a repeatable group against the latest answers. `entries` and `keys`
   * are padded to the entries on screen and may be changed in place.
   */
  mutateGroup(groupId: string, floor: number, change: (entries: Array<Record<string, AnswerValue>>, keys: string[]) => void): void;
}

export const RendererContext = createContext<RendererContextValue | null>(null);

export function useRenderer(): RendererContextValue {
  const value = useContext(RendererContext);
  if (!value) throw new Error('Form questions must be rendered inside FormRenderer.');
  return value;
}

/** Move focus to a question: the element itself when it is a control, otherwise its primary control. */
export function focusTarget(element: HTMLElement | null): void {
  if (!element) return;
  const focusable = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  const control = element.matches('input, select, textarea, button, a[href], [tabindex]')
    ? element
    : element.querySelector<HTMLElement>('[data-iwf-primary]:not([disabled])') ?? element.querySelector<HTMLElement>(focusable);
  (control ?? element).focus({ preventScroll: true });
  element.scrollIntoView?.({ block: 'center' });
}
