# Community Data and Cultural Safety

## Non-negotiable rule

The repository must not become a storage location for raw community data. GitHub contains code, schemas, synthetic fixtures, migration logic, approved public samples, and governance documentation only.

## Never commit

- Contributor phone numbers, payment details, school records, or private identities
- Consent forms or release documents containing personal information
- Production Firestore or Authentication exports
- Raw, private, disputed, sacred, or unapproved cultural records
- Unreleased stories, proverbs, oral histories, rituals, symbols, or community knowledge
- Voice recordings or biometric-like voice datasets
- Service-account files, provider credentials, API keys, private keys, or production environment files
- Unredacted incident reports, audit exports, or moderation evidence

## Required content metadata

Relevant language and cultural records should preserve:

- community and language
- dialect or regional variant
- source and attribution
- contributor reference
- validation status and validator reference
- consent status
- licence and permitted uses
- cultural-permission tier
- publication eligibility
- AI-training eligibility
- version, timestamps, and audit references

Missing permission data must be treated as **not permitted**, not as permission by silence.

## Cultural-permission tiers

1. **Open lexical data** — common words, phrases, and non-sensitive examples approved for the stated uses.
2. **Restricted cultural expressions** — proverbs, stories, oral histories, songs, symbols, ceremonies, and contextual knowledge requiring additional community approval.
3. **Sacred, sensitive, or non-public material** — must not be published or used for model training and should not be collected without a documented lawful and cultural reason.

## Development data

Use synthetic records with fictional people, communities, contact details, and reward transactions. Approved public samples must be clearly labelled and must not imply broader licensing rights.

## AI usage

No private, personal, restricted, or unapproved content may be sent to an external AI provider. Model output does not replace linguistic or cultural validation. Dataset eligibility for publication, research, retrieval, fine-tuning, evaluation, ASR, or TTS must be recorded separately.
