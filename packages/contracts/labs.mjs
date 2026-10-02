/** Public registry; lifecycle, access and availability are independent. */
export const LABS_REGISTRY = [
  {
    id: "culture-quest", slug: "culture-quest", name: "Culture Quest",
    purpose: "Play a small expedition. Help living culture grow.",
    category: "Contributing", status: "alpha", access: "signed-in",
    enabled: true, version: "0.1.0", updatedAt: "2026-10-01",
    instructions: "Explore three source cards each UTC day. Add a usage note or flag a correction with evidence, or skip anything you do not know. Earn expedition XP for submitted missions.",
    limitations: "Submissions enter the Labs review queue and do not change published sources. XP is game progress, not verified contributor points, money or a claim of language expertise. One submission per source per day; no rewards for skipping.",
    destination: "/contribute", destinationLabel: "Explore other contributions",
    feedbackTypes: ["bug", "language issue", "usability", "suggestion", "positive feedback"],
  },
  {
    id: "kasem-practice",
    slug: "kasem-practice",
    name: "Kasem Practice Lab",
    purpose: "A little practice. A closer connection.",
    category: "Language",
    status: "alpha",
    access: "signed-in",
    enabled: true,
    version: "0.1.0",
    updatedAt: "2026-09-30",
    instructions:
      "Choose a topic and try up to six questions. Read the source after each answer. Report anything that needs a speaker’s review.",
    limitations:
      "Only unambiguous reviewed entries are used. Listening requires a reviewed recording. Scores describe this practice session, not fluency.",
    destination: "/dictionary",
    destinationLabel: "Explore the dictionary",
    feedbackTypes: [
      "bug",
      "language issue",
      "usability",
      "suggestion",
      "positive feedback",
    ],
  },
  {
    id: "cultural-story",
    slug: "cultural-story",
    name: "Cultural Story Builder",
    purpose: "Start with a source. Make it your own.",
    category: "Creating",
    status: "alpha",
    access: "signed-in",
    enabled: true,
    version: "0.1.0",
    updatedAt: "2026-09-30",
    instructions:
      "Choose reviewed material, an audience and a format. Shape the creative section, keep the source notes, then save or export your private draft.",
    limitations:
      "Creative additions are not reviewed cultural facts. Source text stays separate and unchanged. Automatic assistance requires the Labs Vertex setting and is never a language verification service.",
    destination: "https://tribestudio.indigenworld.com/studio/submissions/new",
    destinationLabel: "Continue in TribeStudio",
    feedbackTypes: [
      "bug",
      "language issue",
      "usability",
      "suggestion",
      "positive feedback",
    ],
  },
];
