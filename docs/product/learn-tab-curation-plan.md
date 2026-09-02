# Learn tab curation plan: sections 1–10

## Decision summary

In the mobile product, a “section” is currently represented as a **unit**. Use the learner-facing word **section** in curriculum planning and keep `unitTitle`, `unitSubtitle`, and `unitOrder` as the implementation fields until sections become first-class records.

For the first release:

- Publish **10 sections**.
- Put **4 lessons in each section**: three teaching/practice lessons and one checkpoint.
- Put **6 questions in each teaching lesson** and **8 questions in each checkpoint**.
- Target **3–5 minutes** for a teaching lesson and **5–7 minutes** for a checkpoint.
- Introduce no more than **6 new words or short phrases in one lesson**.
- Award a consistent **15 XP** for a teaching lesson and **25 XP** for a checkpoint.
- Total launch scope: **40 lessons and 260 questions**.

This is large enough to feel like a real path, but small enough for every Kasem item to be sourced, checked, tested on a phone, and approved by qualified reviewers.

## The standard section pattern

Every section follows the same rhythm so learners know what to expect.

| Lesson | Purpose | Questions | Default question mix |
| --- | --- | ---: | --- |
| 1. Notice | Introduce the first 3–5 targets | 6 | 2 Kasem-to-English, 2 English-to-Kasem, 1 picture/context, 1 immediate review |
| 2. Add | Review lesson 1 and add 3–5 targets | 6 | 2 retrieval, 2 new-target recognition, 1 reverse match, 1 context question |
| 3. Use | Combine the section’s targets in a useful situation | 6 | 1 warm-up, 2 dialogue completions, 2 scenario questions, 1 section review |
| 4. Checkpoint | Check the whole section; introduce nothing new | 8 | 2 recognition, 2 reverse match, 1 picture/context, 2 dialogue/scenario, 1 spiral review from an earlier section |

The question count is fixed deliberately. Six questions fits the current short-lesson experience; eight makes a checkpoint feel meaningful without turning it into a test users abandon.

### Ten-section production map

| Section | Global lesson order | Title | Lessons | Questions | Icon |
| ---: | ---: | --- | ---: | ---: | --- |
| 1 | 1–4 | Greetings and courtesy | 4 | 26 | `wave` |
| 2 | 5–8 | Introduce yourself | 4 | 26 | `chat` |
| 3 | 9–12 | Family and people | 4 | 26 | `family` |
| 4 | 13–16 | Numbers and age | 4 | 26 | `school` |
| 5 | 17–20 | Around the home | 4 | 26 | `book` |
| 6 | 21–24 | Food and drink | 4 | 26 | `star` |
| 7 | 25–28 | At the market | 4 | 26 | `market` |
| 8 | 29–32 | Time and daily routine | 4 | 26 | `sun` |
| 9 | 33–36 | Places and directions | 4 | 26 | `map` |
| 10 | 37–40 | Needs, health, and help | 4 | 26 | `star` |
| **Total** | **1–40** |  | **40** | **260** |  |

## What each question should look like

The current app supports one prompt, an optional supporting line, an optional prompt image, 2–6 text or picture answers, one correct answer, and a post-answer explanation. It does **not** yet support audio, free typing, speaking, word ordering, or multiple correct answers.

### Authoring standard

- Use a prompt of **3–10 words**. Ask one thing only.
- Use the supporting line for the situation or instruction, not a second question.
- Use **3 text choices** for ordinary questions and **4 choices** for checkpoints.
- Use **4 choices** for picture questions so the two-column grid is balanced.
- Make exactly one answer unambiguously correct for the dialect named in the content record.
- Keep choices in the same category and at a similar length. A greeting should be contrasted with other plausible phrases, not random nouns.
- Rotate the correct answer position. Across one lesson, do not place it in the same position more than twice.
- Write a one- or two-sentence explanation that gives the correct Kasem form, its English meaning, and the relevant context or usage note.
- Show the learner a target at least twice in its first section: once for recognition and once for retrieval or use.
- Do not punish a valid dialect variant. If variants are taught, name the variant in the supporting line; otherwise do not use another valid variant as a wrong answer.

### Reusable question shapes

All Kasem strings below are placeholders. Replace them only with approved, source-linked language content.

**1. Kasem-to-English recognition**

- Prompt: `What does “[approved Kasem phrase]” mean?`
- Support: `Choose the closest English meaning.`
- Answers: three plausible meanings from the current section.
- Explanation: `“[Kasem phrase]” means “[English meaning]” in [named variety/context].`

**2. English-to-Kasem retrieval**

- Prompt: `How do you say “thank you”?`
- Support: `Choose the approved form for this section.`
- Answers: three reviewed Kasem forms already encountered by the learner.
- Explanation: `Use “[Kasem phrase]” for “thank you.” [Short usage note, if needed].`

**3. Situation choice**

- Prompt: `What would you say first?`
- Support: `You arrive and greet an elder.`
- Answers: a respectful greeting, a leave-taking phrase, and an unrelated but familiar phrase.
- Explanation: identify the greeting and briefly explain why it fits the situation.

**4. Dialogue completion**

- Prompt: `Complete the exchange`
- Support: `A: [approved line]  B: ____`
- Answers: three short responses already taught.
- Explanation: show the completed two-line exchange and translate it.

**5. Picture meaning**

- Prompt: `Choose “[approved Kasem word]”`
- Support: `Tap the matching picture.`
- Answers: four clear, locally appropriate, licensed images.
- Explanation: repeat the word and meaning. Do not rely on colour alone to identify the answer.

**6. Meaning from a scene**

- Prompt: `Which phrase fits this picture?`
- Support: one short clue only if the image could be ambiguous.
- Prompt image: one approved scene with no embedded answer text.
- Answers: three reviewed phrases.
- Explanation: state what is happening in the scene and why the phrase fits.

### Question-writing anti-patterns

Do not publish questions with joke answers, two defensible answers, unexplained spelling differences, unreviewed machine translations, English grammar trivia, negative phrasing such as “which is not,” or a photograph whose meaning depends on guessing a person’s relationship, status, gender, or intent.

Do not create “Listen” lessons until the lesson model and player have a reviewed audio field. A headphones icon does not make a text card an audio exercise.

## Sections 1–10

The curriculum below specifies concepts and question shapes, not production Kasem wording. Kasem translations, spelling, register, and dialect labels must come from approved records and qualified review.

### Section 1 — Greetings and courtesy

**Subtitle:** Meet someone, respond, and leave politely  
**Outcome:** The learner can choose an appropriate basic greeting, response, thanks, and leave-taking expression.  
**Suggested icon:** `wave`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Say hello | 6 | Introduce 3–4 approved greetings. Use 2 Kasem-to-English matches, 2 English-to-Kasem matches, 1 arrival scene, and 1 repeated greeting in a different context. |
| 2. Answer a greeting | 6 | Begin with 2 greetings from lesson 1, then use 3 greeting-and-response pairs and 1 choice between a response and a leave-taking phrase. |
| 3. Be polite | 6 | Teach approved forms for thanks, please/asking politely if appropriate in the reviewed variety, and goodbye. Use 1 warm-up, 2 direct matches, 2 mini-dialogues, and 1 situation choice. |
| 4. Greetings checkpoint | 8 | Mix 2 meaning questions, 2 form questions, 1 arrival image, 2 complete exchanges, and 1 “arrive or leave?” scenario. No new expressions. |

### Section 2 — Introduce yourself

**Subtitle:** Share your name and ask about another person  
**Outcome:** The learner can give a name, ask someone’s name, and understand a simple introduction.  
**Suggested icon:** `chat`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. My name is… | 6 | Teach the approved name-introduction frame and first-person reference needed for it. Use 2 meaning matches, 2 form matches, 1 dialogue completion, and 1 greeting-plus-name sequence. |
| 2. What is your name? | 6 | Review the self-introduction twice, introduce the reviewed question and response pair, then ask 2 dialogue completions and 1 context choice for respectful address. |
| 3. Meet someone | 6 | Combine greeting, name question, response, thanks, and leave-taking. Use 1 warm-up and 5 steps drawn from two short introductions. |
| 4. Introductions checkpoint | 8 | Use 2 direct matches, 2 reverse matches, 3 dialogue steps, and 1 greeting review from section 1. Include at least one full three-turn exchange across consecutive questions. |

Do not assume that English-style “first name / surname” distinctions map directly to local naming practice. The reviewer should approve both the language and the social framing.

### Section 3 — Family and people

**Subtitle:** Recognise close relations and introduce people  
**Outcome:** The learner can identify common family terms and use a simple frame to introduce another person.  
**Suggested icon:** `family`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Close family | 6 | Introduce 4–5 high-frequency, reviewer-approved family terms. Use 2 picture choices, 2 Kasem-to-English matches, 1 English-to-Kasem match, and 1 immediate review. |
| 2. More family | 6 | Review 2 close-family terms and add 3–4 relations chosen by community reviewers. Use 2 direct matches, 2 reverse matches, 1 family-scene question, and 1 mixed review. |
| 3. Introduce a person | 6 | Teach a reviewed “this is…” or equivalent introduction frame. Use 1 warm-up, 2 frame completions, 2 short social scenarios, and 1 cumulative family-term review. |
| 4. Family checkpoint | 8 | Use 2 picture choices, 2 meaning matches, 1 reverse match, 2 introduction scenarios, and 1 section 2 review. |

Avoid using family photographs unless everyone shown has consented and the relationship is explicit in the approved caption. Illustrations or objects may be safer than asking learners to infer relationships from appearance.

### Section 4 — Numbers and age

**Subtitle:** Count small quantities and understand simple age statements  
**Outcome:** The learner can recognise 1–10, match small quantities, and understand a reviewed way of asking or stating age.  
**Suggested icon:** `school`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Numbers 1–5 | 6 | Introduce 1–5 with 2 word-to-number matches, 2 number-to-word matches, 1 picture quantity, and 1 mixed recall. |
| 2. Numbers 6–10 | 6 | Review 2 numbers from lesson 1, introduce 6–10 through 2 recognition questions, then use 1 picture quantity and 1 mixed 1–10 recall. |
| 3. Say an age | 6 | Use 1 number warm-up, introduce the approved age question/statement frame, then use 2 meaning matches, 1 dialogue completion, and 1 age scenario. |
| 4. Numbers checkpoint | 8 | Use 2 numeral-to-word, 2 word-to-numeral, 2 picture quantities, 1 age exchange, and 1 family-number review from section 3. |

Picture quantities should use countable objects with clean separation. Do not make the learner count tiny or overlapping objects.

### Section 5 — Around the home

**Subtitle:** Name everyday objects and say where something is  
**Outcome:** The learner can recognise common home objects and understand simple location or possession phrases.  
**Suggested icon:** `book`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Everyday objects | 6 | Introduce 4–5 common, locally appropriate objects with 3 picture choices, 2 text matches, and 1 repeated picture-to-word question. |
| 2. Places at home | 6 | Review 2 objects and add 3–4 approved place/location terms that do not assume one house layout. Use 2 picture questions, 2 meaning matches, 1 reverse match, and 1 review. |
| 3. Where is it? | 6 | Teach a reviewed “where is…?” frame plus 2–3 basic location responses. Use 1 warm-up, 2 scene questions, 2 dialogue completions, and 1 possession/location contrast. |
| 4. Home checkpoint | 8 | Use 2 object pictures, 2 place matches, 2 “where?” exchanges, 1 possession scenario, and 1 number review from section 4. |

Use images that represent homes in the intended communities without presenting one household style as universal.

### Section 6 — Food and drink

**Subtitle:** Recognise everyday foods and make a simple request  
**Outcome:** The learner can identify selected everyday foods/drinks and express a basic want, hunger, or thirst using reviewed forms.  
**Suggested icon:** `star`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Food words | 6 | Introduce 4–5 community-selected staple foods. Use 3 picture choices, 2 text meaning matches, and 1 immediate picture review. |
| 2. Drinks and needs | 6 | Review 2 foods; add approved words or phrases for water/drink, hunger, and thirst. Use 2 direct matches, 1 reverse match, 2 situation choices, and 1 review. |
| 3. Ask at a meal | 6 | Teach a simple reviewed request frame and polite response. Use 1 warm-up, 2 request completions, 2 meal scenarios, and 1 food/drink contrast. |
| 4. Food checkpoint | 8 | Use 2 food pictures, 1 drink picture, 2 meaning/form matches, 2 request dialogues, and 1 home-object review from section 5. |

Every food image and label should be checked locally: the same English label can refer to different preparations, ingredients, or names in different communities.

### Section 7 — At the market

**Subtitle:** Ask for an item, a quantity, and a price  
**Outcome:** The learner can follow the core steps of a short market exchange.  
**Suggested icon:** `market`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Market items | 6 | Introduce 4–5 locally common goods selected by reviewers. Use 3 picture choices, 2 English/Kasem matches, and 1 quantity-plus-item review. |
| 2. How much? | 6 | Review 2 market items, introduce the approved price question and 2–3 response elements, then use 2 meaning matches, 2 number/price questions, and 1 dialogue completion. |
| 3. Buy something | 6 | Combine greeting, item request, quantity, price, thanks, and leave-taking. Use 1 warm-up and 5 sequential choices from a realistic exchange. |
| 4. Market checkpoint | 8 | Use 2 item pictures, 2 quantity/number questions, 1 price question, 2 dialogue steps, and 1 food review from section 6. |

Price examples must say which currency and market context they use. Avoid teaching a sample price as though it were current or universal.

### Section 8 — Time and daily routine

**Subtitle:** Talk about parts of the day and common activities  
**Outcome:** The learner can recognise basic time-of-day expressions and understand a few common routine statements.  
**Suggested icon:** `sun`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Parts of the day | 6 | Introduce 3–4 reviewed time-of-day expressions. Use 2 picture scenes, 2 meaning matches, 1 reverse match, and 1 greeting-at-the-right-time review. |
| 2. Daily actions | 6 | Review 2 time expressions and add 3–4 high-frequency actions. Use 2 scene questions, 2 direct matches, 1 reverse match, and 1 time-plus-action combination. |
| 3. My day | 6 | Teach reviewed frames for sequencing or saying when an action happens. Use 1 warm-up, 2 scene-to-sentence choices, 2 short question/answer exchanges, and 1 routine ordering context without requiring drag-and-drop. |
| 4. Routine checkpoint | 8 | Use 2 time pictures, 2 action matches, 2 time-and-action scenarios, 1 short exchange, and 1 market review from section 7. |

The current player cannot order words or events interactively. Express ordering as a multiple-choice sentence or scene question until that interaction exists.

### Section 9 — Places and directions

**Subtitle:** Ask where a place is and follow a simple direction  
**Outcome:** The learner can recognise selected community places and understand a short, reviewed direction exchange.  
**Suggested icon:** `map`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. Places nearby | 6 | Introduce 4–5 locally useful places. Use 3 picture choices, 2 meaning matches, and 1 place review. Select places appropriate to the target community. |
| 2. Position words | 6 | Review 2 places and teach 3–4 approved position/distance terms such as near/far or left/right only where the mapping is validated. Use 2 diagrams, 2 direct matches, 1 reverse match, and 1 mixed review. |
| 3. Ask the way | 6 | Teach the approved “where is…?” and short direction response frames. Use 1 warm-up, 2 map questions, 2 dialogue completions, and 1 destination scenario. |
| 4. Directions checkpoint | 8 | Use 2 place pictures, 2 map/position questions, 2 direction exchanges, 1 destination scenario, and 1 routine review from section 8. |

Use simple schematic maps. Do not use real home locations, private landmarks, or directions that could expose sensitive community information.

### Section 10 — Needs, health, and help

**Subtitle:** Express a basic need and ask for help  
**Outcome:** The learner can communicate a small set of immediate needs and recognise a basic help request. This is language practice, not medical guidance.  
**Suggested icon:** `star`

| Lesson | Questions | Content and sequence |
| --- | ---: | --- |
| 1. How I feel | 6 | Introduce 3–4 low-risk, reviewed states such as well/unwell, tired, hungry, or thirsty. Use 2 scene choices, 2 meaning matches, 1 reverse match, and 1 food/routine review. |
| 2. Basic discomfort | 6 | Teach only community-approved, non-diagnostic body or discomfort phrases. Use 2 image/diagram questions, 2 meaning matches, 1 short response, and 1 help-context question. |
| 3. Ask for help | 6 | Teach a reviewed help phrase and safe, simple responses. Use 1 warm-up, 2 direct matches, 2 urgent-but-non-graphic scenarios, and 1 dialogue completion. |
| 4. First-path checkpoint | 8 | Use 2 need/feeling matches, 1 diagram question, 2 help dialogues, 1 applied scenario, and 2 spiral-review questions drawn from greetings, introductions, market, or directions. |

Do not put emergency numbers, diagnosis, dosage, or treatment advice into a language quiz. Any real safety information should live in a separately maintained, location-aware product surface.

## Admin curation workflow

1. **Create the section brief.** Record the outcome, named language variety, target learner, target words/phrases, and what is explicitly out of scope.
2. **Select approved source records.** Every Kasem item must point to an approved lexical or sentence record with source, attribution, dialect/variety, permissions, and publication eligibility.
3. **Draft all four lessons unpublished.** Keep the section title, subtitle, and unit number identical across its lessons. Assign unique global path orders from 1 through 40.
4. **Run language review.** A qualified Kasem validator checks spelling, translation, register, dialect, distractors, and explanations. Cultural review checks scenes and images.
5. **Run editorial QA.** Check the count, option balance, correct-answer distribution, repeated targets, reading length, and that no question has two valid answers.
6. **Preview on a phone.** Test every image crop, long answer, explanation, dark mode, and offline/broken-image fallback.
7. **Publish as a complete section.** Publish its four lessons together, in order. Do not expose a section whose later lessons are still drafts.
8. **Review after release.** Inspect completion and error rates by question when analytics exists. A question with unusually high failure should be reviewed for ambiguity before assuming learners do not know the material.

## Required publishing checklist

A section is ready only when all answers below are yes.

- Does it contain exactly 4 lessons with 6, 6, 6, and 8 questions?
- Does every Kasem string point to an approved source record?
- Are the language variety, validator, validation date, and content version recorded?
- Are public-display permission and licence confirmed for every text and image?
- Has every distractor been checked as genuinely wrong in the named variety and context?
- Does every question have a useful explanation?
- Are correct answers distributed across positions?
- Do images have consent/licensing, clear meaning, and usable mobile crops?
- Has the whole section been completed successfully on a physical or emulated phone?
- Are all four lessons still drafts until the section is complete?

## Admin product changes needed for safe curation

The current editor can author the proposed text and picture questions, but it stores sections implicitly by repeating unit fields on every lesson and it does not carry the governance metadata required elsewhere in the repository. Before production Kasem lessons replace the preview, add:

1. **First-class sections** with id, title, subtitle, order, objective, status, and publish controls.
2. **Governance fields or source links** for language, dialect/variety, source record ids, validator references, validation status/date, licence, public-display permission, and content version.
3. **Section-level validation and publishing** so four lessons cannot silently disagree on their section title/order or go live as an incomplete set.
4. **Preview and duplication tools** so editors can test the learner view and reuse the standard 6/6/6/8 structure safely.
5. **Question-level analytics ids** so ambiguous questions can be found and revised without relying only on lesson completion.
6. **Later, reviewed audio support** with a prompt-audio field and transcript. Only then add listening lessons or use the headphones icon.
7. **A content-driven validation notice.** The mobile lesson player currently labels every lesson as a preview whose phrases await validation, including published Firestore lessons. Keep that notice for bundled preview content, but let approved production sections show their real validation/variety label.

Until those changes exist, keep a separate review sheet keyed by stable lesson id and question number, and treat “missing metadata” as “not publishable.”
