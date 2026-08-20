import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase';

/**
 * Privacy-conscious product event tracking. Names mirror the measurement plan in
 * docs. Never pass personal data as event params — slugs, counts and states only.
 */
export type CreatorEvent =
  | 'creator_landing_viewed'
  | 'signup_started'
  | 'signup_step_completed'
  | 'signup_completed'
  | 'profile_completed'
  | 'whatsapp_cta_clicked'
  | 'campaign_viewed'
  | 'submission_started'
  | 'submission_completed'
  | 'revision_submitted';

export function trackEvent(event: CreatorEvent, params: Record<string, string | number> = {}): void {
  try {
    if (analytics) logEvent(analytics, event, params);
  } catch {
    // Analytics is best-effort and must never break the UI.
  }
}
