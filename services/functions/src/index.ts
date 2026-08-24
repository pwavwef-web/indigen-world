import { initializeApp } from 'firebase-admin/app';

// Initialise the Admin SDK once for all functions in this codebase.
initializeApp();

export { decideReview } from './validation.js';
export { setUserRole } from './identity.js';
export { publicForms } from './public-forms.js';
export {
  submitCreatorApplication,
  decideCreatorApplication,
  decideSubmission,
} from './creators.js';
export { onNotificationCreated } from './notifications.js';
export {
  onCommunityLikeCreated,
  onCommunityFollowCreated,
  onCommunityPostCreated,
  onCommunityNotificationCreated,
} from './community-notifications.js';
export { onSubmissionWritten } from './open-publishing.js';
export { kawuriChat } from './kawuri.js';
export {
  smsBalance,
  sendTestSms,
  sendSmsCampaign,
  listSmsCampaigns,
  saveSmsContactGroup,
  listSmsContactGroups,
  deleteSmsContactGroup,
} from './messaging-admin.js';
