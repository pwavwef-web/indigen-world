# Kassena photographs on the public website

Selected 31 October 2026 for the blue redesign of the public website. All are
real photographs from Wikimedia Commons of Kassena (Kasem-speaking) places and
public events in northern Ghana and southern Burkina Faso. None are generated
or retouched. Five of them were already approved by the project owner for the
Labs redesign (see `src/features/labs/media/README.md`); three are new
(`tiebele-pattern`, `paga-crocodile`, `tiebele-compound`).

Changes: Commons 2400px thumbnails (the basilica's 1500px original) resized
to 960/1600/2400px WebP. Re-encoding drops EXIF/GPS metadata. The page adds
responsive cropping, a blue gradient overlay and slow movement; the
photographic content is not altered. Subjects and places come from each
file's Commons description; nothing about the people shown is inferred beyond
it. The CC BY-SA licences require attribution and share-alike; the resized
copies keep the same licence.

Runtime data (alt text, captions, focal points, credits) lives in
`public/culture-photos.js`. The header carousel shows each photograph's
place, photographer, licence link and source link while it is on screen.

| Stem | Subject / place (from Commons) | Photographer | Licence | Source | Used in |
| --- | --- | --- | --- | --- | --- |
| `kassena-dancers` | "Danseurs en pays kasena", Tiébélé, Burkina Faso, 2024 | Zaongo Christian Marie Michel | CC BY-SA 4.0 | [File:Tiébélé.jpg](https://commons.wikimedia.org/wiki/File:Ti%C3%A9b%C3%A9l%C3%A9.jpg) | Header slide 1 |
| `tiebele-pattern` | "Tiebele village of the Kassena people in Burkina Faso" | Alexander Leisser | CC BY-SA 4.0 | [File:Tiebele village in Burkina Faso 07.jpg](https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_07.jpg) | Header slide 2 |
| `paga-crocodile` | "Tapping of crocodile at Paga crocodile pond" | Knowledge and philosophy | CC BY-SA 4.0 | [File:Tapping of crocodile at Paga crocodile pond.jpg](https://commons.wikimedia.org/wiki/File:Tapping_of_crocodile_at_Paga_crocodile_pond.jpg) | Header slide 3 |
| `tiebele-walls` | "Tiebele village of the Kassena people in Burkina Faso", 2016 | Alexander Leisser | CC BY-SA 4.0 | [File:Tiebele village in Burkina Faso 04.jpg](https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg) | Header slide 4 |
| `navrongo-basilica` | Basilica of Our Lady of Seven Sorrows, Navrongo | Mwintirew | CC BY-SA 4.0 | [File:Basilica of Our Lady of Seven Sorrows.jpg](https://commons.wikimedia.org/wiki/File:Basilica_of_Our_Lady_of_Seven_Sorrows.jpg) | Header slide 5 |
| `tiebele-compound` | Tiébélé houses, theme "Home + Habitat in Africa" | WILLAV-FR | CC BY-SA 4.0 | [File:BF-Tiébélé-Maisons.jpg](https://commons.wikimedia.org/wiki/File:BF-Ti%C3%A9b%C3%A9l%C3%A9-Maisons.jpg) | Homepage "starting point" story |
| `tiebele-decoration` | "Traditional Tiebele house decoration, Burkina Faso" | c.hug | CC BY-SA 2.0 | [File:Tiebele traditional house decoration Burkina Faso.jpg](https://commons.wikimedia.org/wiki/File:Tiebele_traditional_house_decoration_Burkina_Faso.jpg) | Homepage stories and community band |
| `navrongo-editathon` | "Art and Feminism 2020 editathons in Ghana at UDS, Navrongo" | Amuzujoe | CC BY-SA 4.0 | [File:Navrongo Uds6.jpg](https://commons.wikimedia.org/wiki/File:Navrongo_Uds6.jpg) | Homepage "share your knowledge" story |

## Limits

- These public photographs document Kassena places and public events. They
  are not Indigen World community submissions. Replace or add slides as
  community-approved photography becomes available (edit `CULTURE_PHOTOS`).
- The Paga and Navrongo edit-a-thon photographs show identifiable people
  photographed at public places and events and published under open licences.
  If anyone shown asks for removal, delete that photograph.
- Tiébélé is in Burkina Faso; Paga and Navrongo are in Ghana's Upper East
  Region. Captions keep the country so the two sides of the Kasem-speaking
  area are not merged.
