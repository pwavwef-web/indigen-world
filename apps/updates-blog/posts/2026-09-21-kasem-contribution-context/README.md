# More context for Kasem contributions

Status: **Draft article — Functions, website and Kasem Dictionary website deployed 2026-09-23 from `main` at `e90c5fb`; the mobile app changes still need a Play release.**

| Field | Value |
|---|---|
| Title | More context for Kasem contributions |
| Labels | `Kasem`, `Contributions`, `Dictionary`, `Culture` |
| Search description | Kasem sayings can carry literal readings, usage context and French meanings through review to the dictionary. |
| Custom permalink | `kasem-contribution-context` |
| Article | `post.html` |
| Sharing copy | `share.md` |

## What is verified

- The mobile saying form accepts optional literal reading and usage context; dictionary contributions can include an optional French meaning.
- The callable validates and retains these fields on the contributor receipt and canonical submission.
- New collection submissions carry a corpus area and start at community status. Published dictionary contributions carry reviewed status, without claiming Gold authentication.
- The mobile dictionary and both dictionary websites read and display the added public fields when present.

Verification: Functions build, website build, standalone Kasem Dictionary check,
contract fixtures, Collection contribution unit tests, targeted Flutter analysis
and contribution/dictionary widget tests, and Updates Blog preview passed locally.

## Availability limits

The ten corpus areas are a knowledge classification, separate from the existing Music, Dictionary, Literature, Audiobooks and Video shelves. This change does not add ten public collections or migrate old records. Expert Gold review, a global human readable `KSM-*` identifier allocator, audio speaker registry and dedicated dialogue/culture/QA intake need separate workflows and reviewer policy. On 2026-09-23 the Functions and both dictionary websites were deployed (the live website
and dictionary bundles contain the new fields); the mobile app changes are on `main` but
not in any Play release yet.

## Publishing handoff

1. Functions, website and dictionary website: deployed 2026-09-23. Ship the mobile app release.
2. Test a new saying from contribution through review and publication with consenting sample data.
3. Paste `post.html` into Blogger in HTML view with the metadata above.
4. Replace `[PUBLISHED_POST_URL]` in `share.md` before sharing.
