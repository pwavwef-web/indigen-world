# Finance centre: project money ledger, monitoring and audit

The admin console's **Finance** section records every amount entering and
leaving Indigen World. It answers: how much was received, from whom, how much
was spent and on what, who recorded and approved each entry, and how much
remains. Contributor points and redemptions stay in the same section under
**Points & rewards**.

## Where things live

| Piece | Path |
|---|---|
| Ledger maths (pure, tested) | `services/functions/src/finance-ledger.ts` |
| Callable, platform logging, daily job | `services/functions/src/finance-centre.ts` |
| Branded PDF reports and transaction records | `services/functions/src/finance-report-pdf.ts` |
| Console screens | `apps/admin/src/finance/MoneyScreens.tsx`, `TransactionPanels.tsx`, `charts.tsx`, `money.ts`, `money.css` |
| Tests | `npm run test:finance` (ledger unit tests plus end-to-end tests against the Auth, Firestore and Storage emulators) |
| Local data for a browser check | `apps/admin/scripts/dev/seed-finance-ui.mjs` (emulators only) |

Deployed functions: `financeCentre` (callable), `onFinanceAdPayment`,
`onFinanceShopTransaction`, `onFinanceRedemption`, `onFinancePayout`
(Firestore triggers) and `financeDailyDigest` (07:00 Africa/Accra).

## Rules the ledger keeps

- **Money is integer pesewas.** It is parsed from text and never handled as a
  float. A foreign-currency payment keeps its original amount and rate. The
  cedi figure is converted exactly with BigInt.
- **The balance is derived, never stored.** It is the sum of entries in
  `posted` or `reversed` status. Drafts, entries pending approval,
  approved-but-unpaid expenses, rejected entries and discarded entries do not
  count.
- **Posted entries are immutable.** *Reverse* adds a linked entry that negates
  the original. *Correct* reverses the original and opens a prefilled draft
  linked to it. Both sides stay in the ledger and the audit trail.
- **Running balances use the full chronological history** (transaction date,
  then posting order). This happens before any filter, sort or page is
  applied, so those can never change a row's balance.
- **Duplicates cannot post by accident.** New entries carry a request key, so
  a retry returns the same entry. If an entry looks like an existing one
  (same type, amount, day and reference or description), recording it needs
  explicit confirmation. An external payment reference can be posted only
  once per account until that entry is reversed.
- **Transfers move money between accounts.** They count as neither income nor
  spending, and the total of all accounts always equals the project balance.
- **Refunds:** money returned to Indigen World reduces spending in its
  category. Money Indigen World returns reduces income.
- **Recurring expenses are reminders only.** They count towards "reserved for
  renewals" but are not spending. Recording the payment posts an expense and
  moves the next due date forward.
- **Budgets warn by default.** A budget refuses spending only when its
  *spending control* is explicitly switched on.
- **Restricted funding.** A funder is charged for spending only when an
  expense is explicitly allocated to that funder's restricted money.

## Who may do what

The server enforces these levels on every call. Every finance collection is
closed to clients in `firestore.rules`, administrators included.

| Level | Claim | Can |
|---|---|---|
| Finance administrator | existing `finance: true` on an admin, or a super administrator | Everything: approve, post, reverse, correct, manage accounts, categories, budgets, settings, viewer and editor access |
| Finance editor | `financeRole: 'editor'` | Record drafts and submit them, upload receipts, manage funding sources and recurring expenses, open reconciliations |
| Finance viewer | `financeRole: 'viewer'` | Read every finance screen, report and document |

Finance administrators grant viewer and editor access under **Finance →
Finance settings**. Only a super administrator can grant or remove finance
administration. *Two-person approval* is an optional setting: when it is on,
an administrator cannot approve their own entries.

## Money the platform logs by itself

Once the platform has confirmed a movement, it is logged once. The ledger
entry's ID comes from the platform record, so it is never logged twice:

| Source | Ledger entry |
|---|---|
| Paystack ad campaign payment (`adCampaigns.payment` paid or underpaid) | Income: Advertising Revenue (the amount actually paid) |
| Verified shop payment / processed refund (`shopTransactions`) | Income: Shop Sales / refund paid |
| Airtime or data redemption recorded as delivered (`contributorRedemptions` fulfilled) | Expense: Contributor Payments |
| Contributor payment request marked paid (`contributorPaymentRequests` paid) | Expense: Contributor Payments |

By default each logged entry **waits for approval**. A finance administrator
checks it against the provider and confirms the account the money is in.
Entries that should not be in the books, such as Paystack test-mode payments,
can be dismissed with a reason. Auto-posting can be switched on per source in
Finance settings once an account is chosen.

The triggers log new events as they happen. The daily job, and the **Check
platform payments now** button, catch up on anything missed. Approved
redemptions and payment requests that are not yet paid appear on the overview
as commitments.

**Not connected:** Google Play membership revenue. Google pays it out monthly,
net of fees, so record the payout as income (Membership Revenue) when it
arrives.

## Receipts and documents

Editors upload into `finance-receipts/{uid}/{uploadId}/` in Storage. Rules
allow finance editors and administrators to create a file once, and no client
can read it back. The callable checks the real file type from the file's
first bytes (PDF, JPEG, PNG or WebP, up to 10 MB) and links it to the entry
or funding source. Opening a document returns a five-minute signed link, and
each opening is audited. If links cannot be signed, files under 7 MB are
returned inline instead.

## Reports

Monthly statement, income and expenditure, transaction history, funding
sources, expense categories, annual summary and audit trail. Each can be
previewed, or downloaded as CSV (formula-safe text cells, plain numeric
amounts) or as a branded PDF. Every entry also has a one-page PDF record with
its details and audit history.

## Daily digest

At 07:00 the daily job runs the platform sync. It then emails the addresses
listed in Finance settings, but only when something needs attention:
approvals, renewals coming due, budget alerts or open reconciliation
differences. The email goes through `sendMail` with the delivery key
`finance-digest:<date>`. A marker document is written before sending, so a
retried run never sends a second email. While the address list is empty, no
email is sent.
