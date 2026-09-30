# Daily contributor tasks

Status: **Deployed September 26, 2026 from 31d6937. Blogger draft; not published.**

| Field | Value |
|---|---|
| Title | Fifteen tasks first, fifteen more when you are ready |
| Labels | Contributors, TribeStudio, Kasem, Feature |
| Search description | Daily contributor batches start with 15 tasks, with one extra set after submission, remembered list position and clearer review dates. |
| Custom permalink | daily-contributor-tasks |
| Cover | images/cover.png |
| Article | post.html |
| Sharing copy | share.md |

## Admin setup

- Open Invite & assign or Assign expressions. Daily batch mode is selected by default.
- Supply exactly 30 distinct English expressions (maximum 180 characters each). The first 15 are the initial batch; the last 15 are reserved.
- Existing contributors: choose today or a future UTC date. Invitations start today.
- One prepared batch per contributor/date. Identical retries are safe; replacing an existing daily plan is rejected.
- Reserve expressions are stored in contributorDailyPlans, outside contributor-readable assignment trees. Default-deny rules prevent direct client access. Only the authenticated callable can release extra work.
- Legacy/manual assignments remain available separately. The limit controls daily-batch allocation; it does not discard or block completion of older assignments.
- Future first batches are released on visiting Home or Tasks on their date. No automated prompt generation or scheduled background assignment job is used.

## Verification

- Backend tests cover the first 15, private reserve, submission eligibility, repeat/concurrent requests, admin-only preparation, UTC boundaries, inactive accounts and reuse of invitation tasks.
- Browser preview exercised fifteenth-task submission, automatic extra-task unlock and filter/search restoration.
- See repository tests for exact assertions. Production authenticated verification remains pending.

## Deployment and publishing handoff

1. Deploy TribeStudio, Admin, saveExpressionAnswer and the three daily-task callables: prepareContributorDailyTasks, getContributorDailyTasks and requestMoreContributorTasks. No historical task migration is performed.
2. Prepare and verify a daily batch with authorized test accounts. Update article availability based on release evidence.
3. Paste post.html into Blogger with the metadata above. Upload images/cover.png and replace REPLACE-WITH-UPLOADED-cover.png. Keep the alt text. The screenshot uses sample preview data.
4. Preview desktop/mobile. Chinedum publishes and replaces the URL placeholder in share.md before sharing.

## Confirmed deployment — September 26, 2026

- Code pushed to main at 31d6937. TribeStudio and Admin hosting releases completed.
- saveExpressionAnswer and reportContributorIssue updated; prepareContributorDailyTasks, getContributorDailyTasks and requestMoreContributorTasks created successfully.
- Both live sites returned HTTP 200 with asset filenames matching the new builds. All three daily-task endpoints returned HTTP 401 UNAUTHENTICATED without credentials.
- Before release: 54 backend tests and 47 frontend tests passed; preview submission/unlock and list restoration checked.
- A signed-in production daily-batch flow has not been exercised. No real contributor tasks were created for verification. Admins must prepare daily batches before contributors receive them.
