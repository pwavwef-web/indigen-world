# Indigen Forms: a guide for administrators

Indigen Forms lets an administrator collect contributions with a form
instead of a code change. You build the form in the admin console, choose who
sees it, publish it, and review the responses. Contributors fill it in the
contributor portal (TribeStudio, **Forms**). Reviewers decide on responses in
the portal's review desk or here in the console.

Everything is in the admin console under **Forms**:

| Page | What it is for |
|---|---|
| **All forms** | Every form, its status, who sees it, and how many responses are waiting |
| **Builder** | Questions, rules, settings, preview and publishing for one form |
| **Responses** | Reading, reviewing and exporting what contributors sent |
| **Forms settings** | Cohorts, who may publish and export, and Finance's points limits |

The Community section's **Website forms & claims** is a different, older tool
for the public website's contact forms. It is not part of Indigen Forms.

The design record, with the data model and server rules, is
[`docs/architecture/indigen-forms.md`](../architecture/indigen-forms.md).

## 1. Create a form

1. Open **Forms → All forms** and choose **New form**.
2. Choose **Blank form**, or start from one of the five templates:
   - **Kasem word collection**: word, meaning, variety, usage examples, an optional pronunciation recording, source and consents. Approved words become dictionary candidates.
   - **Sentence translation**: source sentence, translation, context, other phrasings and notes.
   - **Oral history**: title, narrator credit, language, a recording or written account, context and permissions.
   - **Research and documents**: title, description, source, authorship or permission, language and attachments.
   - **General feedback**: topic, feedback and an optional attachment.
3. Give it a title (or keep the template's) and choose **Create draft**.

A new form is a private draft. No contributor sees it until you publish it.
Templates are ordinary drafts: you can change every question and setting.

## 2. Add and arrange questions

The builder has three views: **Questions**, **Form settings** and **Preview**.
On a wide screen, **Questions** shows three panes: question types on the left,
the form in the middle and the selected item's settings on the right. On a
narrow screen the same panes are tabs: **Add question**, **Questions** and
**Settings**.

- **Add a question:** choose a type under **Add a question**. It is added after the selected question (or at the end of the selected section). You can also drag a type into a section.
- **Arrange:** select a question to show its buttons: **Move up**, **Move down**, **Section ↑** / **Section ↓** (to the previous or next section), **Duplicate** and **Delete**. Everything works from the keyboard. You can also drag a question by its handle.
- **Sections:** **Add section below** adds a section. Select a section's heading to give it a title, a description or a rule; its arrows move it. Deleting a section that still has questions asks first.
- **Wording:** type labels, help text, examples and options exactly as contributors should see them. Tone marks and other diacritics are kept exactly as typed.

Question types: short and long text, number, email, link, date, single
choice, multiple choice, dropdown, checkbox, consent, language, Kasem
variety, file, image, audio (with in-browser recording), video, repeatable
group, instruction text and heading.

### Answer keys

Each question has an **answer key** (shown in its settings and in exports).
Answers are stored under the key, not under the wording, so you can reword a
question at any time. The key is made once when you add the question. You can
change it only while no published version uses it; after that it is locked.
Option ids work the same way: they are made from the option's first wording
and never change when you reword the option.

## 3. Rules: required and shown

In a question's settings:

- **Required:** *Always*, *Never*, or *Only when…* (required only when a rule applies).
- **Shown:** *Always*, or *Only when…* (hidden until a rule applies).

A rule tests up to ten **earlier** questions (for example "Where does this
word come from? is A book or publication") and applies when *all* or *any* of
its conditions are met. The builder writes each rule out in plain words, for
example "Shown when Contribution type is Audio recording". A rule can never
point at a later question, so rules cannot loop. A hidden question never
blocks sending, and its answer is dropped.

## 4. Form settings

**Form settings** has one tab for each part of the form:

- **Details:** title, short description, category, instructions, estimated time, and the languages and Kasem varieties involved.
- **Presentation:** all questions on one page, or one page per section.
- **Schedule:** optional opening and closing times, in your own time zone.
- **Submission:** one or several responses per contributor, whether drafts and attachments are allowed, the thank-you message and what happens next.
- **Audience:** all contributors, or chosen groups. Groups are speakers of chosen Kasem varieties, contributors who picked chosen contribution types on their profile, and cohorts. A contributor who matches any one of them can see the form. A direct link does not let anyone else in.
- **Review and points:** whether every response is reviewed, by which reviewer group, instructions for reviewers, checks a reviewer must tick before approving, and the points for an approved response.
- **Destination:** where an approved response goes (see section 5).
- **Versions:** every version of the form, and **Retire** for older published versions.

### Points

Points are paid through the existing contributor points ledger, once per
response, when a reviewer approves it. Retries and double clicks cannot pay
twice. Finance sets the most points per response and per contributor per
day. A form that asks for more than Finance's limit cannot be published.
Forms without review never earn points.

## 5. Destinations and mappings

By default responses stay in Indigen Forms (**General intake**). Other
destinations copy an approved response into another workflow's review queue:

- **Dictionary candidate entries:** into the validators' review desk as a candidate word. A pronunciation recording goes with it only when the contributor gave storage permission and confirmed that the people recorded agreed (map **People heard in the recording agreed to share it** to a checkbox question; the word-collection template does). Statements the form never asked are recorded as "Not asked", never assumed.
- **Translation review queue:** into the materials review desk as a translation.
- **Audio collection:** a recording with its transcript, into the materials review desk.
- **Document and research intake:** documents into the materials review desk.

Nothing is ever published automatically. For each field the destination needs,
choose the question that fills it. Each list shows only questions whose
answers fit, and required fields are marked. Nothing is matched by name.
Every destination also lists the consents a response needs (for example
*Internal review*). A response whose contributor did not give them is approved
but not sent, and the response says why.

Approval never gives permission to publish or to use material for AI
training. Only the contributor's own consent answers do, and each response
keeps the exact consent wording the contributor saw.

## 6. Preview

**Preview** shows the form the way contributors see it, using the same
renderer and the same answer checks as the contributor portal. Switch
between **Desktop** and **Mobile (390 px)**. In a paged form, **Next** checks
each page, and **Check answers** checks the whole form. **Reset answers**
clears what you typed. Nothing is saved or sent, and upload questions check
the file type and size but do not upload anything. The Kasem character bar and
dictionary suggestions appear only in the contributor portal.

## 7. Save and publish

- **Save draft** (or Ctrl+S / Cmd+S) stores the draft. The header shows *Unsaved changes*, *Saving…* or *Saved 10:42*, and the console asks before you leave with unsaved changes.
- If another administrator saved the same draft in the meantime, your edits stay on screen. Choose **Load their version** (this discards yours) or **Keep mine and save over it**.
- Problems that block publishing are listed under the header. Select one to go to the question or setting it is about. A draft keeps an incomplete rule or setting exactly as you left it, so you can finish it later; it just cannot be published until the problem is fixed.
- **Publish…** saves first, then shows the server's summary: the number of sections, questions and uploads, which questions are required or have rules, every consent wording, the audience, schedule, submission, review and destination, and every answer rule. **Publish version N** appears only when nothing blocks publishing and you are allowed to publish.

## 8. Pause, close, archive

From **All forms**:

- **Pause:** contributors cannot send responses for now. Drafts and responses are kept. **Resume** reopens it.
- **Close:** no new responses. Reviewers can still decide on what was sent. **Reopen** opens it again.
- **Archive** (a closed form or an unpublished draft): hides it from contributors and from the list. Choose the **Archived** status filter to see it. Nothing is deleted. **Restore** brings it back closed, or as a draft if it was never published.
- **Duplicate:** makes an unpublished copy to start a new form from.

Only administrators allowed to publish can resume or reopen a form.

## 9. Change a live form (new version)

A published version cannot be changed. In the builder, choose **Edit as new
version**. This copies the live version into a draft (version 2, 3…).
Contributors keep using the live version until you publish the new one.

- **Drafts on the older version:** contributors keep that version. They can send it while the form is open, before the form's current closing date, and while the version is not retired. In the portal they are told a newer version exists and may move their answers to it; permissions are never carried over, so they tick each one again under the new wording.
- **A paused or closed form stays paused or closed** when you publish a new version. Resume or reopen it when you are ready.
- **Retiring** an old version (Form settings → Versions) means drafts on it can no longer be sent; those contributors start again on the current version.
- **Submitted responses** always keep the questions they were answered with.
- **Answer keys** keep their meaning across versions. A key from an older version can be removed, but it cannot be reused for a different kind of question.
- **Discard draft** throws away the unpublished draft. The live version is not touched.

## 10. Review responses

Open **Responses**, choose the form and filter by version, status (*All
submitted* by default), language, contributor (an account id is searched on
the server; a name filters the loaded rows) and the dates submitted. Filters
are kept in the page address, so you can share a filtered view with another
administrator.

- **Columns:** choose which answers show in the table. The choice is remembered in your browser for each form. By default it is the first four questions.
- **Counts:** *Submitted* counts every response sent at least once. *Awaiting review* counts responses that are submitted or under review. *Changes requested*, *Approved* and *Rejected* count each current status. Contributors' unsent drafts are not counted.
- **A response** opens beside the table (below it on narrow screens). It shows the answers of the response's own version. You can switch between revisions and mark what changed since the previous one. It also shows attachments (opened through a five-minute link), the consents with their wording, points and destination status, and the full history.
- **Decisions:** **Start review**, **Approve** (only once every reviewer check is ticked), **Request changes** and **Reject**. The last two need at least five characters of feedback, which the contributor sees. If someone else changed the response while you were reading, nothing is decided. Your feedback stays on screen, and **Load the latest version** shows the current state. Nobody can review their own response.

Administrators can review responses in every reviewer group. Reviewers and
validators use the review desk in the contributor portal.

## 11. Export

**Export…** (on Responses, with a form chosen) downloads CSV or JSON of
**everything submitted** or **approved only**, using the current version,
language, contributor and date filters. Each export is recorded in the
audit trail.

- **Fixed columns:** `reference_id`, `response_id`, `form_id`, `form_version`, `revision`, `status`, `contributor_id` (the account id; names and emails are not exported), `submitted_at`, `decided_at` and `granted_permissions`.
- **One column per answer key**, covering every exported version.
- **Choices:** option ids. Several ids are joined with `; `.
- **Repeatable groups:** a JSON list of entries keyed by sub-question key.
- **Attachments:** `attachmentId:fileName`. No download links are exported.
- **CSV safety:** the file is UTF-8 with a byte-order mark and text is quoted. A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a spreadsheet never runs it as a formula.
- **JSON** also carries each exported version's full definition, so ids map back to the questions and option labels contributors saw.

## 12. Who can do what

| Action | Who |
|---|---|
| Build forms, save drafts, pause, close, archive, manage cohorts, view responses | Administrators (with two-step verification) |
| Publish, resume, reopen | Administrators, or only those named under **Forms settings → Who can publish and export** |
| Export | Administrators, or only those named in the same place |
| Change the publisher and exporter lists | The owner super administrator only |
| Change points limits | Finance |
| Review | The form's reviewer group; administrators review every group |

**Forms settings** shows each of these as read-only to anyone who may not
change it.

## 13. What still needs development

These need a code change, not a setting:

- a new question type, rule operator, upload format or consent purpose;
- a new destination, or mapping group sub-questions into a destination;
- public forms for people without a contributor account;
- malware scanning, transcription or OCR of uploads;
- previews of uploaded images and audio inside the response view;
- counts of waiting form responses on the console's home page and sidebar badges.
