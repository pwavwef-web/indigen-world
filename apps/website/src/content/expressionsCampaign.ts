/**
 * src/content/expressionsCampaign.ts
 *
 * The one campaign anybody can join today: everyday Kasem expressions.
 *
 * Every claim here is about how the flow actually works — the form in
 * TribeStudio (apps/tribestudio/src/creator/pages/ExpressionsPage.tsx), the
 * `submitExpression` callable and the review desk — so the page never promises
 * more than the product does. No Kasem examples are hard-coded: a phrase shown
 * on this site has passed review and comes from `expressionEntries`.
 */
import { STUDIO_EXPRESSIONS_URL } from "./creatorLinks";

export const CAMPAIGN_CTA_URL = STUDIO_EXPRESSIONS_URL;

/** The facts a visitor weighs before starting. */
export const CAMPAIGN_FACTS = [
  { label: "Status", value: "Open now" },
  { label: "Time", value: "About 5 minutes per expression" },
  { label: "Account", value: "Free Google sign-in" },
  { label: "Payment", value: "None — volunteer campaign" },
] as const;

/** The task: one expression, and the five things sent with it. */
export const TASK_STEPS = [
  {
    title: "The expression, in Kasem",
    body: "Write it the way you say it. If you are unsure of the spelling, write it your way — the reviewer can suggest one. Say whether it is an everyday phrase, an idiom or a proverb.",
  },
  {
    title: "What it means",
    body: "The meaning in English — what a speaker intends, not word for word. You can add a word-for-word reading too, which helps with idioms.",
  },
  {
    title: "When it is used",
    body: "Who says it, to whom, and on what occasion, plus the dialect. An expression without its situation is a phrase nobody can use.",
  },
  {
    title: "Who you learned it from",
    body: "Yourself, a family member, an elder, someone in your community, a book or a recording — and where. Name the speaker only if they agree to be named.",
  },
  {
    title: "Consent",
    body: "Confirm that the person you learned it from agreed to share it, that it is nothing sacred or private, and choose whether it may be published after review.",
  },
] as const;

export const GOOD_TO_SEND = [
  "Greetings for different times of day",
  "Thanks, blessings and condolences",
  "Things said at home, in the market or at a gathering",
  "Idioms and sayings you grew up with",
] as const;

export const PLEASE_DO_NOT_SEND = [
  "Sacred, secret or restricted knowledge",
  "Private family matters, or anything you were asked not to share",
  "Single words — the dictionary desk gives those a full entry",
  "Long stories — share those as writing in TribeStudio",
] as const;

/**
 * What happens after sending, in the words the contributor sees in
 * TribeStudio. The labels match EXPRESSION_STATUS in expressions-data.ts.
 */
export const REVIEW_STEPS = [
  {
    status: "Waiting for review",
    title: "You send it",
    body: "It is private: only you and the review team can see it. It appears straight away in your list in TribeStudio.",
  },
  {
    status: "With a specialist reviewer",
    title: "A Kasem speaker reviews it",
    body: "A reviewer checks the spelling, the meaning and the context. Some expressions go to an elder, a teacher or a rights reviewer for a second look.",
  },
  {
    status: "Published",
    title: "Approved expressions are published",
    body: "Whole, with the meaning, the situation and the source, and credited to you. If you chose review only, it is approved and kept for the archive instead.",
  },
  {
    status: "Not accepted",
    title: "Or the reviewer tells you why",
    body: "You see the reviewer's reason next to the expression, and you can correct it and send it again.",
  },
] as const;

export const CAMPAIGN_FAQS = [
  {
    question: "Why do I need to sign in?",
    answer:
      "Your account is how you see an expression's review status, read the reviewer's answer and withdraw it if you change your mind. TribeStudio uses a free Google sign-in. You can browse this site and the dictionary without an account.",
  },
  {
    question: "Will my expression become a dictionary word?",
    answer:
      "No. An approved expression is published as an expression, whole, with its meaning, context and source. It is never split into dictionary words. Single words have their own place in the dictionary desk.",
  },
  {
    question: "Is there payment or a prize?",
    answer: "No. This is a volunteer campaign. Approved expressions are credited to you by your studio name.",
  },
  {
    question: "Will it be used to train AI?",
    answer:
      "Only if you tick a separate, optional box. It is off unless you choose it, and leaving it off changes nothing about the review.",
  },
  {
    question: "Can I take it back?",
    answer:
      "Yes. You can withdraw an expression at any time from TribeStudio, including after it is published. Withdrawing takes it out of the review queue and off public pages.",
  },
  {
    question: "I only speak a little Kasem. Can I still help?",
    answer:
      "Yes — send expressions you are confident about, and say who you learned them from. The review is there to catch mistakes, and a reviewer's note is how everyone learns.",
  },
] as const;
