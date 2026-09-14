import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_widgets.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

// The fields a community is described by, shared by the create form and the
// edit screen so the two cannot drift apart in what they accept.

/// Picks a community picture from the gallery and checks it is one the
/// community may use, saying why when it is not. Null when nothing usable was
/// chosen.
Future<PendingUpload?> pickCommunityImage(BuildContext context) async {
  final picked = await const CommunityMediaPicker().pickImage(
    source: ImageSource.gallery,
  );
  if (picked == null || !context.mounted) return null;
  final file = File(picked.path);
  final reason = validateCommunityImage(
    path: picked.path,
    bytes: await file.exists() ? await file.length() : 0,
  );
  if (!context.mounted) return null;
  if (reason != null) {
    showCommunityMessage(context, reason);
    return null;
  }
  return picked;
}

class CommunityFieldLabel extends StatelessWidget {
  const CommunityFieldLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
    header: true,
    child: Text(
      text,
      style: TextStyle(
        color: context.brand.ink,
        fontSize: 14,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}

/// The category choice, as a wrap of chips.
class CommunityCategoryPicker extends StatelessWidget {
  const CommunityCategoryPicker({
    required this.selected,
    required this.onChanged,
    this.keyPrefix = 'create',
    super.key,
  });

  final CommunityCategory selected;
  final ValueChanged<CommunityCategory> onChanged;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        for (final category in CommunityCategory.values)
          ChoiceChip(
            key: ValueKey('$keyPrefix-category-${category.wire}'),
            avatar: Icon(communityCategoryIcon(category), size: 16),
            label: Text(communityCategoryLabel(category, l10n)),
            selected: selected == category,
            showCheckmark: false,
            materialTapTargetSize: MaterialTapTargetSize.padded,
            onSelected: (_) => onChanged(category),
          ),
      ],
    );
  }
}

/// Description, primary language, and place or cultural group.
class CommunityDetailsFields extends StatelessWidget {
  const CommunityDetailsFields({
    required this.description,
    required this.language,
    required this.location,
    this.keyPrefix = 'create',
    super.key,
  });

  final TextEditingController description;
  final TextEditingController language;
  final TextEditingController location;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        TextFormField(
          key: Key('$keyPrefix-community-description'),
          controller: description,
          minLines: 3,
          maxLines: 6,
          maxLength: kCommunityDescriptionMax,
          maxLengthEnforcement: MaxLengthEnforcement.none,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: l10n.createCommunityDescription,
            hintText: l10n.createCommunityDescriptionHint,
            alignLabelWithHint: true,
          ),
          validator: (value) => validateCommunityDescription(value ?? ''),
        ),
        const SizedBox(height: 8),
        TextFormField(
          key: Key('$keyPrefix-community-language'),
          controller: language,
          maxLength: kCommunityLanguageMax,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: l10n.createCommunityLanguage,
            hintText: l10n.createCommunityLanguageHint,
          ),
          validator: (value) => validateCommunityShortText(
            value ?? '',
            kCommunityLanguageMax,
            l10n.createCommunityLanguage,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          key: Key('$keyPrefix-community-location'),
          controller: location,
          maxLength: kCommunityLocationMax,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: l10n.createCommunityLocation,
            hintText: l10n.createCommunityLocationHint,
          ),
          validator: (value) => validateCommunityShortText(
            value ?? '',
            kCommunityLocationMax,
            l10n.createCommunityLocation,
          ),
        ),
      ],
    );
  }
}

/// A picture slot: what is there now — a newly chosen file, the picture the
/// community already has, or nothing — and the buttons to change it.
class CommunityImageField extends StatelessWidget {
  const CommunityImageField({
    required this.label,
    required this.upload,
    required this.square,
    required this.onPick,
    required this.onRemove,
    this.existingUrl,
    super.key,
  });

  final String label;
  final PendingUpload? upload;

  /// The picture already saved on the community, shown until it is replaced
  /// or removed.
  final String? existingUrl;

  final bool square;
  final VoidCallback onPick;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final placeholder = Icon(Icons.image_outlined, color: brand.mutedInk);
    final upload = this.upload;
    final existingUrl = this.existingUrl;
    final preview = Container(
      width: square ? 72 : 128,
      height: 72,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: brand.surfaceMuted,
        borderRadius: BorderRadius.circular(square ? 20 : 12),
        border: Border.all(color: brand.border),
      ),
      child: upload != null
          ? Image.file(File(upload.path), fit: BoxFit.cover)
          : existingUrl != null
          ? CachedNetworkImage(
              imageUrl: existingUrl,
              fit: BoxFit.cover,
              placeholder: (context, _) => placeholder,
              errorWidget: (context, _, _) => placeholder,
            )
          : placeholder,
    );
    return Row(
      children: [
        ExcludeSemantics(child: preview),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CommunityFieldLabel(label),
              const SizedBox(height: 4),
              Wrap(
                spacing: 4,
                children: [
                  TextButton.icon(
                    onPressed: onPick,
                    style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: Text(l10n.createCommunityChooseImage),
                  ),
                  if (upload != null || existingUrl != null)
                    TextButton.icon(
                      onPressed: onRemove,
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 44),
                      ),
                      icon: const Icon(Icons.delete_outline_rounded),
                      label: Text(l10n.createCommunityRemoveImage),
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The rules list: one field per rule, a remove button on each once there is
/// more than one, and an add button until the limit.
class CommunityRulesEditor extends StatelessWidget {
  const CommunityRulesEditor({
    required this.controllers,
    required this.onAdd,
    required this.onRemove,
    this.keyPrefix = 'create',
    super.key,
  });

  final List<TextEditingController> controllers;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var index = 0; index < controllers.length; index++)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: TextFormField(
              key: ValueKey('$keyPrefix-rule-$index'),
              controller: controllers[index],
              maxLength: kCommunityRuleMax,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: l10n.createCommunityRuleHint(index + 1),
                suffixIcon: controllers.length == 1
                    ? null
                    : IconButton(
                        tooltip: l10n.createCommunityRemoveRule,
                        onPressed: () => onRemove(index),
                        icon: const Icon(Icons.remove_circle_outline_rounded),
                      ),
              ),
              validator: (value) =>
                  (value ?? '').trim().length > kCommunityRuleMax
                  ? 'Each rule can be at most $kCommunityRuleMax characters.'
                  : null,
            ),
          ),
        if (controllers.length < kCommunityRulesMax)
          TextButton.icon(
            onPressed: onAdd,
            style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.createCommunityAddRule),
          ),
      ],
    );
  }
}
