# Firebase Rules Tests

Emulator-based tests for `firebase/firestore.rules`, using
`@firebase/rules-unit-testing` and Node's built-in test runner.

## Running

```bash
npm run test:rules      # from the repo root
```

This wraps the tests in `firebase emulators:exec --only firestore`, so the
Firestore emulator (Java required) is started, the suite runs, and the emulator
is torn down. Current coverage lives in `firestore.rules.test.mjs`
(12 allowed/denied cases across content, registry, profile, review and audit
collections).

Add emulator-based tests here before enabling client access to any Firestore
collection or Storage path.

Coverage should include:

- Anonymous public reads where explicitly permitted
- Authenticated ownership checks
- Contributor create and update boundaries
- Validator review permissions
- Administrator limits and server-only fields
- Consent and cultural-permission restrictions
- Reward and audit-log immutability
- Cross-community and cross-language access isolation
- File type, path, size, and ownership restrictions for Storage
- Explicit denial for unknown roles and malformed records

A rule change without matching allowed and denied test cases is incomplete.
