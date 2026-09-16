# Release communication

For every major user-facing update, add a new release post under
`apps/updates-blog/posts/YYYY-MM-DD-descriptive-slug/` as part of the work.
Chinedum uses these posts to share updates with the community.

- Follow the existing Blogger post format: `post.html` for the article body
  and `README.md` for title, labels, search description, publishing steps,
  and release/deployment status.
- Include `share.md` with concise copy Chinedum can share and a clearly marked
  placeholder for the published article URL.
- Explain what changed, who benefits, how to use it, and relevant availability
  limits in plain language. Base claims on verified implementation and release
  evidence; distinguish implemented features from confirmed live releases.
- Cover substantial features, redesigns, and workflow changes. Group related
  changes into one post; routine internal maintenance does not need a post.
- Keep older release posts intact. Add a new dated folder for each major
  update, and link it from `apps/updates-blog/posts/README.md`.
- Preparing repository content does not imply publishing it externally or
  sending messages. Leave the publication and sharing handoff to Chinedum
  unless the user explicitly requests those actions.
