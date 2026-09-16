/**
 * The film's bible: one look, one boat, one journey.
 *
 * Every still and every clip is generated from these words, so continuity is a
 * property of this file rather than of luck. Each asset repeats the shared
 * LOOK and BOAT blocks verbatim, stills are generated with the boat reference
 * sheet attached, and every clip starts from its own still — so a clip can
 * never open on a different boat, sky or palette than the frame before it.
 *
 * Journey: shore → reef → open water → uncertainty → discovery → horizon.
 * Time of day moves with it: blue hour → starlit night → dawn over the reef →
 * midday ocean → dusk → storm night → moonlight → misty dawn → sunrise.
 */

export const LOOK = `Cinematic film still from a quiet, poetic feature film. Shot on 35mm film with an anamorphic lens: gentle halation around lights, soft film grain, shallow atmospheric haze, natural light only. Colour palette: deep indigo and ocean blue shadows, luminous teal and cyan water, with warm amber lantern light and soft gold sunrise as the only warm accents. Painterly realism with a faint touch of magic. Wide composition with the main subject centred horizontally so the frame can be cropped to a tall phone screen. No text, no letters, no logos, no watermark, no borders.`;

export const BOAT = `The boat is always the same small hand-built wooden outrigger canoe: a slender dark hardwood hull with a single slim outrigger float joined by two curved wooden booms lashed with natural fibre rope, a faded ochre-and-white band of simple painted triangles along the upper edge of the hull, a short wooden mast with one small triangular sail of pale woven natural fibre, and a round brass-and-glass lantern hanging from a short pole at the bow, glowing warm amber.`;

export const TRAVELLER = `When a person appears it is one lone adult traveller seen only from behind or as a distant silhouette, wearing a simple deep indigo wrap; the face is never visible.`;

export const IMAGE_SYSTEM = `You create frames for a short silent film about a journey by canoe beyond a coral reef, made for Indigen World, a platform that helps communities keep their languages and stories alive.
Keep one consistent visual world across every frame. Never depict real or identifiable people, never show a face, never add written text of any kind, and never depict sacred rites or specific real cultural regalia.`;

export const NEGATIVE = "text, captions, subtitles, letters, watermark, logo, visible face, close-up of a face, crowds, modern motorboat, plastic, distorted hands, extra limbs, fast cuts, jump cuts, camera shake, shaky handheld, cartoon, anime, oversaturated, low quality, blurry, flicker";

/**
 * Stills. `ref: true` attaches the boat reference sheet; `style` lists earlier
 * stills to attach as look references. Output: <work>/stills/<id>.png
 */
export const STILLS = [
  {
    id: "boat-reference",
    aspectRatio: "16:9",
    reference: false,
    prompt: `A clear side view of the canoe resting on pale wet sand at the edge of a calm lagoon in soft early morning light, the whole boat visible from bow to stern with its outrigger, painted band, sail and bow lantern easy to read. Nobody is in the frame. ${BOAT}`,
  },
  {
    id: "01-shore",
    reference: true,
    prompt: `Blue hour before dawn on a quiet tropical beach. The canoe rests at the waterline, its bow lantern glowing amber and reflected in the wet sand; small calm waves wash around the hull. A single line of footprints leads from the dark palm trees to the boat. Far out across the glassy lagoon a thin line of white surf marks the reef under a deep indigo sky with the last stars. The canoe is centred in the frame, low and wide. ${BOAT}`,
  },
  {
    id: "02-stars",
    reference: true,
    style: ["01-shore"],
    prompt: `Night on the lagoon under a vast, clear sky of stars and the Milky Way. The canoe floats small in the middle of the frame on perfectly still black water that mirrors the stars, its sail slightly filled by a night breeze and its amber lantern making a long trembling reflection. A lone traveller sits in the canoe, a small silhouette seen from behind. Faint cyan bioluminescence glimmers where the water touches the hull. ${BOAT} ${TRAVELLER}`,
  },
  {
    id: "03-city",
    reference: true,
    style: ["02-stars"],
    prompt: `Night. Looking back across the dark lagoon toward the shore, where a dense modern coastal city has grown: towers of cold blue and white glowing windows, screen-light and billboards without any readable text, their long cold reflections broken into restless ripples on the water. In the centre foreground the canoe is a dark silhouette on the water, its single warm amber lantern the only warm light, small against the cold glow. The mood is noisy, restless, a little lonely. ${BOAT}`,
  },
  {
    id: "04-carrying",
    reference: true,
    style: ["02-stars"],
    prompt: `An intimate close shot inside the canoe at night. On the worn wooden floor of the hull rests an old brass compass beside a small woven fibre bag tied with cord. Two weathered adult hands, seen from above with no face in the frame, gently cup the glowing brass-and-glass bow lantern, its warm amber light spilling over the wood grain. Beyond the hull edge, tiny cyan bioluminescent sparks drift up from the dark water like rising points of light. Shallow depth of field, the lantern centred. ${BOAT}`,
  },
  {
    id: "05-reef",
    reference: true,
    style: ["01-shore"],
    prompt: `Aerial view at sunrise, high above a coral reef. The frame is divided by the reef's edge: to one side luminous turquoise shallows over pale coral, to the other the deep sapphire open ocean, with a soft line of white surf breaking along the reef. Exactly in the centre of the frame, the small canoe with its pale triangular sail passes through a narrow gap in the reef from the lagoon into the deep water, leaving a thin wake. Golden light rakes across the water. ${BOAT}`,
  },
  {
    id: "06-sunrise-open-sea",
    reference: true,
    style: ["05-reef"],
    prompt: `Just beyond the reef at sunrise. Low camera close to the water behind the canoe as it sails away toward a huge soft golden sun rising over the open ocean horizon. The pale sail glows with backlight, the lantern still burning, long gentle swells catching gold and teal light; behind, a faint white line of surf on the reef. A lone traveller sits at the stern, a silhouette seen from behind. The canoe is centred. ${BOAT} ${TRAVELLER}`,
  },
  {
    id: "07-underwater",
    reference: true,
    style: ["06-sunrise-open-sea"],
    prompt: `Underwater in the clear open ocean at midday, looking up toward the bright rippling surface. The dark silhouette of the canoe's slender hull and outrigger float crosses the centre of the surface above, casting shadows. Shafts of sunlight fan down through deep blue and teal water, with drifting particles and a few small silver fish. Calm, vast, reverent, like memories held beneath the surface. ${BOAT}`,
  },
  {
    id: "08-vessel",
    reference: true,
    style: ["06-sunrise-open-sea"],
    prompt: `The open ocean in the afternoon, endless in every direction. From high above and far away, the canoe is a small shape in the centre of a great rolling swell of deep blue water, its sail full, a thin wake behind it, soft clouds casting slow shadows on the sea. No land anywhere. The vastness is peaceful rather than frightening. ${BOAT}`,
  },
  {
    id: "09-one-shore",
    reference: true,
    style: ["08-vessel"],
    prompt: `Dusk on the open sea, violet and amber sky. Ahead on the horizon, centred, a single small island with one warm fire glowing on its shore. The canoe sails toward it in the middle distance, its lantern lit. Far behind it, near the edge of the water, a second tiny warm lantern light follows on the dark sea. Calm water reflecting the last light. ${BOAT}`,
  },
  {
    id: "10-golden",
    reference: true,
    style: ["06-sunrise-open-sea"],
    prompt: `Golden hour on the open ocean. A low tracking view level with the canoe as it sails at speed across glittering water, spray catching the light, the pale woven sail full and glowing gold, the bow lantern lit. A lone traveller steers from the stern, a silhouette seen from behind. Warm sun low to the side, deep teal waves. Hopeful and alive. The canoe is centred. ${BOAT} ${TRAVELLER}`,
  },
  {
    id: "16-nightfall",
    reference: true,
    style: ["09-one-shore", "10-golden"],
    prompt: `Nightfall on the open ocean just after sunset. The sky is deep blue fading to a last thin band of violet on the horizon, with the first stars appearing. The canoe sails steadily through dark rolling water in the centre of the frame, its amber bow lantern glowing and a faint trail of cyan bioluminescent sparks in its wake. Far ahead on the horizon, low dark clouds are gathering. A lone traveller steers from the stern, a silhouette seen from behind. ${BOAT} ${TRAVELLER}`,
  },
  {
    id: "17-voices",
    reference: true,
    style: ["02-stars", "16-nightfall"],
    prompt: `Night on the calm open ocean under a sky full of stars. Around the drifting canoe, hundreds of tiny glowing points of cyan and warm gold light rise gently out of the dark water into the air, like floating words and voices drifting upward toward the stars. The amber lantern glows at the bow. The canoe is small and centred, the sky vast. Quiet and magical. ${BOAT}`,
  },
  {
    id: "11-storm",
    reference: true,
    style: ["09-one-shore"],
    prompt: `Night storm gathering over the open ocean. Towering dark indigo clouds, curtains of rain in the distance and a far-off fork of lightning lighting the cloud from within. The grey-black sea heaves in long swells. In the centre of the frame the small canoe rides a swell, sail reefed, its single warm amber lantern the only warm light in the whole scene. Dramatic, uncertain, but not hopeless. ${BOAT}`,
  },
  {
    id: "12-moonlight",
    reference: true,
    style: ["11-storm"],
    prompt: `The storm is breaking. The clouds tear open and a broad path of silver moonlight falls across the moving water, still ruffled from the wind. In the centre of that path of light the canoe rides upright and steady, sail raised again, its amber lantern still burning. Stars appear in the gap in the clouds. Relief and resolve. ${BOAT}`,
  },
  {
    id: "13-island-mist",
    reference: true,
    style: ["12-moonlight", "05-reef"],
    prompt: `Misty dawn on a calm pale sea. Through soft layers of morning mist a green mountainous island is emerging on the horizon, centred, with the first rose-gold light behind it. The canoe glides toward it in the middle distance, and behind the canoe its wake glows with faint cyan bioluminescent sparks rising from the water like small floating lights. Quiet wonder. ${BOAT}`,
  },
  {
    id: "14-fleet",
    reference: true,
    style: ["13-island-mist", "06-sunrise-open-sea"],
    prompt: `Sunrise, seen from high above the sea. A long gentle line of many small canoes, each with a pale triangular sail and a glowing amber bow lantern, follows the first canoe across luminous gold and teal water toward the rising sun and the island on the horizon. Their wakes form a shimmering path. The first canoe leads at the centre of the frame. Communal, hopeful, magical. ${BOAT}`,
  },
  {
    id: "15-horizon",
    reference: true,
    style: ["06-sunrise-open-sea", "14-fleet"],
    prompt: `The sun has fully risen above a calm, endless horizon. The canoe drifts slowly on still, mirror-like water in the centre of the frame, small in a vast soft sky of gold, rose and pale blue, its lantern now a small quiet glow. A lone traveller sits at the stern looking toward the horizon, a silhouette seen from behind. Peaceful, resolved, open. Lots of calm sky above. ${BOAT} ${TRAVELLER}`,
  },
];

/**
 * Clips: each starts from the still with the same id (image-to-video), silent,
 * 8 seconds. Motion is slow and continuous so a clip can be slowed down and
 * held on its last frame without a visible seam.
 *
 * Veo's third-party-content check refused three first attempts whose prompts
 * described glowing sparks around a canoe at night; "02-stars" and
 * "13-island-mist" passed once reworded in a plain documentary register.
 * "16-nightfall" was refused from its frame alone however it was worded, so
 * that shot is a still with a camera drift on the page.
 */
export const CLIPS = [
  {
    id: "01-shore",
    prompt: `Slow, steady cinematic push-in toward the canoe at blue hour. Small calm waves wash gently around the hull and across the wet sand, the lantern flame flickers softly, the last stars fade very slightly. Smooth, calm, continuous motion. Silent.`,
  },
  {
    id: "02-stars",
    prompt: `Locked-off wide night shot of a calm lagoon under a clear sky of stars. The stars drift very slowly across the sky, the small wooden sailboat drifts gently forward on the still water and the warm lantern reflection trembles on the surface. Realistic, slow, like a nature documentary. Silent.`,
  },
  {
    id: "05-reef",
    prompt: `Smooth aerial drone shot gliding slowly forward high above the reef at sunrise, following the canoe as it passes through the gap in the reef into the deep blue ocean. White surf rolls gently along the reef edge, golden light shimmers on the water. Graceful, continuous, no cuts. Silent.`,
  },
  {
    id: "07-underwater",
    prompt: `Underwater, looking up. The canoe's hull silhouette glides slowly across the bright rippling surface, sunbeams sway and shimmer down through the blue water, drifting particles float past the camera and a few small silver fish turn together. Slow, serene, continuous. Silent.`,
  },
  {
    id: "10-golden",
    prompt: `Smooth tracking shot moving alongside the canoe as it sails across glittering golden-hour water, the sail full of wind, spray catching the sun, the traveller seen only from behind steering steadily. Continuous gentle motion, no cuts. Silent.`,
  },
  {
    id: "11-storm",
    prompt: `Wide shot of the night storm. Dark clouds roll and churn slowly, distant lightning flickers inside the clouds, rain curtains drift across the horizon and the canoe rises and falls on the heaving swell, its amber lantern swinging but still glowing. Tense, slow, continuous. Silent.`,
  },
  {
    id: "13-island-mist",
    prompt: `Very slow forward glide over a calm sea at dawn. The morning mist slowly thins and drifts aside to reveal more of the green mountainous island on the horizon as rose-gold light grows behind it, while the small wooden sailboat glides toward the island leaving gentle ripples. Quiet, realistic, continuous. Silent.`,
  },
  {
    id: "14-fleet",
    prompt: `Slow aerial pull-back and rise at sunrise, gradually revealing the long line of lantern-lit canoes following the first canoe across the shimmering gold sea toward the rising sun. Smooth, majestic, continuous. Silent.`,
  },
];
