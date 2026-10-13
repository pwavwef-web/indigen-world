export interface ContributorDetails {
  variety: string; speaker: string; listener: string; situation: string; register: string;
  literalMeaning: string; variantNote: string; uncertainty: string; alternativeNotes: string[];
}
export const EMPTY_DETAILS: Readonly<ContributorDetails>;
export const UNCERTAINTY_REASONS: readonly string[];
export const VARIANT_LABELS: readonly string[];
export function parseContributorDetails(value: unknown): ContributorDetails;
export function detailsContext(details: ContributorDetails, context?: string): string;
export function contributionTextKey(text: string): string;
