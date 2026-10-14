# Labs photography manifest

Sourced 13 October 2026 for the Labs redesign, with the project owner's
approval to download these specific files. All are real photographs from
Wikimedia Commons. None are generated or retouched; they were resized and
re-encoded to WebP (`quality` 58–74), which drops embedded EXIF/GPS metadata.
Subjects and places are taken from each file's Commons description. Nothing
about the people shown (names, ethnicity, community) is inferred beyond that
description. Runtime data, alt text and focal points live in `../labs-media.ts`;
credits render in the Labs footer under **Photo credits**.

The CC BY-SA files require attribution and share-alike for adaptations. The
resized copies keep the same licence.

| Files | Verified subject / place (from Commons) | Photographer | Licence | Source | Placement |
| --- | --- | --- | --- | --- | --- |
| `dancers-{640,1080,1600}.webp` | "Danseurs en pays kasena" — dancers in Kassena country; file titled Tiébélé (Burkina Faso), dated 2024-08-17 | Zaongo Christian Marie Michel | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [File:Tiébélé.jpg](https://commons.wikimedia.org/wiki/File:Ti%C3%A9b%C3%A9l%C3%A9.jpg) | Hero slide 1 (preloaded with high priority) |
| `tiebele-walls-{640,1080,1600}.webp` | "Tiebele village of the Kassena people in Burkina Faso", 2016 | Alexander Leisser | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [File:Tiebele village in Burkina Faso 04.jpg](https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg) | Hero slide 2 |
| `navrongo-editathon-{640,1080,1600}.webp` | "Art and Feminism 2020 editathons in Ghana at UDS, Navrongo" | Amuzujoe | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [File:Navrongo Uds14.jpg](https://commons.wikimedia.org/wiki/File:Navrongo_Uds14.jpg) | Hero slide 3 |
| `paga-photowalk-{640,1080,1600}.webp` | "Wiki Loves Earth 2025 Ghana team at Paga crocodile pond for photowalk" | Knowledge and philosophy | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [File:Wiki Loves Earth 2025 Ghana team at Paga crocodile pond.jpg](https://commons.wikimedia.org/wiki/File:Wiki_Loves_Earth_2025_Ghana_team_at_Paga_crocodile_pond.jpg) | Hero slide 4 |
| `navrongo-basilica-{640,1080,1500}.webp` | Basilica of Our Lady of Seven Sorrows, Navrongo (the photo already bundled in `apps/mobile/assets/places`) | Mwintirew | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [File:Basilica of Our Lady of Seven Sorrows.jpg](https://commons.wikimedia.org/wiki/File:Basilica_of_Our_Lady_of_Seven_Sorrows.jpg) | Hero slide 5 |
| `editathon-laptop-{640,1080}.webp` | "Art and Feminism 2020 editathons in Ghana at UDS, Navrongo" | Amuzujoe | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [File:Navrongo Uds6.jpg](https://commons.wikimedia.org/wiki/File:Navrongo_Uds6.jpg) | Purpose section, main photo |
| `wall-pattern-{640,1080}.webp` | "Traditional Tiebele house decoration, Burkina Faso" | c.hug | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | [File:Tiebele traditional house decoration Burkina Faso.jpg](https://commons.wikimedia.org/wiki/File:Tiebele_traditional_house_decoration_Burkina_Faso.jpg) | Purpose section inset; Cultural Story Builder card backdrop |

## Limits and open items

- No community-approved Indigen World photography exists in the repository
  yet. These public photographs document Kassena places and public events;
  they are not Indigen World community submissions. Replace or add slides as
  approved community photography becomes available (edit `HERO_PHOTOS`).
- The edit-a-thon and photowalk photos show identifiable people who were
  photographed at public events and published under open licences by the
  photographers. If anyone shown asks for removal, delete the slide.
- The existing `/images/hero-home.jpg`, `header-*.jpg` and
  `privacy-stewardship.jpg` website artwork is generated illustration and is
  deliberately not used as documentary imagery here.
