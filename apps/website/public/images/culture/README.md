# Cultural imagery on the public website

## Photographs

The header carousel and homepage stories use real, openly licensed
photographs of Kassena (Kasem-speaking) places and people. Their manifest,
credits and limits are in [`photos/README.md`](photos/README.md); runtime data
is in `public/culture-photos.js`.

On 31 October 2026 the earlier banner assets were removed from this folder:
the AI-generated paper-collage character sheet and landscape (`original/`),
and three photographs of Ghanaian crafts from outside the Kasem-speaking area
(kente weaving, Bolgatanga basket weavers, northern Ghana baskets). The
Tiébélé photograph that was here (`tiebele-*.webp`) is now
`photos/tiebele-walls-*.webp`. The illustration sources remain in
`assets/brand/indigen-world/culture-banner/`.

## Map

`africa-ghana.svg` contains 51 African country outlines from the public-domain
[Natural Earth 110m country dataset](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson),
projected equirectangularly and styled for Indigen World. Ghana is highlighted;
the northern Ghana marker is indicative, not a boundary of the Kasem language
or a person's location. `africa-ghana-night.svg` is the same geometry recoloured
for the homepage's night-blue band (Ghana in the sun colour).
