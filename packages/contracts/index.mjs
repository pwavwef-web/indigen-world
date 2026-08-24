// Aggregate, importable entry point for the Indigen World contracts.
//
// The JSON Schema files under ./schemas are canonical. Everything exported here
// is derived from them, so there is no separate source of truth to drift.
// Bundler-based consumers (website, TribeStudio) may also import individual
// schema files directly, e.g.
//   import lexicalEntry from '@indigen-world/contracts/schemas/lexical-entry.schema.json';

import common from './schemas/common.schema.json' with { type: 'json' };
import community from './schemas/community.schema.json' with { type: 'json' };
import language from './schemas/language.schema.json' with { type: 'json' };
import dialect from './schemas/dialect.schema.json' with { type: 'json' };
import lexicalEntry from './schemas/lexical-entry.schema.json' with { type: 'json' };
import sentencePair from './schemas/sentence-pair.schema.json' with { type: 'json' };
import consentRecord from './schemas/consent-record.schema.json' with { type: 'json' };
import contributor from './schemas/contributor.schema.json' with { type: 'json' };
import validator from './schemas/validator.schema.json' with { type: 'json' };
import review from './schemas/review.schema.json' with { type: 'json' };
import auditLog from './schemas/audit-log.schema.json' with { type: 'json' };
import campaign from './schemas/campaign.schema.json' with { type: 'json' };
import creatorProfile from './schemas/creator-profile.schema.json' with { type: 'json' };
import creatorMembership from './schemas/creator-membership.schema.json' with { type: 'json' };
import creatorApplication from './schemas/creator-application.schema.json' with { type: 'json' };
import submission from './schemas/submission.schema.json' with { type: 'json' };
import publishedContent from './schemas/published-content.schema.json' with { type: 'json' };
import notification from './schemas/notification.schema.json' with { type: 'json' };
import platformConfiguration from './schemas/platform-configuration.schema.json' with { type: 'json' };

export {
  common,
  community,
  language,
  dialect,
  lexicalEntry,
  sentencePair,
  consentRecord,
  contributor,
  validator,
  review,
  auditLog,
  campaign,
  creatorProfile,
  creatorMembership,
  creatorApplication,
  submission,
  publishedContent,
  notification,
  platformConfiguration,
};

/** All entity schemas keyed by camelCase entity name (excludes the shared common definitions). */
export const schemas = {
  community,
  language,
  dialect,
  lexicalEntry,
  sentencePair,
  consentRecord,
  contributor,
  validator,
  review,
  auditLog,
  campaign,
  creatorProfile,
  creatorMembership,
  creatorApplication,
  submission,
  publishedContent,
  notification,
  platformConfiguration,
};

/** The shared definitions schema, plus every entity schema, for bulk registration with a validator. */
export const allSchemas = [common, ...Object.values(schemas)];

/**
 * Enum value lists, read straight from the canonical common schema so they can
 * never fall out of sync with validation.
 */
const defs = common.$defs;
export const enums = {
  validationStatus: defs.validationStatus.enum,
  consentStatus: defs.consentStatus.enum,
  licence: defs.licence.enum,
  culturalPermissionTier: defs.culturalPermissionTier.enum,
  mediaType: defs.mediaType.enum,
  collectionKind: defs.collectionKind.enum,
  campaignStatus: defs.campaignStatus.enum,
  creatorApplicationStatus: defs.creatorApplicationStatus.enum,
  submissionStatus: defs.submissionStatus.enum,
  paymentStatus: defs.paymentStatus.enum,
  kasemProficiency: defs.kasemProficiency.enum,
  contactMethod: defs.contactMethod.enum,
  publicationStatus: defs.publicationStatus.enum,
  creatorConsentScope: defs.creatorConsentScope.enum,
};
