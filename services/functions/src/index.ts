import { initializeApp } from 'firebase-admin/app';

// Initialise the Admin SDK once for all functions in this codebase.
initializeApp();

export {
  activateExpressionContributor,
  inviteExpressionContributor,
  assignContributorExpressions,
  listExpressionContributors,
  saveContributorProfile,
  setContributorAccess,
  resendContributorInvitation,
  cancelContributorInvitation,
  saveExpressionAnswer,
  getContributorPayments,
  saveContributorPayoutProfile,
  requestContributorPayment,
  setContributorRewardSettings,
  listContributorPayments,
  verifyContributorPayoutProfile,
  decideContributorPaymentRequest,
  onContributorExpressionReviewed,
} from './contributor-portal.js';

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
export { fetchLinkPreview } from './link-preview.js';
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
  findDictionaryEntryMatches,
  previewDictionaryMerge,
  editDictionaryEntry,
  mergeDictionaryEntries,
  deleteDictionaryEntry,
} from './dictionary-admin.js';
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
export {
  getKawuriCapabilities,
  createKawuriImage,
  createKawuriVideo,
  getKawuriTask,
  cancelKawuriTask,
  transcribeKawuriAudio,
  analyseKawuriMedia,
  listKawuriCreations,
  deleteKawuriCreation,
  sweepKawuriTasks,
} from './kawuri-media.js';
export { submitGrammarClaim, decideGrammarClaim } from './kasem-claims.js';
export { reviewContributionDraft } from './contribution-assist.js';
export {
  submitGrammarNote,
  rateKawuriAnswer,
  decideGrammarNote,
  reviseGrammarNote,
  withdrawGrammarNote,
  grammarQualityReport,
  readGrammarAudio,
} from './grammar-contributions.js';
export { onCommunityKawuriMention } from './community-kawuri.js';
export { generateLearnIllustration, reviewLearnIllustration } from './learn-illustrations.js';
export { submitPronunciationRecording, decidePronunciationRecording } from './pronunciation-recordings.js';
export {
  getStudioVideoCapabilities,
  createStudioVideoJob,
  refreshStudioVideoJob,
  getStudioVideoPlaybackUrl,
  sweepStudioVideoJobs,
} from './studio-video.js';
export { startIntegrityCheck, verifyDeviceIntegrity } from './play-integrity.js';
export {
  startRestoreKeyRegistration,
  finishRestoreKeyRegistration,
  startRestoreSignIn,
  finishRestoreSignIn,
  forgetRestoreKey,
} from './restore-credentials.js';
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
export { reportContributorIssue, getContributorIssues, listContributorIssues, updateContributorIssue } from './contributor-portal.js';
