/// Verified against the production Play listing and website ContactPage.
/// Keep these public destinations together rather than inventing per-screen contacts.
abstract final class SupportChannels {
  static const email = 'hi@indigenworld.com';
  static final website = Uri.parse('https://indigenworld.com/contact');
  static final playListing = Uri.parse(
    'https://play.google.com/store/apps/details?id=com.indigenworld.indigen',
  );
}
