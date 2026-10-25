import 'package:flutter/widgets.dart';
import 'package:indigen_world_mobile/core/support_channels.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:share_plus/share_plus.dart';

/// The public page for one dictionary word.
///
/// venacula.com reads the same `dictionaryEntries` collection the app does and
/// opens `?entry=<id>` on that word, so a shared word lands somewhere anybody
/// can read it, with or without the app.
Uri dictionaryEntryWebLink(String entryId) =>
    Uri.https('www.venacula.com', '/', {'entry': entryId});

/// What sharing a dictionary word sends.
///
/// The example sentence travels with its credit when it owes one: Tatoeba's
/// licence asks for attribution wherever the sentence is shown, and a chat
/// message is somewhere it is shown.
String dictionaryShareText(DictionaryEntry entry) {
  final meaning = entry.primaryTranslation.trim();
  final lines = <String>[
    meaning.isEmpty ? entry.headword : '${entry.headword} — $meaning',
  ];
  final example = entry.example.trim();
  if (example.isNotEmpty) {
    final translation = entry.exampleTranslation.trim();
    lines.add(translation.isEmpty ? '“$example”' : '“$example” — $translation');
    if (entry.exampleCredit case final credit?) lines.add('($credit)');
  }
  lines
    ..add('')
    ..add('Kasem dictionary: ${dictionaryEntryWebLink(entry.id)}');
  return lines.join('\n');
}

/// What sharing a song, a reading or a work from the collection sends.
///
/// The app is where these are heard, so the link is the app's listing.
String collectionShareText({
  required String title,
  required String creator,
  required CollectionKind kind,
}) {
  final what = switch (kind) {
    CollectionKind.music => 'a song',
    CollectionKind.audiobooks => 'a reading',
    CollectionKind.literature => 'a work',
    CollectionKind.video => 'a film',
    CollectionKind.dictionary => 'an entry',
  };
  final by = creator.trim().isEmpty ? '' : ' by ${creator.trim()}';
  final verb = switch (kind) {
    CollectionKind.music || CollectionKind.audiobooks => 'Listen',
    CollectionKind.video => 'Watch',
    _ => 'Read',
  };
  return '“${title.trim()}”$by — $what in the Indigen World archive.\n'
      '$verb in the Indigen World app: ${SupportChannels.playListing}';
}

/// Opens the share sheet with [text], and says so if it could not.
Future<void> shareText(BuildContext context, String text) async {
  try {
    await Share.share(text);
  } on Object {
    if (context.mounted) showGlassToast(context, 'Could not share this.');
  }
}
