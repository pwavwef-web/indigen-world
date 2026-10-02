# Privacy page header

Generated for the privacy redesign on 2 October 2026 with the explicitly
requested Gemini Omni model. See `generation.json` for the exact prompt,
job and generation timestamps. No reference images or private records were
sent. The imagined courtyard is an AI illustration, not documentary imagery.

The website ships the optimised, silent MP4 at
`apps/website/public/media/privacy-stewardship.mp4` and its still frame at
`apps/website/public/images/privacy-stewardship.jpg`. The original local
provider output is ignored. The public MP4 has no audio stream and uses H.264
with fast-start metadata.

`node --experimental-strip-types tools/privacy-header/generate.mjs` resumes
the saved interaction and retrieves its output. It creates a new billable
generation only if `generation.json` does not exist. Uses ambient Google
application-default credentials; tokens are never written to files or output.
Do not remove the job file simply to retry a pending generation.

The page renders the still image for reduced-motion or Save-Data preferences,
supports pause/play, and pauses video offscreen or while the tab is hidden.
No model call occurs in the visitor's browser.
