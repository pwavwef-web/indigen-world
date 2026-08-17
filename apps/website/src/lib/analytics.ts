/**
 * Privacy-safe analytics vocabulary for the public site.
 *
 * Never pass names, email addresses, phone numbers, form messages, cultural
 * submissions, or internal identifiers as event properties. Analytics loads
 * only when VITE_ANALYTICS_ENABLED=true and Firebase measurement config exists.
 */
export const ANALYTICS_EVENTS = {
  pageView: "site_page_view",
  primaryCtaClick: "primary_cta_click",
  ecosystemProductClick: "ecosystem_product_click",
  getInvolvedFormStart: "get_involved_form_start",
  formSubmissionSuccess: "form_submission_success",
  formSubmissionFailure: "form_submission_failure",
  newsletterOptIn: "newsletter_opt_in",
  outboundProductLink: "outbound_product_link",
  languageProjectPageView: "language_project_page_view",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
type AnalyticsProperty = string | number | boolean;
type AnalyticsProperties = Record<string, AnalyticsProperty>;

type AnalyticsRuntime = {
  analytics: import("firebase/analytics").Analytics;
  logEvent: typeof import("firebase/analytics").logEvent;
};

let analyticsRuntime: Promise<AnalyticsRuntime | null> | null = null;

async function loadAnalytics(): Promise<AnalyticsRuntime | null> {
  if (
    import.meta.env.VITE_ANALYTICS_ENABLED !== "true" ||
    !import.meta.env.VITE_FIREBASE_API_KEY ||
    !import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    !import.meta.env.VITE_FIREBASE_APP_ID ||
    !import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  ) {
    return null;
  }

  const [appModule, analyticsModule] = await Promise.all([
    import("firebase/app"),
    import("firebase/analytics"),
  ]);

  if (!(await analyticsModule.isSupported())) return null;

  const app = appModule.getApps().length
    ? appModule.getApp()
    : appModule.initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
      });

  return {
    analytics: analyticsModule.getAnalytics(app),
    logEvent: analyticsModule.logEvent,
  };
}

export function trackEvent(name: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  analyticsRuntime ??= loadAnalytics();
  void analyticsRuntime
    .then((runtime) => {
      if (runtime) runtime.logEvent(runtime.analytics, name, properties);
    })
    .catch(() => {
      // Analytics must never interrupt a visitor journey.
    });
}
