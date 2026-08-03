# Security Policy

## Reporting a vulnerability

Do not publish security vulnerabilities, exposed credentials, personal data, or sensitive cultural records in a public GitHub issue.

Report the problem privately to the project manager or repository administrator. Include the affected component, reproduction steps, impact, and any temporary mitigation already applied.

## Sensitive systems

Indigen World may process contributor identities, phone numbers, school or community affiliations, validation records, reward transactions, consent records, voice recordings, and culturally restricted material. Treat these as sensitive even when they are not conventional authentication secrets.

## Credential rules

- Never commit Firebase service-account files, API keys, private keys, provider tokens, `.env` files, or production exports.
- Client-side Firebase configuration may be public, but security must rely on Firebase Authentication, App Check, Security Rules, least privilege, and server-side authorization.
- Store backend secrets in Firebase Secret Manager or another approved secret store.
- Rotate any credential immediately if it appears in a commit, issue, log, screenshot, or chat transcript.

## Data handling

Use synthetic fixtures for development and tests. Production data must not be copied into local development or GitHub without documented approval, minimisation, and secure handling.

Restricted cultural content must not be published, exported, used for AI training, or exposed to third-party services without the recorded permission required by the community-governance model.

## Supported versions

Until the first production release, only the latest `main` branch is supported. Release-specific support rules should be added when versioned deployments begin.
