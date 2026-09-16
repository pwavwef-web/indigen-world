import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft_store.dart';
import 'package:indigen_world_mobile/features/explore/create_reel_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// The disclosure that travels with generated media wherever it goes next.
const kawuriAiDisclosure =
    'AI-generated with Kawuri on Indigen World. This is generated media, not a record of a real person, place or event.';

/// The label for an action id the backend sends.
String kawuriActionLabel(String action) => switch (action) {
  'play' => 'Play',
  'download' => 'Save to device',
  'share' => 'Share',
  'regenerate' => 'Regenerate',
  'edit_prompt' => 'Edit prompt',
  'use_in_contribution' => 'Use in a contribution',
  'use_as_reel_cover' => 'Use as a reel cover',
  'use_in_reel' => 'Use in a reel',
  'delete' => 'Delete',
  'cancel' => 'Cancel',
  'retry' => 'Try again',
  'ask_follow_up' => 'Ask a follow-up',
  _ => action,
};

IconData kawuriActionIcon(String action) => switch (action) {
  'play' => Icons.play_arrow_rounded,
  'download' => Icons.download_rounded,
  'share' => Icons.ios_share_rounded,
  'regenerate' || 'retry' => Icons.refresh_rounded,
  'edit_prompt' => Icons.edit_outlined,
  'use_in_contribution' => Icons.volunteer_activism_outlined,
  'use_as_reel_cover' => Icons.photo_outlined,
  'use_in_reel' => Icons.movie_creation_outlined,
  'delete' => Icons.delete_outline_rounded,
  'cancel' => Icons.stop_circle_outlined,
  'ask_follow_up' => Icons.question_answer_outlined,
  _ => Icons.more_horiz_rounded,
};

/// Downloads a creation's file through its signed link into the app's
/// temporary folder.
///
/// A fresh link is fetched when the one in hand is missing: they last half an
/// hour, and a library opened in the morning should still share at night.
Future<File> kawuriDownloadOutput(
  WidgetRef ref,
  KawuriCreation creation,
) async {
  var media = creation.primaryOutput;
  if (media?.downloadUrl == null && media?.url == null) {
    final repository = ref.read(kawuriMediaRepositoryProvider);
    if (repository == null) {
      throw const KawuriMediaException('NETWORK', 'Kawuri is offline.');
    }
    media = (await repository.task(creation.id)).primaryOutput;
  }
  final link = media?.downloadUrl ?? media?.url;
  if (media == null || link == null) {
    throw const KawuriMediaException(
      'STORAGE_FAILED',
      'This file could not be opened just now. Try again shortly.',
    );
  }
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 20);
  try {
    final request = await client.getUrl(Uri.parse(link));
    final response = await request.close();
    if (response.statusCode != 200) {
      throw const KawuriMediaException(
        'STORAGE_FAILED',
        'This file could not be downloaded. Try again shortly.',
      );
    }
    final directory = await getTemporaryDirectory();
    final extension = media.isVideo
        ? 'mp4'
        : media.mimeType.split('/').last.replaceAll('jpeg', 'jpg');
    final file = File(
      '${directory.path}${Platform.pathSeparator}kawuri-${creation.id}.$extension',
    );
    await response.pipe(file.openWrite());
    return file;
  } on KawuriMediaException {
    rethrow;
  } on Object {
    throw const KawuriMediaException(
      'NETWORK',
      'This file could not be downloaded. Check your connection and try again.',
    );
  } finally {
    client.close(force: true);
  }
}

/// Saves the creation somewhere the member chooses, through the system's own
/// save dialog.
Future<void> kawuriSaveToDevice(
  BuildContext context,
  WidgetRef ref,
  KawuriCreation creation,
) async {
  try {
    final file = await kawuriDownloadOutput(ref, creation);
    final bytes = await file.readAsBytes();
    final name = file.uri.pathSegments.last;
    final saved = await FilePicker.platform.saveFile(
      dialogTitle: 'Save your Kawuri creation',
      fileName: name,
      bytes: Uint8List.fromList(bytes),
    );
    if (context.mounted && saved != null) {
      showGlassToast(context, 'Saved.', icon: Icons.check_rounded);
    }
  } on KawuriMediaException catch (error) {
    if (context.mounted) showGlassToast(context, error.message);
  } on Object {
    if (context.mounted) {
      showGlassToast(context, 'The file could not be saved on this device.');
    }
  }
}

Future<void> kawuriShare(
  BuildContext context,
  WidgetRef ref,
  KawuriCreation creation,
) async {
  try {
    final file = await kawuriDownloadOutput(ref, creation);
    final media = creation.primaryOutput!;
    await Share.shareXFiles([
      XFile(file.path, mimeType: media.mimeType),
    ], text: kawuriAiDisclosure);
  } on KawuriMediaException catch (error) {
    if (context.mounted) showGlassToast(context, error.message);
  } on Object {
    if (context.mounted) {
      showGlassToast(context, 'Sharing is not available right now.');
    }
  }
}

/// Opens the contribution form with the generated file already attached and
/// the AI disclosure already written — the form's normal rights, source and
/// review steps still apply.
Future<void> kawuriUseInContribution(
  BuildContext context,
  WidgetRef ref,
  KawuriCreation creation,
) async {
  final navigator = Navigator.of(context);
  try {
    final file = await kawuriDownloadOutput(ref, creation);
    final picked = PickedContributionFile(
      path: file.path,
      name: file.uri.pathSegments.last,
      sizeBytes: await file.length(),
      kind: creation.isVideo
          ? ContributionMediaKind.video
          : ContributionMediaKind.image,
    );
    final note =
        '$kawuriAiDisclosure\n\nPrompt given to Kawuri: ${creation.prompt}';
    await navigator.push(
      MaterialPageRoute<void>(
        builder: (_) => creation.isVideo
            ? ContributionFormScreen(
                kind: CollectionKind.video,
                initialAiDraft: note,
                initialFile: picked,
              )
            // An image has one place in a contribution today: the artwork of
            // a song or recording.
            : ContributionFormScreen(
                kind: CollectionKind.music,
                initialAiDraft: note,
                initialCover: picked,
              ),
      ),
    );
  } on KawuriMediaException catch (error) {
    if (context.mounted) showGlassToast(context, error.message);
  }
}

/// Starts a reel draft from a generated video, or with a generated image as
/// its cover, and opens the reel creator on it.
Future<void> kawuriUseInReel(
  BuildContext context,
  WidgetRef ref,
  KawuriCreation creation,
) async {
  final navigator = Navigator.of(context);
  final store = ref.read(reelDraftStoreProvider);
  try {
    final file = await kawuriDownloadOutput(ref, creation);
    final media = creation.primaryOutput!;
    final now = DateTime.now();
    final id = 'kawuri_${now.microsecondsSinceEpoch}';
    final fileName = creation.isVideo ? 'kawuri-video.mp4' : 'kawuri-cover.png';
    final adopted = await store.adoptFile(id, file.path, fileName: fileName);
    final draft = creation.isVideo
        ? ReelDraft(
            id: id,
            createdAt: now,
            updatedAt: now,
            video: ReelVideo(
              path: adopted,
              fileName: fileName,
              sizeBytes: await File(adopted).length(),
              contentType: 'video/mp4',
              durationMs:
                  ((media.durationSeconds ?? creation.duration ?? 0) * 1000)
                      .round(),
              aspectRatio: media.aspectRatio ?? 9 / 16,
            ),
            context: kawuriAiDisclosure,
          )
        : ReelDraft(
            id: id,
            createdAt: now,
            updatedAt: now,
            coverSource: ReelCoverSource.image,
            coverPath: adopted,
            context: kawuriAiDisclosure,
          );
    await store.save(draft);
    await navigator.push(
      MaterialPageRoute<void>(builder: (_) => CreateReelScreen(draftId: id)),
    );
  } on KawuriMediaException catch (error) {
    if (context.mounted) showGlassToast(context, error.message);
  } on Object {
    if (context.mounted) {
      showGlassToast(context, 'The reel draft could not be started.');
    }
  }
}

// Confirmations use the app's glass card: the theme makes a plain
// AlertDialog's own surface transparent, so one would float without a
// background.

Future<bool> kawuriConfirmDelete(BuildContext context) async =>
    await showGlassConfirm(
      context: context,
      title: 'Delete this creation?',
      message: 'The file and its details are removed from your account. This cannot be undone.',
      cancelLabel: 'Keep it',
      confirmLabel: 'Delete',
      isDestructive: true,
    ) ==
    true;

Future<bool> kawuriConfirmCancel(
  BuildContext context,
  KawuriCreation creation,
) async =>
    await showGlassConfirm(
      context: context,
      title: 'Cancel this creation?',
      message: creation.isVideo
          ? 'A video that has already started cannot be stopped at Google, so it still counts towards today’s allowance. Nothing will be delivered.'
          : 'Nothing will be delivered.',
      cancelLabel: 'Keep going',
      confirmLabel: 'Cancel it',
      isDestructive: true,
    ) ==
    true;

/// The confirmation every video generation needs before it is bought.
Future<bool> kawuriConfirmVideoSpend(
  BuildContext context, {
  required int durationSeconds,
  bool withSound = false,
}) async =>
    await showGlassConfirm(
      context: context,
      title: 'Use a video generation?',
      message:
          'This $durationSeconds-second video${withSound ? ', with sound,' : ''} uses one of your limited AI video generations for today. Once it starts it cannot be stopped, and it keeps going if you close the app. You will be notified when it is ready.',
      cancelLabel: 'Not now',
      confirmLabel: 'Create video',
    ) ==
    true;
