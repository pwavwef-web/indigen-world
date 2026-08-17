/**
 * src/pages/index.ts
 *
 * Maps each route path to the component that renders it. App.tsx reads
 * this one lookup table instead of a hand-written switch/if-else chain
 * — adding a page means adding one line here and one line in
 * content/navigation.ts, nothing else.
 */
import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

type LazyPage = LazyExoticComponent<ComponentType>;

export const PAGE_COMPONENTS: Record<string, LazyPage> = {
  home: lazy(() => import("./HomePage").then(({ HomePage }) => ({ default: HomePage }))),
  about: lazy(() => import("./AboutPage").then(({ AboutPage }) => ({ default: AboutPage }))),
  ecosystem: lazy(() =>
    import("./EcosystemPage").then(({ EcosystemPage }) => ({ default: EcosystemPage }))
  ),
  "project-kasena": lazy(() =>
    import("./ProjectKasenaPage").then(({ ProjectKasenaPage }) => ({ default: ProjectKasenaPage }))
  ),
  "impact-governance": lazy(() =>
    import("./ImpactGovernancePage").then(({ ImpactGovernancePage }) => ({
      default: ImpactGovernancePage,
    }))
  ),
  team: lazy(() => import("./TeamPage").then(({ TeamPage }) => ({ default: TeamPage }))),
  "get-involved": lazy(() =>
    import("./GetInvolvedPage").then(({ GetInvolvedPage }) => ({ default: GetInvolvedPage }))
  ),
  contact: lazy(() =>
    import("./ContactPage").then(({ ContactPage }) => ({ default: ContactPage }))
  ),
  privacy: lazy(() =>
    import("./PrivacyPage").then(({ PrivacyPage }) => ({ default: PrivacyPage }))
  ),
  terms: lazy(() => import("./TermsPage").then(({ TermsPage }) => ({ default: TermsPage }))),
};

export { NotFoundPage } from "./NotFoundPage";
