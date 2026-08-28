# Repair look row 9: correct viewer-right semantics

Regenerate the complete coherent eight-pose look row for `kawuri-weaver`. The prior row failed blind QA because every pose that should face screen-right was visibly facing screen-left. Do not reuse, mirror, trace, or preserve that wrong horizontal orientation.

Use the canonical base, standard contact sheet, layout guide, `qa/look-mechanics.md`, approved cardinal strip, the individual approved `090` screen-right anchor, and the opposing `270` screen-left anchor. Screen coordinates are absolute viewer/image coordinates:

- **Screen-right means the beak tip must have a greater image x-coordinate than the center of the head and visible eye. The beak must project toward the RIGHT edge of the output canvas.**
- **Screen-left means the inverse and is forbidden in every nonzero pose in this row.** The attached 270 anchor is only a negative/opposing reference; do not copy its left-facing orientation.

Output exactly eight complete separated full-body poses left-to-right:

1. `000 up`: frontal, both eyes and beak clearly up.
2. `022.5 up-right`: beak begins moving toward the RIGHT edge; upward axis remains dominant.
3. `045 up-right`: beak and visible pupil are clearly right of head center with a strong upward cue.
4. `067.5 up-right`: nearly right-facing; beak unmistakably projects toward the RIGHT edge while eyes remain slightly up.
5. `090 screen-right`: exact approved right-profile family; beak tip and visible pupil are unmistakably on the RIGHT side of head center.
6. `112.5 down-right`: keep the beak projecting RIGHT while eyes and beak begin to dip.
7. `135 down-right`: beak remains clearly RIGHT of head center with a strong downward cue.
8. `157.5 down-right`: nearly down but still unmistakably RIGHT-facing, one even step before `180 down`.

Create one coherent clockwise family with even 22.5-degree transitions. Feet and lower torso stay anchored; identity, scale, baseline, crest, wings, chest mark, eye construction, and materials stay stable. The physical eye globes, eyelids, beak, and head lead; crest and wing tips follow subtly. No whole-sprite rotation, affine tilt, horizontal mirroring, replacement eyes, labels, guide marks, shadows, scenery, detached effects, overlap, clipping, or chroma-key colors inside the bird. Use a perfectly flat pure magenta `#FF00FF` background.
