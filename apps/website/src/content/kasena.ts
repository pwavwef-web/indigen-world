/**
 * src/content/kasena.ts
 *
 * Content specific to Project Kassena and Impact & Governance
 * pages: the honestly-labelled MVP impact targets, the three-phase
 * roadmap, and the flagship feature list. Carried over from the
 * uploaded template's inline JSX, now separated as data.
 *
 * The public dictionary now has its own route; this file keeps the
 * programme-level summary and the roadmap for translation work.
 */

/** MVP targets — the brief's "target/planned" labelling rule made
 *  structural: every entry pairs a number with what it's a target
 *  *for*, and the page copy that renders this list always frames it
 *  as ambition rather than results (see ImpactGovernancePage.tsx). */
export const IMPACT_TARGETS = [
  { figure: "20,000+", label: "validated Kasem words, phrases and sentence pairs targeted" },
  { figure: "200–500", label: "active youth contributors targeted for the first large data campaign" },
  { figure: "3–4", label: "elder and teacher validators for the initial quality network" },
  { figure: "1 model", label: "a reusable language-cell model tested thoroughly with Kasem before expansion" },
] as const;

export const ROADMAP_PHASES = [
  {
    phase: "Phase 1",
    title: "Dictionary & data engine",
    body: "Validated words, phrases, dialect metadata and contributor workflows.",
  },
  {
    phase: "Phase 2",
    title: "Text intelligence",
    body: "Domain corpora, conversational data and controlled language services.",
  },
  {
    phase: "Phase 3",
    title: "Voice & multimodal",
    body: "Consent-based audio, speech recognition and text-to-speech research.",
  },
] as const;

export const KASENA_POINTS = [
  "Community-published Kasem dictionary, with translation tooling planned",
  "Youth contribution and expert validation workflow",
  "Dialect-aware records and cultural permissions",
  "Future text AI and voice-data readiness",
] as const;

export const KASENA_STEWARDSHIP_STEPS = [
  {
    title: "Tag dialect and source",
    body: "Every candidate entry carries its dialect, source context and contributor record rather than being flattened into one anonymous form.",
  },
  {
    title: "Validate with qualified custodians",
    body: "Elders, teachers and other approved validators review accuracy, usage and cultural context before publication.",
  },
  {
    title: "Keep attribution and consent attached",
    body: "Contributor attribution, consent, licence and cultural permissions stay connected to the material they govern.",
  },
] as const;

/** What visitors can use in the published dictionary today, alongside
 *  the contribution and validation workflow that maintains it. */
export const MODULE_PREVIEW_POINTS = [
  "Kasem and English word lookup",
  "Dialect metadata attached to every validated entry",
  "Contributor suggestions routed to qualified validators",
  "Pronunciation, examples and cultural context where published",
] as const;
