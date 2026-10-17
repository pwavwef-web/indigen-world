import {
  LABS_REGISTRY,
  type Experiment,
  type LabsMode,
} from "@indigen-world/contracts/labs";

/** Everything Labs knows about the visitor, from one auth source and one bootstrap call. */
export interface LabsViewer {
  /** Firebase has reported the signed-in state at least once. */
  authReady: boolean;
  uid?: string;
  /** The Labs service confirmed availability, invitations and roles. */
  loaded: boolean;
  /** The availability check failed; launches are not confirmed. */
  failed: boolean;
  invited: string[];
  canAdmin: boolean;
}

export type AccessState =
  | "checking"
  | "unconfirmed"
  | "open"
  | "sign-in"
  | "invite-only"
  | "paused"
  | "retired"
  | "graduated";

/** These games save every run server-side, so they always need an account. */
const ACCOUNT_ONLY = new Set(["culture-quest", "word-trail"]);

export const MODE_LABELS: Record<LabsMode, string> = {
  play: "Play",
  learn: "Learn",
  create: "Create",
  contribute: "Contribute",
};
export const MODES = Object.keys(MODE_LABELS) as LabsMode[];

const CATEGORY_MODES: Record<string, LabsMode[]> = {
  Language: ["learn"],
  Creating: ["create"],
  Contributing: ["contribute"],
};

/** A server running an older registry may omit the newer presentation fields. */
export function present(experiment: Experiment): Experiment & {
  summary: string;
  modes: LabsMode[];
} {
  const local = LABS_REGISTRY.find((e) => e.id === experiment.id);
  return {
    ...experiment,
    summary: experiment.summary ?? local?.summary ?? experiment.purpose,
    modes: experiment.modes ??
      local?.modes ??
      CATEGORY_MODES[experiment.category] ?? ["play"],
  };
}

export function requiresAccount(experiment: Experiment) {
  return experiment.access !== "public" || ACCOUNT_ONLY.has(experiment.id);
}

/**
 * The one place that decides whether someone can start an experiment.
 * The server enforces the same rules again; this only keeps the UI honest.
 */
export function accessFor(experiment: Experiment, viewer: LabsViewer): AccessState {
  if (experiment.status === "retired") return "retired";
  if (experiment.status === "graduated") return "graduated";
  if (!experiment.enabled) return "paused";
  if (!viewer.authReady) return "checking";
  if (requiresAccount(experiment) && !viewer.uid) return "sign-in";
  if (
    experiment.access === "invited testers" &&
    !viewer.invited.includes(experiment.id) &&
    !viewer.canAdmin
  )
    return viewer.loaded ? "invite-only" : viewer.failed ? "unconfirmed" : "checking";
  if (!viewer.loaded) return viewer.failed ? "unconfirmed" : "checking";
  return "open";
}

export const STATUS_LABELS: Record<Experiment["status"], string> = {
  prototype: "Prototype",
  alpha: "Alpha",
  beta: "Beta",
  graduated: "Graduated",
  retired: "Retired",
};

/** The badge reflects lifecycle, except that a paused experiment says so plainly. */
export function statusBadge(experiment: Experiment) {
  if (experiment.enabled === false && !["retired", "graduated"].includes(experiment.status))
    return { label: "Paused", tone: "paused" };
  return { label: STATUS_LABELS[experiment.status] ?? experiment.status, tone: experiment.status };
}

/** The verb for the main action, matched to what the experiment is. */
export function actionVerb(experiment: Experiment & { modes: LabsMode[] }, state: AccessState) {
  if (["paused", "retired", "graduated", "invite-only"].includes(state)) return "View details";
  if (state === "sign-in") return "Sign in to start";
  if (experiment.modes.includes("play")) return "Play";
  if (experiment.modes.includes("learn")) return "Start practising";
  if (experiment.modes.includes("create")) return "Start creating";
  return "Try it";
}

/** One short line about who can take part right now. */
export function accessNote(experiment: Experiment, state: AccessState) {
  switch (state) {
    case "checking":
      return "Checking availability…";
    case "unconfirmed":
      return "Availability could not be confirmed";
    case "sign-in":
      return experiment.access === "invited testers"
        ? "Invited testers only · sign in first"
        : "Free Indigen World account required";
    case "invite-only":
      return "Invited testers only";
    case "paused":
      return "Paused · new sessions are closed";
    case "retired":
      return "Retired · saved activity stays available";
    case "graduated":
      return "Graduated from Labs";
    case "open":
      return requiresAccount(experiment) ? "Ready · you're signed in" : "Open to everyone";
  }
}
