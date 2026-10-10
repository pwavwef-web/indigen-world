# Website improvement and research plan

Prepared October 10, 2026. Website source commit
`c151f43544e07327b21b2fad43a021deb1ba9598` was deployed to Firebase Hosting on
October 10 at 05:11:29 UTC. Public assets and live desktop/mobile journeys were
verified; real-user outcomes have not been measured. This plan follows the website
competitive review.

## Implemented in this update

| Area | Improvement | Practical limit |
| --- | --- | --- |
| Information | Published expressions and sourced reference guides are connected through `/learn`; missing source and recording details remain visible. Explicit sentence/expression records are excluded from the word view. | No database records were edited; publication is not proof of linguistic validation. |
| Service | A three-step learning path, clear destinations and access labels, and a feedback route using the existing contact form. | Labs remain alpha, mobile access is waitlisted, newsletter delivery is still described as being prepared. |
| Design | A learning page using the existing visual system, clear reading hierarchy, responsive resource cards and visible next actions. | This is a targeted improvement, not a complete accessibility certification or brand redesign. |
| Functions | Exact-match ranking; source-preserving spelling groups; combined dialect/source, audio and saved filters; shareable entry links; storage/error recovery. | Saved lists are browser-local. A recording URL does not establish recording accuracy, rights or human origin. |
| Satisfaction | Contextual feedback prompts and coarse dictionary action events behind the existing analytics gate. | No satisfaction, retention or conversion improvement has been measured. |

The learning page loads existing public expressions. It does not create translations
or substitute generated language for community review. The music-film card is
labelled as a creative work with generated imagery, separate from reference material.

## Content review queue

Suggested owner: language editor with an authorised Kasem reviewer. Assign actual
people before scheduling the work. Keep provenance, regional variants and permissions
attached to each source record; do not merge records just because spellings match.

| Public record observed during verification | Review task | Acceptance evidence |
| --- | --- | --- |
| [na — water, Navrongo](https://indigenworld.com/dictionary?entry=ABSpJBFtXDULHbeToD48) | Source missing; recording missing. Confirm the example and regional usage with the editor. | Source and permitted attribution documented; recording, consent and reviewer decision recorded if supplied. |
| [gaale — skip](https://indigenworld.com/dictionary?entry=review_20260928_collection_suSI7RBW4UIkxOhczeo5_skip) | No example or translated example. Audio attribution explicitly identifies generated audio and an owner listening review. | A sourced, reviewed usage example; retain the recording-origin disclosure. |
| [amo — emphatic pronoun](https://indigenworld.com/dictionary?entry=project_kasena_ak013) | Source describes a Tiébélé/Burkina reference variety while the display dialect is Ghana Kasem; notes say dialect mapping is needed. | Editor resolves the label against the source, retaining the original reference and audit trail. |

These are editorial tasks, not permission to change meanings or publish recordings.
For the next batch, audit 50 frequently requested words for: source/page or speaker,
regional variety, meaning, example and translation, audio origin and consent, reuse
conditions, reviewer and review date. Report the denominator and completion per field.
Use the existing contributor/reviewer workflow for changes. Do not infer a licence
from an attribution or describe a published record as reviewed unless review is recorded.

## Service work requiring operational ownership

1. **Support:** name an inbox owner and backup; tag website feedback separately from
   correction/takedown requests; review the queue weekly. Choose a response target
   only after measuring staffing and current response times. Review the website's
   existing five-working-day acknowledgement aim against actual staffing before
   adding service guarantees.
2. **Learning content:** assemble one short, reviewer-approved introductory lesson
   from existing eligible words and examples. Pilot it with learners before adding
   more lessons. Do not use the unused mock starter-kit component as language evidence.
3. **Collection depth:** commission one consented oral account and one contextual
   culture article with source notes, transcript/captions and regional attribution.
   Agree access and reuse with the community before publishing.
4. **Availability:** verify mobile distribution, Labs access and newsletter delivery
   separately. Change public status copy only when each service has release evidence.
5. **Trust:** complete legal review of Terms/Privacy and clarify resource-specific
   permissions with the appropriate owners. Current copy remains an implementation summary.

## Usability session kit

Suggested facilitator: product owner or researcher. Recruit 5–8 consenting adults
across new learners, Kasem speakers, diaspora and educators. Include phone users
and a participant using keyboard or assistive technology. This is a small discovery
sample, not a representative satisfaction survey. Ask before recording sessions;
collect only what is needed and agree storage/deletion with participants.

Use the same build and tasks for each participant. Read the task; do not teach the
interface first. Stop a task after three minutes and offer help without treating the
person as the problem.

1. Find the meaning of a familiar word and explain which source/region it belongs to.
2. Find an entry with a recording and play it. Explain what you know about its origin.
3. Save a word, leave the page, return and find the saved list.
4. Find a spelling or grammar explanation and identify its source.
5. Find how to report a missing example or confusing page. Stop before submitting.

After each task ask: “How easy was that, from 1 (very difficult) to 5 (very easy)?”
Then ask what made it difficult and what they expected. At the end: “What would make
you return?” and “What information would you need before trusting or reusing this?”

Record participant code (no name), audience, device/access needs, task, unassisted
completion, time, difficulty rating, observed blocker and suggested fix. Keep names
and contact information out of the shared findings. Report counts alongside percentages.
Rank issues by blocked tasks and repeated observations; fix the top three and repeat
the tasks with another small group. The website feedback form is voluntary feedback,
not a substitute for this study.

## Measurement after release

| Question | Evidence | Interpretation |
| --- | --- | --- |
| Can visitors finish a task? | Usability completion/time and 1–5 ease rating | Baseline before claiming improvement; include sample size. |
| Are learning paths used? | Existing page views and CTA events, if enabled | Aggregate navigation signal, not learning proficiency. |
| Are dictionary tools useful? | `dictionary_action`: save, unsave, view_saved, filter_audio, play_audio | Action counts only; play does not mean completion, comprehension or satisfaction. |
| Is information becoming stronger? | Editorial audit completion by field and collection | Count reviewed records, sources and permissions separately from publication totals. |
| Is support dependable? | Inbox first-response time, unresolved age and recurring themes | Establish an actual baseline before promising response times. |

New dictionary events contain no search text, word IDs, translations or feedback text.
Analytics remains controlled by the existing build-time switch and measurement
configuration; this change does not enable it or prove delivery. Keep feedback text
in the existing support workflow, not analytics. Do not introduce cross-device tracking
to measure retention without a separate product/privacy decision.

## Release gate and follow-up

The website check and targeted desktop/mobile verification passed. Review the prepared
[release post](../../apps/updates-blog/posts/2026-10-10-easier-kasem-discovery/README.md).
The authorised release targeted only `hosting:indigen-world`, using the repository's
release process. Live routes and five selected build assets matched on both public
domains. Learning content, recording filters, saved-list reload, copied entry links,
source attribution, mobile focus recovery and feedback prefill were checked on
`indigenworld.com`; evidence is saved with the release post. Test actual
message delivery with an explicitly agreed test recipient; local validation alone
does not verify delivery. Blogger publication remains with Chinedum.

Within the first week after release, run the sessions and triage feedback. After
four weeks, compare the baseline and repeat tasks, document remaining gaps, and
choose the next content batch. Timings are a proposed operating cadence, not scheduled
automations or commitments from unassigned staff.
