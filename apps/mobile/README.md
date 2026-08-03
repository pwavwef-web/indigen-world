# Indigen World Mobile

**Product lead:** Andy Anim

Indigen World Mobile is the Flutter application for everyday users.

## Responsibilities

- Explore approved cultural and language content
- Learn through lessons, stories, vocabulary, and challenges
- Contribute through safe, guided workflows
- Save content for later and support offline use
- User profiles, progress, ranks, rewards, and challenge history
- Project Kasena’s Kasem learning, dictionary, translation, and contribution module
- Notifications and low-bandwidth experiences

## Out of scope

- Full creator publishing and validator administration — use `apps/tribestudio`
- Public corporate and partner pages — use `apps/website`
- Trusted reward settlement, moderation, AI, or administrative execution — use `services/functions`
- Secrets or unrestricted production exports

## Expected stack

Flutter and Dart with Firebase Authentication, Firestore, Cloud Storage, App Check, Remote Config, Analytics, and approved notification services. Native platform configuration files containing secrets or environment-specific identifiers must follow the project’s secure configuration process.

## Architecture guidance

Organise by feature rather than by generic technical layer. Shared language-cell interfaces should support Kasem first without preventing future language cells. Offline caches must not include restricted cultural material unless the permissions and device-security model explicitly allow it.
