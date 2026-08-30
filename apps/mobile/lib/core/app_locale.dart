import 'dart:ui' show Locale;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the member's reading language is kept, when they have chosen one.
const localePreferenceKey = 'indigen_locale_v1';

/// The language the app reads in.
///
/// `null` is the default, and it means **follow the device**. That is the whole
/// point: Kassena live in francophone Burkina Faso and across a francophone
/// diaspora, and somebody whose phone is already set to French should open a
/// French app without being asked, without a setup step, and without finding a
/// setting they did not know to look for.
///
/// A stored value only ever exists for the member who wanted something *other*
/// than their device language — a Ghanaian phone in English used by somebody who
/// reads French more comfortably, or the reverse. Choosing "Match my device"
/// again removes the value rather than storing a second opinion about it.
///
/// Read in `main()` and handed to the [ProviderScope] as an override, the same
/// way the appearance choice is: resolving it after the first frame would show a
/// French member an English screen on the way to their own language.
final localeProvider = NotifierProvider<LocaleController, Locale?>(
  LocaleController.new,
);

class LocaleController extends Notifier<Locale?> {
  @override
  Locale? build() => null;

  Future<void> setLocale(Locale? locale) async {
    if (state == locale) return;
    state = locale;
    final preferences = await SharedPreferences.getInstance();
    if (locale == null) {
      await preferences.remove(localePreferenceKey);
    } else {
      await preferences.setString(localePreferenceKey, locale.languageCode);
    }
  }
}

/// The languages the app can be read in, in the order Settings offers them.
///
/// Taken from the generated localisations rather than written out here, so
/// adding an `app_xx.arb` adds a language to the picker and nothing else has to
/// be remembered.
List<Locale> get supportedAppLocales => AppLocalizations.supportedLocales;

/// The stored choice, or null for "follow the device" — which is also what a
/// first launch and a failed read both mean.
Future<Locale?> readStoredLocale() async {
  try {
    final preferences = await SharedPreferences.getInstance();
    final stored = preferences.getString(localePreferenceKey);
    if (stored == null || stored.isEmpty) return null;
    // A language that has since been dropped from the app falls back to the
    // device rather than to a locale with no translations behind it.
    for (final locale in supportedAppLocales) {
      if (locale.languageCode == stored) return locale;
    }
    return null;
  } on Object {
    return null;
  }
}

/// What each language is called in Settings.
///
/// Every language is named **in itself** — `Français`, not `French`. Somebody
/// looking for their own language is scanning for the word they would use for
/// it, and they may not be able to read the list it is sitting in. That is why
/// these are not translated strings: they are the same in every locale.
///
/// "Follow the device" is not a language and is not here; it is a translated
/// string the caller takes from the localisations.
String languageEndonym(Locale locale) => switch (locale.languageCode) {
  'en' => 'English',
  'fr' => 'Français',
  _ => locale.languageCode.toUpperCase(),
};
