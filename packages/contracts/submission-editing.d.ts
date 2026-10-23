export interface SubmissionEditField { path: string; label: string; maxLength: number; required: boolean }
export const EDITABLE_SUBMISSION_STATUSES: string[];
export function submissionEditFields(submission: Record<string, any>): SubmissionEditField[];
export function submissionEditValue(submission: Record<string, any>, path: string): string;
export function applySubmissionEdits(submission: Record<string, any>, edits: unknown): { submission: Record<string, any>; changed: Record<string, string>; before: Record<string, string> };
