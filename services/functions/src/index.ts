import { initializeApp } from 'firebase-admin/app';

// Initialise the Admin SDK once for all functions in this codebase.
initializeApp();

export { decideReview } from './validation.js';
export { setUserRole } from './identity.js';
export {
  startPhoneVerification,
  confirmPhoneVerification,
} from './phone-verification.js';
export { claimKasemHandle } from './kasem-handle.js';
export { publicForms } from './public-forms.js';
export {
  submitCreatorApplication,
  decideCreatorApplication,
  decideSubmission,
} from './creators.js';
export { onNotificationCreated } from './notifications.js';
export {
  onCommunityLikeCreated,
  onCommunityRepostCreated,
  onCommunityFollowCreated,
  onCommunityPostCreated,
  onCommunityPollVoteCreated,
  onCommunityNotificationCreated,
} from './community-notifications.js';
export { onChatMessageCreated } from './chat-notifications.js';
export { onSubmissionWritten } from './open-publishing.js';
export {
  submitCollectionContribution,
  withdrawCollectionContribution,
} from './collection-contributions.js';
export {
  submitAdCampaign,
  updateAdCampaign,
  cancelAdCampaign,
  startAdPayment,
  confirmAdPayment,
  paystackWebhook,
  decideAdCampaign,
} from './ads.js';
export { kawuriChat } from './kawuri.js';
export { onCommunityKawuriMention } from './community-kawuri.js';
export {
  smsBalance,
  sendTestSms,
  sendSmsCampaign,
  listSmsCampaigns,
  saveSmsContactGroup,
  listSmsContactGroups,
  deleteSmsContactGroup,
} from './messaging-admin.js';
