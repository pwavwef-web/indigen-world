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
import { withRouteLoadingTiming } from "../lib/routeLoading";

type LazyPage = LazyExoticComponent<ComponentType>;

export const PAGE_COMPONENTS: Record<string, LazyPage> = {
  home: lazy(() =>
    withRouteLoadingTiming(import("./HomePage")).then(({ HomePage }) => ({ default: HomePage }))
  ),
  about: lazy(() =>
    withRouteLoadingTiming(import("./AboutPage")).then(({ AboutPage }) => ({ default: AboutPage }))
  ),
  ecosystem: lazy(() =>
    withRouteLoadingTiming(import("./EcosystemPage")).then(({ EcosystemPage }) => ({
      default: EcosystemPage,
    }))
  ),
  "project-kasena": lazy(() =>
    withRouteLoadingTiming(import("./ProjectKasenaPage")).then(({ ProjectKasenaPage }) => ({
      default: ProjectKasenaPage,
    }))
  ),
  "impact-governance": lazy(() =>
    withRouteLoadingTiming(import("./ImpactGovernancePage")).then(({ ImpactGovernancePage }) => ({
      default: ImpactGovernancePage,
    }))
  ),
  "get-involved": lazy(() =>
    withRouteLoadingTiming(import("./GetInvolvedPage")).then(({ GetInvolvedPage }) => ({
      default: GetInvolvedPage,
    }))
  ),
  contact: lazy(() =>
    withRouteLoadingTiming(import("./ContactPage")).then(({ ContactPage }) => ({ default: ContactPage }))
  ),
  privacy: lazy(() =>
    withRouteLoadingTiming(import("./PrivacyPage")).then(({ PrivacyPage }) => ({ default: PrivacyPage }))
  ),
  terms: lazy(() =>
    withRouteLoadingTiming(import("./TermsPage")).then(({ TermsPage }) => ({ default: TermsPage }))
  ),
  "ads/payment-complete": lazy(() =>
    withRouteLoadingTiming(import("./AdsPaymentCompletePage")).then(
      ({ AdsPaymentCompletePage }) => ({ default: AdsPaymentCompletePage })
    )
  ),
};

export { NotFoundPage } from "./NotFoundPage";
