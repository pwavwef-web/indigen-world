// Every callable "succeeds" locally; nothing is sent anywhere.
export function httpsCallable() {
  return async () => ({ data: { contributionId: 'preview-new', submissionId: 'preview-new' } });
}
