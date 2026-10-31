export interface CulturePhoto {
  id: string;
  stem: string;
  /** Short name for carousel indicators. */
  label: string;
  title: string;
  place: string;
  alt: string;
  author: string;
  licence: string;
  licenceUrl: string;
  source: string;
  /** CSS object-position keeping the subject in frame when cropped. */
  position: string;
  image: string;
  srcset: string;
  width: number;
  height: number;
}
export const PHOTOS: Readonly<Record<'dancers' | 'pattern' | 'paga' | 'walls' | 'basilica' | 'compound' | 'decoration' | 'editathon', CulturePhoto>>;
export const CULTURE_PHOTOS: readonly CulturePhoto[];
