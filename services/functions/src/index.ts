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
export {
  requestKasemName,
  decideKasemNameRequest,
} from './kasem-name-requests.js';
export { setCommunityVerifiedKind } from './community-marks.js';
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
  onCommunityProfileWelcome,
} from './community-notifications.js';
export { onReelCommentCreated } from './reel-notifications.js';
export { onChatMessageCreated } from './chat-notifications.js';
export { onSubmissionWritten } from './open-publishing.js';
export {
  submitCollectionContribution,
  withdrawCollectionContribution,
} from './collection-contributions.js';
export {
  nextQueueWords,
  skipQueueWord,
  submitWordTranslation,
  onWordQueueContributionWritten,
} from './word-queue.js';
export {
  awardContributorPoints,
  remindContributorStreaks,
} from './contributor-scores.js';
export {
  publishAdminAudiobook,
  deleteAdminAudiobook,
} from './admin-collection.js';
export {
  submitAdCampaign,
  updateAdCampaign,
  cancelAdCampaign,
  startAdPayment,
  confirmAdPayment,
  paystackWebhook,
  decideAdCampaign,
  recordAdEvent,
  expireAdCampaigns,
} from './ads.js';
export { kawuriChat } from './kawuri.js';
export { onCommunityKawuriMention } from './community-kawuri.js';
export {
  getStudioVideoCapabilities,
  createStudioVideoJob,
  refreshStudioVideoJob,
} from './studio-video.js';
export { startIntegrityCheck, verifyDeviceIntegrity } from './play-integrity.js';
export {
  getSubscriptionOptions,
  preparePlayPurchase,
  registerPlayPurchase,
  refreshSubscription,
  playBillingNotification,
  onCommunityProfileCreated,
  reconcileSubscriptions,
} from './subscriptions.js';
export {
  smsBalance,
  sendTestSms,
  sendSmsCampaign,
  listSmsCampaigns,
  saveSmsContactGroup,
  listSmsContactGroups,
  deleteSmsContactGroup,
} from './messaging-admin.js';
