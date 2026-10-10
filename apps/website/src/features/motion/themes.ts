export type MotionTheme = 'weave' | 'roots' | 'network' | 'language' | 'review' | 'paths' | 'care' | 'message' | 'community' | 'story' | 'discovery' | 'compass' | 'complete';

/** Abstract editorial drawings, not reproductions of community-owned symbols. */
export function themeForPage(path: string): MotionTheme {
  const themes: Record<string, MotionTheme> = {
    home: 'weave', about: 'roots', ecosystem: 'network', 'project-kassena': 'roots',
    dictionary: 'language', learn: 'language', contribute: 'review', 'get-involved': 'paths',
    'impact-governance': 'care', contact: 'message', privacy: 'care', terms: 'story',
    communities: 'community', post: 'story', 'ads/payment-complete': 'complete',
    'founding-tester-claim-7q4m9x2k': 'complete',
    labs: 'discovery', 'labs/experiments': 'network', 'labs/kasem-practice': 'language',
    'labs/cultural-story': 'story', 'labs/culture-quest': 'compass', 'labs/word-trail': 'compass',
    'labs/activity': 'review', 'labs/updates': 'message', 'labs/admin': 'care',
  };
  return themes[path] ?? 'compass';
}
