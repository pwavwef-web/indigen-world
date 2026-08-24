// Type declarations for the aggregate contracts entry point.
// The JSON Schemas under ./schemas remain canonical; these types describe the
// runtime shape of the exports, not the schemas' contents.

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: string[];
  $defs?: Record<string, unknown>;
  [key: string]: unknown;
}

export const common: JsonSchema;
export const community: JsonSchema;
export const language: JsonSchema;
export const dialect: JsonSchema;
export const lexicalEntry: JsonSchema;
export const sentencePair: JsonSchema;
export const consentRecord: JsonSchema;
export const contributor: JsonSchema;
export const validator: JsonSchema;
export const review: JsonSchema;
export const auditLog: JsonSchema;
export const campaign: JsonSchema;
export const creatorProfile: JsonSchema;
export const creatorMembership: JsonSchema;
export const creatorApplication: JsonSchema;
export const submission: JsonSchema;
export const publishedContent: JsonSchema;
export const notification: JsonSchema;
export const platformConfiguration: JsonSchema;

/** Entity schemas keyed by camelCase entity name (excludes shared common definitions). */
export const schemas: Record<string, JsonSchema>;

/** The shared definitions schema plus every entity schema. */
export const allSchemas: JsonSchema[];

/** Enum value lists read from the canonical common schema. */
export const enums: {
  validationStatus: string[];
  consentStatus: string[];
  licence: string[];
  culturalPermissionTier: string[];
  mediaType: string[];
  collectionKind: string[];
  campaignStatus: string[];
  creatorApplicationStatus: string[];
  submissionStatus: string[];
  paymentStatus: string[];
  kasemProficiency: string[];
  contactMethod: string[];
  publicationStatus: string[];
  creatorConsentScope: string[];
};
