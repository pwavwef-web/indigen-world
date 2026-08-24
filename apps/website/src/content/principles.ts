/**
 * src/content/principles.ts
 *
 * Governance principles — used on the Impact & Governance page.
 * Content is carried over from the uploaded template's `principles`
 * array, unchanged: it already matches the brief's emphasis on
 * consent, attribution, dialect respect and community authority.
 */
import type { Principle } from "../lib/types";

export const PRINCIPLES: Principle[] = [
  {
    number: "01",
    title: "Community before platform",
    body: "Elders, teachers, creators and language custodians are decision-makers—not anonymous data suppliers.",
  },
  {
    number: "02",
    title: "Consent travels with content",
    body: "Source, contributor, dialect, validation, consent, licence and cultural-permission metadata stay attached to relevant records.",
  },
  {
    number: "03",
    title: "Useful under real conditions",
    body: "Low-bandwidth, mobile-first and offline-friendly experiences are built for the communities they intend to serve.",
  },
  {
    number: "04",
    title: "One language deeply, then scale",
    body: "Venacula is designed to test the language-cell model with Kasem before any expansion into additional language communities.",
  },
];

export const PERMISSION_RULES = [
  {
    title: "Validated lexical material",
    body: "Words and phrases may be published only after validation and publication permission are confirmed.",
  },
  {
    title: "Cultural expressions and stories",
    body: "Context, ownership, audience and reuse permissions must be assessed separately from language accuracy.",
  },
  {
    title: "Audio and voice",
    body: "Recording consent does not automatically grant permission for public release, model training or synthetic voice use.",
  },
  {
    title: "Restricted knowledge",
    body: "Sacred, private or culturally restricted material remains restricted even when someone submits it.",
  },
] as const;
