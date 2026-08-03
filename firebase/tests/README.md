# Firebase Rules Tests

Add emulator-based tests here before enabling client access to any Firestore collection or Storage path.

Minimum coverage should include:

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
