// Retain the module/export name for the standalone guide generators.
// Every scene reuses the same original character sheet; these are fictional people.
export const CULTURE_PHOTOS = [
  { id: 'storytelling', title: 'Knowledge passes between us', place: 'Storytelling', position: '0% 100%' },
  { id: 'learning', title: 'Every word is a beginning', place: 'Learning together', position: '50% 100%' },
  { id: 'creating', title: 'The next chapter is shared', place: 'Creating together', position: '100% 100%' },
].map(scene => ({ ...scene, image: '/images/culture/original/community-characters-v2.webp',
  alt: 'Original paper-collage illustration of ten fictional people sharing stories, books, notebooks and a recording',
  author: 'Indigen World', source: '', width: 2172, height: 724 }));
