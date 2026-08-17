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
};
