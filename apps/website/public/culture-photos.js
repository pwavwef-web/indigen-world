// Shared by the React site (CultureHero, homepage sections) and the standalone
// guide generators (guide-banner.js), so it stays plain JavaScript in public/.
// Every entry is a real, openly licensed photograph of a Kassena (Kasem-speaking)
// place or event from Wikimedia Commons. Subjects and places come from each
// file's Commons description; nothing is generated or retouched. The manifest
// lives in images/culture/photos/README.md.
const BASE = '/images/culture/photos/';
const srcset = (stem, widths) => widths.map(width => `${BASE}${stem}-${width}.webp ${width}w`).join(', ');
const photo = (entry, widths = [960, 1600, 2400]) => ({
  ...entry,
  image: `${BASE}${entry.stem}-${widths[Math.min(1, widths.length - 1)]}.webp`,
  srcset: srcset(entry.stem, widths),
});

const BY_SA_4 = { licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };

export const PHOTOS = {
  dancers: photo({
    id: 'dancers', stem: 'kassena-dancers', label: 'Dance',
    title: 'Dancers in Kassena country', place: 'Tiébélé, Burkina Faso · 2024',
    alt: 'Dancers in red cowrie-shell caps, striped smocks and embroidered sashes stand together beside a large drum.',
    author: 'Zaongo Christian Marie Michel', ...BY_SA_4,
    source: 'https://commons.wikimedia.org/wiki/File:Ti%C3%A9b%C3%A9l%C3%A9.jpg',
    width: 2400, height: 1347, position: '62% 30%',
  }),
  pattern: photo({
    id: 'pattern', stem: 'tiebele-pattern', label: 'Walls',
    title: 'Painted walls of a Kassena home', place: 'Tiébélé, Burkina Faso',
    alt: 'A wall painted in bold black and white triangles, zigzags and dotted shapes around a wooden shuttered window, with painted lettering above it.',
    author: 'Alexander Leisser', ...BY_SA_4,
    source: 'https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_07.jpg',
    width: 2400, height: 1591, position: '70% 40%',
  }),
  paga: photo({
    id: 'paga', stem: 'paga-crocodile', label: 'Paga',
    title: 'The crocodile pond at Paga', place: 'Paga, Upper East Region, Ghana',
    alt: 'A smiling man in a green T-shirt crouches in the shade and rests his hand on a large crocodile lying on the ground.',
    author: 'Knowledge and philosophy', ...BY_SA_4,
    source: 'https://commons.wikimedia.org/wiki/File:Tapping_of_crocodile_at_Paga_crocodile_pond.jpg',
    width: 2400, height: 1600, position: '64% 40%',
  }),
  walls: photo({
    id: 'walls', stem: 'tiebele-walls', label: 'Homes',
    title: 'A painted Kassena compound', place: 'Tiébélé, Burkina Faso',
    alt: 'Earthen compound walls painted with black and white chevrons, checks and triangles, with figures drawn among the patterns.',
    author: 'Alexander Leisser', ...BY_SA_4,
    source: 'https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg',
    width: 2400, height: 1591, position: '58% 50%',
  }),
  basilica: photo({
    id: 'basilica', stem: 'navrongo-basilica', label: 'Navrongo',
    title: 'Our Lady of Seven Sorrows Basilica', place: 'Navrongo, Upper East Region, Ghana',
    alt: 'An earth-brown church with a square tower, blue doors and narrow white-framed windows on a wide open square.',
    author: 'Mwintirew', ...BY_SA_4,
    source: 'https://commons.wikimedia.org/wiki/File:Basilica_of_Our_Lady_of_Seven_Sorrows.jpg',
    width: 1500, height: 1000, position: '62% 55%',
  }, [960, 1500]),
  compound: photo({
    id: 'compound', stem: 'tiebele-compound', label: 'Courtyard',
    title: 'Round houses around a courtyard', place: 'Tiébélé, Burkina Faso',
    alt: 'Round earthen houses, one painted with dark geometric panels, stand around a swept courtyard under green trees.',
    author: 'WILLAV-FR', ...BY_SA_4,
    source: 'https://commons.wikimedia.org/wiki/File:BF-Ti%C3%A9b%C3%A9l%C3%A9-Maisons.jpg',
    width: 2400, height: 1800, position: '45% 60%',
  }),
  decoration: photo({
    id: 'decoration', stem: 'tiebele-decoration', label: 'Pattern',
    title: 'Traditional house decoration', place: 'Tiébélé, Burkina Faso',
    alt: 'Curved house walls under a thatched roof, painted in rows of black and cream diamonds, triangles and chevrons, with a flowering plant in front.',
    author: 'c.hug', licence: 'CC BY-SA 2.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Tiebele_traditional_house_decoration_Burkina_Faso.jpg',
    width: 2400, height: 1800, position: '50% 45%',
  }),
  editathon: photo({
    id: 'editathon', stem: 'navrongo-editathon', label: 'Knowledge',
    title: 'Wikipedia edit-a-thon', place: 'UDS Navrongo, Ghana · 2020',
    alt: 'Two young men stand in a lecture hall looking at a laptop together during a Wikipedia editing event.',
    author: 'Amuzujoe', ...BY_SA_4,
    source: 'https://commons.wikimedia.org/wiki/File:Navrongo_Uds6.jpg',
    width: 2400, height: 1602, position: '55% 40%',
  }),
};

/** Header carousel order: people, craft, place, home, landmark. */
export const CULTURE_PHOTOS = [PHOTOS.dancers, PHOTOS.pattern, PHOTOS.paga, PHOTOS.walls, PHOTOS.basilica];
