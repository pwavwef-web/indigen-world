# AI Infrastructure

This directory contains the provider-independent AI layer for Indigen World. It is infrastructure, not a claim that production language models are already trained or active.

## Responsibilities

- Model-provider adapters
- Prompt and system-instruction templates
- Structured input and output schemas
- Safety, consent, cultural-permission, and domain-risk checks
- Evaluation datasets made from approved or synthetic material
- Model and prompt version records
- Cost, latency, quality, and failure monitoring definitions
- Future translation, retrieval, ASR, and TTS integration interfaces

## Boundaries

- User-facing applications must not call model providers directly.
- Provider credentials must remain server-side.
- Restricted cultural expressions, private audio, personal data, and unapproved corpus material must not be sent to third-party models.
- Model output is never equivalent to elder, teacher, linguist, or cultural-custodian validation.
- Health, legal, civic, and other high-impact translations require specialised review and clear disclaimers.

## Project Kassena

Project Kassena supplies the first approved language-cell requirements and evaluation framework for Kasem. Kasem-specific assets should remain distinguishable from reusable platform logic and must preserve dialect and validation metadata.

Suggested subdirectories when implementation begins:

```text
services/ai/
├── adapters/
├── prompts/
├── schemas/
├── evaluations/
├── policies/
└── observability/
```
