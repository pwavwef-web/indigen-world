# Local verification — 23 October 2026

Application deployment and authenticated production review were not performed.
All accounts, submissions, expressions and source text used in tests are synthetic.

| Check | Result |
| --- | --- |
| Functions, shared console UI, Administration and TribeStudio builds | Passed |
| Reviewer editing integration | 10 passed: canonical/receipt updates, corrected public records, credit/consent, history, own-submission restrictions, MFA, stale writes, concurrent edits, spelling reservations and closed states |
| Administration validation and routes | Passed; 10 route tests plus static UI/security checks |
| TribeStudio validation and workflow tests | Passed; 80 tests |
| Staff security | Passed; 16 unit/static checks and 11 emulator checks |
| Firestore rules | 207 passed with `--test-concurrency=1` |
| Collection contribution, expression and language-loop helper checks | 47 passed |
| Desktop and mobile browser checks | Passed for both real review screens using synthetic service responses: Unicode edits, navigation protection, failed-save recovery, save-and-continue, publication payload/version and consent controls, no horizontal page overflow |
| Blogger theme | 29 passed |
| Contract example validation | Blocked by an existing validator/schema mismatch: the Ajv 2020 validator loads `mobile-video-project.schema.json`, which declares draft-07, without the draft-07 meta-schema. Neither that schema nor the validator was changed in this update. |

The default parallel Firestore rules command initially passed 206/207: the Kawuri
task owner-read case returned a null-resource error. These test files share a
project and clear emulator data, consistent with a fixture-reset collision.
Running the full unchanged rule suite sequentially passed
207/207. No rules or assertions were relaxed.

The broader creator/expression/language-loop Functions emulator run passed 20/21
existing scenarios. The unchanged ordinary-open-post withdrawal test timed out
waiting for its automatic initial publication. This path uses
`open-publishing.ts`, which this update does not modify. The new editing suite
passes independently. An isolated retry of the existing trigger test also timed
out waiting for automatic publication. In a combined Functions-trigger run the
new concurrent-editor test rejected one writer safely, but returned emulator
code 3 instead of the asserted callable `aborted` code; the dedicated Firestore
editing suite is the verification command for this feature. These results do
not establish a production release.

On this Windows host the Functions emulator initially could not `require()` the
asynchronous ESM bundle under Node 24. The broader run used the existing local
`.tooling/gemini4/firebase-esm.cjs` compatibility shim through `NODE_OPTIONS` to
let the CLI dynamically import that bundle. This only affects the local module
loader; no authentication, MFA, App Check or role checks were changed.

Screens in `screens/` were generated with
`npm run test:reviewer-editing:browser`; framed publication images were generated
with the existing `render-post-art.mjs` script. The browser harness contacts only
its local fixture server. Visual inspection covered the actual editor layouts
and branded cover. No real contributor material is present.
