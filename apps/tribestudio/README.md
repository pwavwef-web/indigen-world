# TribeStudio

**Product lead:** Chinedum Okwonko Udeaja

TribeStudio is the operational workspace for creators, cultural custodians, language contributors, validators, and campaign participants. Platform administration, moderation, reward settlement and audit inspection live in the separate `apps/admin` console.

## Responsibilities

- Creator dashboard and cultural-content workflows
- Language contributions and corrections
- Story, proverb, oral-history, and media submissions
- Validator queues, review notes, approval, rejection, and escalation
- Dialect, source, consent, licence, and cultural-permission metadata
- Campaign and bounty participation and contributor history

## Out of scope

- General public marketing — use `apps/website`
- Everyday consumer learning and exploration — use `apps/mobile`
- Platform administration, role assignment, moderation and audit — use `apps/admin`
- Secret-bearing or trusted backend execution — use `services/functions`
- Direct AI provider calls from the browser

## Stack

React + TypeScript + Vite, hosted on Firebase Hosting (site: `tribestudio`) in the shared `project-kassena-7e026` project. It consumes `@indigen-world/contracts` for shared data shapes and enums, and Firebase Authentication with role-aware Firestore access backed by Security Rules. Privileged transitions (validation decisions) call the `decideReview` Cloud Function in `services/functions`.

## MVP scope (Phase 3)

The current build is the first end-to-end vertical for the Kasem language cell:

- Google sign-in; role read from the `role` custom claim.
- Contributors create Kasem lexical entries as drafts and submit them for review (writing to `lexicalEntries`, enforced by Security Rules).
- Validators work a queue of submitted entries and approve / reject / request changes via the trusted `decideReview` function, which records a review and an audit entry.

## Local development

```bash
npm run dev --workspace @indigen-world/tribestudio
# Against local emulators (auth/firestore/functions):
VITE_USE_EMULATORS=true npm run dev --workspace @indigen-world/tribestudio
npm run build:tribestudio     # from the repo root
```

## Deploy

```bash
firebase deploy --only hosting:tribestudio
```

## Project Kasena

The first language cell in TribeStudio is Kasem through Project Kasena. Its dictionary, sentence, dialect, contribution and validator workflows should be implemented as a reusable language-cell pattern rather than hard-coded as the whole platform.
