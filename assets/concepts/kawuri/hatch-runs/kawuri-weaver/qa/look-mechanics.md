# Kawuri Weaver look mechanics

## Natural motion

Kawuri Weaver looks around like a compact alert bird, not like a flat sticker being rotated. The feet, lower torso, baseline, and practical body scale stay anchored. The physical eyeballs and eyelids lead the gaze; the beak and head then yaw or pitch toward the target; the neck and upper torso follow only slightly. The crest, near wing tips, and tail feathers may lag by a small even amount. No prop is present. The gold chest mark stays physically attached to the cream chest and may foreshorten naturally as the torso turns.

Both eyes remain the same constructed glossy bird eyes from the canonical base. Rotate/redraw each whole eye surface with its iris, pupil, highlight, rim, and eyelids together; do not slide loose pupils over fixed white circles and do not add replacement or googly eyes. Preserve the friendly mature expression and facial proportions.

## Motion budget

Each 22.5-degree step changes the eye aim, beak position, head yaw/pitch, and small upper-body follow-through by roughly the same visual amount. Keep the feet, lower torso, baseline, head size, overall volume, and chest-mark attachment stable. Do not use whole-sprite rotation, affine tilt, scaling, recentering jumps, or independent pose restyling. Adjacent poses must form one continuous clockwise loop, including `157.5 -> 180` and `337.5 -> 000`.

## Cardinal pose families

- **000 up:** both eye globes and eyelids aim clearly upward; the beak lifts above its neutral angle; the head pitches up while the grounded body stays front-readable; the crest trails slightly backward. The chest remains visible and neither wing changes sides.
- **090 screen-right:** the beak tip crosses unmistakably to the right of the head center; the right-facing head profile becomes dominant; the far eye and far cheek are partly occluded; more of the bird's left body side and near wing is visible. The chest mark foreshortens but stays attached.
- **180 down:** both eyes aim clearly downward; the beak dips toward the chest; the head and neck compress slightly without shrinking the body; the crest follows forward. The feet and torso remain anchored and front-readable.
- **270 screen-left:** the beak tip crosses unmistakably to the left of the head center; the left-facing head profile becomes dominant; the far eye and far cheek are partly occluded; more of the bird's right body side and near wing is visible. This must visibly oppose the 090 family.

## Interpolation and avoidances

Diagonals combine the adjacent cardinal mechanisms: eye direction first, then beak/head orientation, then restrained crest/wing/upper-body follow-through. Up-right and down-right must keep a readable rightward beak axis; down-left and up-left must keep a readable leftward beak axis. Do not add text, labels, arrows, degrees, clocks, guide marks, props, shadows, glows, detached effects, or new markings.
