import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/communities/community_form_fields.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Where an owner or admin changes how a community describes itself: its
/// name, what it is about, its pictures and its rules.
///
/// One page rather than the create form's three steps — somebody editing is
/// fixing one thing, not being walked through a first draft. The address and
/// visibility are shown but not editable: the address is the document's id,
/// and flipping visibility would strand every existing post on the wrong side
/// of the members-only wall. Pops with the updated [CommunitySpace].
class EditCommunityScreen extends ConsumerStatefulWidget {
  const EditCommunityScreen({required this.space, super.key});

  final CommunitySpace space;

  @override
  ConsumerState<EditCommunityScreen> createState() =>
      _EditCommunityScreenState();
}

class _EditCommunityScreenState extends ConsumerState<EditCommunityScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.space.name);
  late final _description = TextEditingController(
    text: widget.space.description,
  );
  late final _language = TextEditingController(text: widget.space.language);
  late final _location = TextEditingController(text: widget.space.location);
  late final _rules = <TextEditingController>[
    for (final rule in widget.space.rules) TextEditingController(text: rule),
    if (widget.space.rules.isEmpty) TextEditingController(),
  ];
  late var _category = widget.space.category;
  PendingUpload? _avatar;
  PendingUpload? _cover;
  var _clearAvatar = false;
  var _clearCover = false;
  var _dirty = false;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    for (final controller in [_name, _description, _language, _location]) {
      controller.addListener(_markDirty);
    }
    for (final controller in _rules) {
      controller.addListener(_markDirty);
    }
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _description,
      _language,
      _location,
      ..._rules,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _markDirty() {
    if (!_dirty && mounted) setState(() => _dirty = true);
  }

  Future<void> _pick({required bool cover}) async {
    final picked = await pickCommunityImage(context);
    if (picked == null || !mounted) return;
    setState(() {
      _dirty = true;
      if (cover) {
        _cover = picked;
        _clearCover = false;
      } else {
        _avatar = picked;
        _clearAvatar = false;
      }
    });
  }

  void _remove({required bool cover}) => setState(() {
    _dirty = true;
    if (cover) {
      _cover = null;
      _clearCover = true;
    } else {
      _avatar = null;
      _clearAvatar = true;
    }
  });

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    if (!(_form.currentState?.validate() ?? false)) return;
    final repository = ref.read(communitySpaceRepositoryProvider);
    final uid = ref.read(currentUidProvider);
    if (repository == null || uid == null) return;
    setState(() => _saving = true);
    try {
      final updated = await repository.updateCommunity(
        space: widget.space,
        editorUid: uid,
        draft: CommunityDraft(
          name: _name.text,
          slug: widget.space.id,
          description: _description.text,
          category: _category,
          language: _language.text,
          location: _location.text,
          visibility: widget.space.visibility,
          rules: [for (final rule in _rules) rule.text],
        ),
        avatar: _avatar,
        cover: _cover,
        clearAvatar: _clearAvatar,
        clearCover: _clearCover,
      );
      if (!mounted) return;
      showCommunityMessage(context, l10n.communityEditSaved);
      Navigator.of(context).pop(updated);
    } on CommunityFailure catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showCommunityMessage(context, error.message);
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      showCommunityMessage(context, 'Could not save the community. Try again.');
    }
  }

  Future<void> _confirmDiscard() async {
    final l10n = AppLocalizations.of(context);
    final discard = await showGlassConfirm(
      context: context,
      title: l10n.communityEditDiscardTitle,
      message: l10n.communityEditDiscardBody,
      confirmLabel: l10n.communityEditDiscard,
      isDestructive: true,
    );
    if (discard == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final brand = context.brand;
    final space = widget.space;

    return PopScope<Object?>(
      canPop: !_dirty && !_saving,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_saving) _confirmDiscard();
      },
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.communityEditCommunity)),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton(
              key: const Key('edit-community-save'),
              onPressed: _saving || !_dirty ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
              child: Text(
                _saving ? l10n.communityEditSaving : l10n.communityEditSave,
              ),
            ),
          ),
        ),
        body: SafeArea(
          top: false,
          bottom: false,
          child: Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                TextFormField(
                  key: const Key('edit-community-name'),
                  controller: _name,
                  maxLength: kCommunityNameMax,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: l10n.createCommunityName,
                  ),
                  validator: (value) => validateCommunityName(value ?? ''),
                ),
                _FixedFact(
                  icon: Icons.link_rounded,
                  text: l10n.communityEditAddressFixed(space.id),
                ),
                _FixedFact(
                  icon: space.isPrivate
                      ? Icons.lock_outline_rounded
                      : Icons.public_rounded,
                  text: l10n.communityEditVisibilityFixed(
                    space.isPrivate
                        ? l10n.communitiesPrivate
                        : l10n.communitiesPublic,
                  ),
                ),
                const SizedBox(height: 16),
                CommunityFieldLabel(l10n.createCommunityCategory),
                const SizedBox(height: 8),
                CommunityCategoryPicker(
                  keyPrefix: 'edit',
                  selected: _category,
                  onChanged: (category) => setState(() {
                    _category = category;
                    _dirty = true;
                  }),
                ),
                const SizedBox(height: 20),
                CommunityDetailsFields(
                  keyPrefix: 'edit',
                  description: _description,
                  language: _language,
                  location: _location,
                ),
                const SizedBox(height: 16),
                CommunityImageField(
                  label: l10n.createCommunityProfileImage,
                  upload: _avatar,
                  existingUrl: _clearAvatar ? null : space.avatarUrl,
                  square: true,
                  onPick: () => _pick(cover: false),
                  onRemove: () => _remove(cover: false),
                ),
                const SizedBox(height: 12),
                CommunityImageField(
                  label: l10n.createCommunityCoverImage,
                  upload: _cover,
                  existingUrl: _clearCover ? null : space.coverUrl,
                  square: false,
                  onPick: () => _pick(cover: true),
                  onRemove: () => _remove(cover: true),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    l10n.createCommunityImageHelper,
                    style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                  ),
                ),
                const SizedBox(height: 20),
                CommunityFieldLabel(l10n.createCommunityRules),
                const SizedBox(height: 4),
                CommunityRulesEditor(
                  keyPrefix: 'edit',
                  controllers: _rules,
                  onAdd: () => setState(() {
                    _rules.add(
                      TextEditingController()..addListener(_markDirty),
                    );
                    _dirty = true;
                  }),
                  onRemove: (index) => setState(() {
                    _rules.removeAt(index).dispose();
                    _dirty = true;
                  }),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A line about something the form shows but does not let you change.
class _FixedFact extends StatelessWidget {
  const _FixedFact({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: brand.mutedInk),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: brand.mutedInk, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
