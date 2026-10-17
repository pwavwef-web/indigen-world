/**
 * Labs photography. Every entry is a real, openly licensed photograph whose
 * subject and place come from its Wikimedia Commons description; nothing here
 * is generated. Credits and licence links render in the Labs footer, and the
 * full manifest lives in ./media/README.md.
 */
import dancers640 from "./media/dancers-640.webp";
import dancers1080 from "./media/dancers-1080.webp";
import dancers1600 from "./media/dancers-1600.webp";
import walls640 from "./media/tiebele-walls-640.webp";
import walls1080 from "./media/tiebele-walls-1080.webp";
import walls1600 from "./media/tiebele-walls-1600.webp";
import editathon640 from "./media/navrongo-editathon-640.webp";
import editathon1080 from "./media/navrongo-editathon-1080.webp";
import editathon1600 from "./media/navrongo-editathon-1600.webp";
import paga640 from "./media/paga-photowalk-640.webp";
import paga1080 from "./media/paga-photowalk-1080.webp";
import paga1600 from "./media/paga-photowalk-1600.webp";
import basilica640 from "./media/navrongo-basilica-640.webp";
import basilica1080 from "./media/navrongo-basilica-1080.webp";
import basilica1500 from "./media/navrongo-basilica-1500.webp";
import laptop640 from "./media/editathon-laptop-640.webp";
import laptop1080 from "./media/editathon-laptop-1080.webp";
import pattern640 from "./media/wall-pattern-640.webp";
import pattern1080 from "./media/wall-pattern-1080.webp";

export interface LabsPhoto {
  id: string;
  /** Short name for slide indicators. */
  label: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
  /** Scene and place, as recorded by the photographer on Commons. */
  caption: string;
  /** CSS object-position keeping the subject in frame when cropped. */
  focus: string;
  credit: string;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
}

const set = (...entries: [string, number][]) =>
  entries.map(([url, width]) => `${url} ${width}w`).join(", ");

export const HERO_PHOTOS: LabsPhoto[] = [
  {
    id: "dancers",
    label: "Dance",
    src: dancers1080,
    srcSet: set([dancers640, 640], [dancers1080, 1080], [dancers1600, 1600]),
    width: 1600,
    height: 898,
    alt: "Dancers in red cowrie-shell caps, striped smocks and embroidered sashes stand together beside a large drum.",
    caption: "Dancers in Kassena country · Tiébélé, Burkina Faso, 2024",
    focus: "38% 30%",
    credit: "Zaongo Christian Marie Michel",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ti%C3%A9b%C3%A9l%C3%A9.jpg",
  },
  {
    id: "walls",
    label: "Craft",
    src: walls1080,
    srcSet: set([walls640, 640], [walls1080, 1080], [walls1600, 1600]),
    width: 1600,
    height: 1061,
    alt: "Earthen compound walls painted with black and white chevrons, checks and triangles, with figures drawn among the patterns.",
    caption: "Painted compound walls · Tiébélé, a Kassena village in Burkina Faso",
    focus: "55% 50%",
    credit: "Alexander Leisser",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg",
  },
  {
    id: "editathon",
    label: "Knowledge",
    src: editathon1080,
    srcSet: set([editathon640, 640], [editathon1080, 1080], [editathon1600, 1600]),
    width: 1600,
    height: 1068,
    alt: "Two participants work on laptops at wooden desks during a Wikipedia editing event.",
    caption: "Art+Feminism Wikipedia edit-a-thon · UDS Navrongo, Ghana, 2020",
    focus: "45% 40%",
    credit: "Amuzujoe",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Navrongo_Uds14.jpg",
  },
  {
    id: "paga",
    label: "Place",
    src: paga1080,
    srcSet: set([paga640, 640], [paga1080, 1080], [paga1600, 1600]),
    width: 1600,
    height: 1067,
    alt: "Smiling volunteers in green Wikimedia shirts gently hold the tail of a crocodile resting under shade trees.",
    caption: "Wiki Loves Earth photowalk · Paga crocodile pond, Ghana, 2025",
    focus: "62% 45%",
    credit: "Knowledge and philosophy",
    licence: "CC0 1.0",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Wiki_Loves_Earth_2025_Ghana_team_at_Paga_crocodile_pond.jpg",
  },
  {
    id: "basilica",
    label: "Architecture",
    src: basilica1080,
    srcSet: set([basilica640, 640], [basilica1080, 1080], [basilica1500, 1500]),
    width: 1500,
    height: 1000,
    alt: "An earth-brown church with a square tower, blue doors and narrow white-framed windows on a wide open square.",
    caption: "Cathedral Basilica of Our Lady of Seven Sorrows · Navrongo, Ghana",
    focus: "62% 55%",
    credit: "Mwintirew",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Basilica_of_Our_Lady_of_Seven_Sorrows.jpg",
  },
];

export const PURPOSE_PHOTOS: LabsPhoto[] = [
  {
    id: "editathon-laptop",
    label: "Contribution",
    src: laptop1080,
    srcSet: set([laptop640, 640], [laptop1080, 1080]),
    width: 1080,
    height: 721,
    alt: "Two participants look at one laptop together in a study hall during a Wikipedia editing event.",
    caption: "Art+Feminism Wikipedia edit-a-thon · UDS Navrongo, Ghana, 2020",
    focus: "50% 45%",
    credit: "Amuzujoe",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Navrongo_Uds6.jpg",
  },
  {
    id: "wall-pattern",
    label: "Pattern",
    src: pattern1080,
    srcSet: set([pattern640, 640], [pattern1080, 1080]),
    width: 1080,
    height: 810,
    alt: "A thatched house and earthen wall painted with bold black triangles, diamonds and chevrons beside a flowering shrub.",
    caption: "Traditional house decoration · Tiébélé, Burkina Faso",
    focus: "60% 40%",
    credit: "c.hug",
    licence: "CC BY-SA 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tiebele_traditional_house_decoration_Burkina_Faso.jpg",
  },
];

export const ALL_PHOTOS = [...HERO_PHOTOS, ...PURPOSE_PHOTOS];
export const photo = (id: string) => ALL_PHOTOS.find((p) => p.id === id)!;
