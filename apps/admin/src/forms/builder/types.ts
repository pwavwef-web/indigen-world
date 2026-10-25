import type { FieldType, FormDefinition, Issue } from '@indigen-world/contracts/forms';
import type { Cohort, FormsAccess } from '@indigen-world/contracts/forms-api';

/** What the builder has selected on its canvas. A sub-question's id selects it inside its group. */
export interface Selection {
  fieldId: string | null;
  sectionId: string | null;
}

export interface ApplyOptions {
  select?: Selection;
  /** `data-focus-key` of the element to focus after the change renders. */
  focus?: string;
  /** Sentence for screen readers ("Moved Kasem word up"). */
  announce?: string;
}

/** Replace the draft definition (one undoable edit), optionally moving selection and focus. */
export type Apply = (next: FormDefinition, options?: ApplyOptions) => void;

export interface BuilderContext {
  definition: FormDefinition;
  readOnly: boolean;
  apply: Apply;
  /** Answer keys that exist in a published (or retired) version, with their question type. */
  publishedTypes: Map<string, FieldType>;
  access: FormsAccess | null;
  cohorts: Cohort[];
  issues: Issue[];
}
