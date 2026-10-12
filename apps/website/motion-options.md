# Homepage motion design study

Requested October 12, 2026. The user corrected the reference to the
[Endangered Languages Project](https://endangeredlanguages.com/) and asked
to compare all three options before choosing an implementation.

Run the website development server and open `/motion-options.html`:

```sh
npm run dev --workspace @indigen-world/website -- --host 127.0.0.1 --port 5174
```

The standalone preview offers an animated opening banner, an Africa map with
three rotating cards about the Kasem pilot, and cards that reveal and stack
while scrolling. It is not wired into the public homepage or the production
build entry. No deployment or release announcement has been made.

The artwork comes from the existing website `public/images` illustrations.
No ELP artwork, video, copy, or photographs were copied. These are adapted
concepts, not exact reproductions of ELP's effects; its opening hero uses a
looping video, while this lightweight concept uses image transitions.

Map paths are embedded from Natural Earth's 110m countries, sourced from
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
(public-domain geographic data), projected with a simple equirectangular
projection. The Northern Ghana marker is illustrative and does not identify
a person's location. All three cards refer to the same pilot.

Verified in the local browser: slide and story navigation, pause/resume,
loaded artwork, 51 country paths, scroll reveals, and no horizontal overflow
at desktop and 390px mobile widths. JavaScript syntax checked. Reduced-motion
support is implemented; OS preference switching has not been exercised.

Choose buttons only mark the local preview. The user must communicate their
choice in chat before the selected design is integrated into the homepage.
