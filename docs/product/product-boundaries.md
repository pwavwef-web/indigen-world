# Product Boundaries

## Source-of-truth statement

Indigen World is the umbrella cultural-technology ecosystem. It delivers three user-facing products: the Indigen World public website, TribeStudio for creators and cultural custodians, and the Indigen World mobile app for everyday users. An internal Indigen World Admin console supports platform administration and governance and is not offered to the public. A shared Firebase and AI infrastructure supports the ecosystem. Project Kassena is Indigen World’s flagship Kasem-language programme and the first implementation of its language-preservation model.

## Indigen World Website

Primary audience: public visitors, partners, funders, institutions, researchers, supporters, media, and community members seeking official information.

Owns:

- Brand narrative and ecosystem overview
- Programmes and community pages
- Public stories and approved cultural content
- Impact, updates, partnerships, support, and contact
- Public governance and cultural-data statements

Does not own creator production workflows, validator queues, detailed administration, or full mobile learning journeys.

## TribeStudio

Primary audience: creators, contributors, cultural custodians, validators, and campaign participants.

Owns:

- Creator and contributor workspaces
- Language and cultural-content submission
- Validation, review, approval, rejection, and escalation of content (the day-to-day validator queues)
- Campaign and bounty participation and contributor history
- Content classification, and capture of consent, licensing, and cultural-permission metadata

Does not own platform administration, role assignment, moderation of reported content, reward settlement, or audit inspection — those belong to the Indigen World Admin console. It is not the public marketing site or the everyday consumer app.

## Indigen World Admin (internal)

Primary audience: platform administrators, operations staff, and authorised governance roles. This is an internal console, not a public product; it is `noindex` and must not be discoverable or offered to end users.

Owns:

- Role and access administration (assigning and auditing role claims)
- Validation oversight across language cells — queue health, escalations, and quality (not individual content review, which happens in TribeStudio)
- Moderation of reported content and enforcement of consent and cultural-permission policy
- Campaign, bounty, and reward-integrity oversight and settlement approval
- Audit and accountability (inspecting the append-only audit log)
- Operational reporting and approved, permission-safe exports

Does not replace TribeStudio’s creation and review workflows, and does not perform trusted execution itself — privileged mutations run in `services/functions` with role, validation, and audit enforcement.

## Indigen World Mobile

Primary audience: everyday users, students, families, diaspora users, cultural learners, and community contributors.

Owns:

- Explore, Learn, Contribute, Saved, and Profile journeys
- Lessons, vocabulary, stories, challenges, progress, ranks, and rewards
- Offline-friendly use
- Language-cell modules beginning with Kasem

It may offer simplified contribution flows but does not replace TribeStudio’s professional validator tools or the Indigen World Admin console.

## Shared Firebase and AI infrastructure

Owns trusted execution and shared capabilities:

- Identity, role claims, data access, storage, hosting, Remote Config, App Check, Functions, and notifications
- Shared contracts, audit logs, reward integrity, moderation, exports, and reporting
- AI provider adapters, safety gates, evaluations, and future model integration

AI infrastructure is not evidence that a production Kasem model is active. Product copy must distinguish prototypes, third-party model assistance, retrieval systems, and genuinely trained language models.

### DigitalOcean API boundary

A bounded custom API may run on DigitalOcean for long-lived HTTP APIs, AI/provider orchestration, media processing, webhooks, and assigned background work. It extends rather than replaces Firebase authority: clients retain Firebase identity, existing governed records remain authoritative in Firestore, and custom API mutations must apply the same role, consent, cultural-permission, validation, and audit rules as Firebase Functions. See [ADR 0002](../decisions/0002-adopt-firebase-authority-with-digitalocean-api.md).

## Project Kassena

Project Kassena is the flagship Kasem-language programme. It supplies the first language cell and preserves the strongest existing requirements:

- Kasem dictionary and translation utility
- Word and sentence contributions
- Dialect metadata
- Elder and teacher validation
- Cultural-content permissions and consent
- Contributor points, bounties, and review transparency
- Future text and voice AI readiness

Project Kassena does not replace the Indigen World umbrella brand, and Indigen World does not erase Kasem-specific ownership, validation, linguistic, or cultural-governance requirements.
