// Sample receipts for "Your expressions". The Kasem is a labelled
// placeholder: this preview never invents Kasem.
const now = Date.now();
const day = 86_400_000;

const receipts = [
  {
    id: 'sample-1', status: 'submitted', createdAt: new Date(now - day).toISOString(), publicationPermission: true,
    expression: {
      phrase: '[Sample expression 1]', meaning: 'Welcome back from your journey.',
      context: 'Said by the household to a relative arriving home.', kind: 'phrase', dialect: 'Navrongo',
      source: { type: 'family', detail: 'My grandmother' },
    },
  },
  {
    id: 'sample-2', status: 'published', createdAt: new Date(now - 6 * day).toISOString(), publicationPermission: true,
    expression: {
      phrase: '[Sample expression 2]', meaning: 'Thank you for the meal.',
      context: 'Said to the person who cooked, after eating.', kind: 'phrase', dialect: 'Paga',
      source: { type: 'self', detail: 'I say it at home.' },
    },
  },
  {
    id: 'sample-3', status: 'rejected', createdAt: new Date(now - 9 * day).toISOString(), publicationPermission: true,
    reviewFeedback: 'The second word is usually written differently in Navrongo. Could you check it with the person you learned it from?',
    expression: {
      phrase: '[Sample expression 3]', meaning: 'Sleep well.',
      context: 'Said to children at bedtime.', kind: 'phrase', dialect: 'Navrongo',
      source: { type: 'elder', detail: 'An elder in my compound' },
    },
  },
];

export const collection = () => ({});
export const query = () => ({});
export const where = () => ({});
export const limit = () => ({});

export async function getDocs() {
  return {
    docs: receipts.map((receipt) => ({
      id: receipt.id,
      data: () => ({ authUid: 'preview', collectionKind: 'expressions', ...receipt }),
    })),
  };
}
