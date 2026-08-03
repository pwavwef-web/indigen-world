# TribeStudio

**Product lead:** Chinedum Okwonko Udeaja

TribeStudio is the operational workspace for creators, cultural custodians, language contributors, validators, campaign managers, and authorised administrators.

## Responsibilities

- Creator dashboard and cultural-content workflows
- Language contributions and corrections
- Story, proverb, oral-history, and media submissions
- Validator queues, review notes, approval, rejection, and escalation
- Dialect, source, consent, licence, and cultural-permission metadata
- Campaigns, bounties, rewards, and contributor history
- Analytics and operational reporting
- Role-based administration and audit visibility

## Out of scope

- General public marketing — use `apps/website`
- Everyday consumer learning and exploration — use `apps/mobile`
- Secret-bearing or trusted backend execution — use `services/functions`
- Direct AI provider calls from the browser

## Expected stack

React + TypeScript + Vite, hosted on Firebase Hosting. Firebase Authentication and role-aware Firestore access must be backed by Security Rules and server-side checks for privileged actions.

## Project Kasena

The first language cell in TribeStudio is Kasem through Project Kasena. Its dictionary, sentence, dialect, contribution, validator, gamification, and bounty workflows should be implemented as a reusable language-cell pattern rather than hard-coded as the whole platform.
