# Indigen World Website

**Product lead:** Francis Onai

The public website is Indigen World’s outward-facing information, storytelling, impact, partnership, and support platform.

## Current implementation

This folder contains a production-ready React + TypeScript + Vite public website with:

- responsive, accessible marketing pages and navigation;
- ecosystem positioning for the website, TribeStudio and mobile app;
- a Project Kasena flagship-programme section and illustrative translation interface;
- cultural-governance principles and clearly labelled MVP targets;
- team, partnership and contact sections;
- Firebase Hosting-compatible static output in `dist/`.

The first release intentionally uses original vector/CSS artwork instead of unapproved cultural photography. Public stories, images and language records should only be added after their source, consent, licence, validation and cultural-permission status are confirmed.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run preview
```

## Deployment

The repository-level `firebase.json` already maps the `website` hosting target to `apps/website/dist`.

```bash
npm run build
firebase deploy --only hosting:website
```

A local `.firebaserc` is required to map the hosting target to the correct Firebase project and site. Do not commit production project identifiers or secrets unless the repository governance rules explicitly permit them.

## Product boundaries

- Creator and validator operations belong in `apps/tribestudio`.
- Everyday learning and saved-content journeys belong in `apps/mobile`.
- Trusted reward, moderation, notification, and AI execution belong in `services/functions`.
- Provider credentials and direct model calls must never be added to this client.

## Project Kasena

Project Kasena appears here as Indigen World’s flagship Kasem-language programme, not as a competing umbrella platform. The translation preview is illustrative; final public Kasem entries require qualified linguistic validation.
