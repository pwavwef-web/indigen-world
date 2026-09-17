# Assignment guidance, uncertainty flags and contributor activation

Status: **Draft — implemented locally; production deployment and smoke testing pending.**

| Field | Value |
|---|---|
| Title | Room to say “I’m not sure” |
| Labels | TribeStudio, Feature, Kasem |
| Search description | Invited contributors get an unsure flag and email-based account activation with a chosen password. |
| Article | post.html |
| Sharing copy | share.md |

## Evidence and availability

Implemented in the contributor portal and Functions callables. Backend behavior and UI workflow tests cover skip writes, assignment metadata and password activation. These tests simulate Firebase I/O; production authentication still needs verification. Access is invitation-only. The admin assignment screen is not included. Assignment guidance metadata remains supported by the backend; the introductory card has been removed from the interface.

## Publishing handoff

1. Deploy the changed Functions (including activateExpressionContributor) and Tribe Studio; confirm Email/Password Auth is enabled.
2. Verify temporary phone-password sign-in, chosen-password sign-in, activation recovery, skip/resume and review locks in production.
3. Update the release status here with verified deployment evidence.
4. Create a Blogger post using the title, labels and search description above; paste post.html in HTML view and preview.
5. Publish only after availability is confirmed. Replace [PUBLISHED_POST_URL] in share.md. Chinedum handles publication and sharing.
