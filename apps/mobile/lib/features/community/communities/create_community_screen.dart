import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/communities/community_form_fields.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// A three-step form for starting a community: what it is called and what it
/// is about, who it is for and who can read it, and how it looks and behaves.
///
/// Every field is checked where it is typed, with the same functions the
/// repository checks again before writing — and the Security Rules check a
/// third time — so a mistake is caught on the step that made it rather than
/// as a failure at the end. Pops with the created [CommunitySpace].
class CreateCommunityScreen extends ConsumerStatefulWidget {
  const CreateCommunityScreen({super.key});

  static const stepCount = 3;

  @override
  ConsumerState<CreateCommunityScreen> createState() =>
      _CreateCommunityScreenState();
}

enum _AddressState { idle, checking, free, taken }

class _CreateCommunityScreenState extends ConsumerState<CreateCommunityScreen> {
  final _formKeys = List.generate(
    CreateCommunityScreen.stepCount,
    (_) => GlobalKey<FormState>(),
  );
  final _name = TextEditingController();
  final _slug = TextEditingController();
  final _description = TextEditingController();
  final _language = TextEditingController();
  final _location = TextEditingController();
  final _rules = <TextEditingController>[TextEditingController()];

  var _step = 0;
  var _category = CommunityCategory.language;
  var _visibility = CommunityVisibility.public;
  var _slugEdited = false;
  var _submitting = false;
  var _address = _AddressState.idle;
  Timer? _addressCheck;
  PendingUpload? _avatar;
  PendingUpload? _cover;

  @override
  void dispose() {
    _addressCheck?.cancel();
    for (final controller in [
      _name,
      _slug,
      _description,
      _language,
      _location,
      ..._rules,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _onNameChanged(String value) {
    // The address follows the name until somebody edits it themselves.
    if (!_slugEdited) {
      _slug.text = slugifyCommunityName(value);
      _scheduleAddressCheck();
    }
    setState(() {});
  }

  void _onSlugChanged(String value) {
    _slugEdited = true;
    final cleaned = value.toLowerCase().replaceAll(RegExp('[^a-z0-9-]'), '');
    if (cleaned != value) {
      _slug.value = TextEditingValue(
        text: cleaned,
        selection: TextSelection.collapsed(offset: cleaned.length),
      );
    }
    _scheduleAddressCheck();
  }

  void _scheduleAddressCheck() {
    _addressCheck?.cancel();
    final slug = _slug.text;
    if (validateCommunitySlug(slug) != null) {
      setState(() => _address = _AddressState.idle);
      return;
    }
    setState(() => _address = _AddressState.checking);
    _addressCheck = Timer(const Duration(milliseconds: 450), () async {
      final free = await _isFree(slug);
      if (!mounted || _slug.text != slug || free == null) return;
      setState(
        () => _address = free ? _AddressState.free : _AddressState.taken,
      );
    });
  }

  /// Null when the check itself could not run — the repository checks again
  /// before writing, so an unknown answer must not block the form.
  Future<bool?> _isFree(String slug) async {
    final repository = ref.read(communitySpaceRepositoryProvider);
    if (repository == null) return null;
    try {
      return await repository.isSlugAvailable(slug);
    } on Object {
      return null;
    }
  }

  CommunityDraft get _draft => CommunityDraft(
    name: _name.text,
    slug: _slug.text,
    description: _description.text,
    category: _category,
    language: _language.text,
    location: _location.text,
    visibility: _visibility,
    rules: [for (final rule in _rules) rule.text],
  );

  Future<void> _next() async {
    if (!(_formKeys[_step].currentState?.validate() ?? false)) return;
    if (_step == 0) {
      final free = await _isFree(_slug.text);
      if (!mounted) return;
      if (free == false) {
        setState(() => _address = _AddressState.taken);
        _formKeys[0].currentState?.validate();
        return;
      }
    }
    if (_step < CreateCommunityScreen.stepCount - 1) {
      setState(() => _step++);
      return;
    }
    await _submit();
  }

  void _back() {
    if (_step == 0) {
      Navigator.of(context).maybePop();
    } else {
      setState(() => _step--);
    }
  }

  Future<void> _pickImage({required bool cover}) async {
    final picked = await pickCommunityImage(context);
    if (picked == null || !mounted) return;
    setState(() {
      if (cover) {
        _cover = picked;
      } else {
        _avatar = picked;
      }
    });
  }

  Future<void> _submit() async {
    final draft = _draft;
    final problem = draft.validate();
    if (problem != null) {
      showCommunityMessage(context, problem);
      return;
    }
    final repository = ref.read(communitySpaceRepositoryProvider);
    // Asked rather than read from the stream: nothing on this screen watches
    // the profile, so a bare read can find it still loading.
    final profile = await CommunityActions(ref).requireProfile(context);
    if (!mounted) return;
    if (repository == null || profile == null) {
      showCommunityMessage(context, 'Set up your community profile first.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final created = await repository.createCommunity(
        owner: profile,
        draft: draft,
        avatar: _avatar,
        cover: _cover,
      );
      if (mounted) Navigator.of(context).pop(created);
    } on CommunityFailure catch (error) {
      if (!mounted) return;
      setState(() => _submitting = false);
      showCommunityMessage(context, error.message);
      // The one failure that belongs to an earlier step: send them back to it.
      if (error.message.contains('address')) {
        setState(() {
          _step = 0;
          _address = _AddressState.taken;
        });
      }
    } on Object {
      if (!mounted) return;
      setState(() => _submitting = false);
      showCommunityMessage(
        context,
        'Could not create the community. Try again.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final brand = context.brand;
    final titles = [
      l10n.createCommunityStepBasics,
      l10n.createCommunityStepDetails,
      l10n.createCommunityStepLook,
    ];
    final last = _step == CreateCommunityScreen.stepCount - 1;

    return PopScope<Object?>(
      // Back walks back through the steps before it leaves the form.
      canPop: _step == 0 && !_submitting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_submitting) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.communitiesCreateCommunity),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(34),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      '${_step + 1}/${CreateCommunityScreen.stepCount} · '
                      '${titles[_step]}',
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(
                    value: (_step + 1) / CreateCommunityScreen.stepCount,
                    minHeight: 3,
                    backgroundColor: brand.divider,
                  ),
                ],
              ),
            ),
          ),
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                if (_step > 0)
                  OutlinedButton(
                    onPressed: _submitting ? null : _back,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 48),
                    ),
                    child: Text(l10n.createCommunityBack),
                  ),
                const Spacer(),
                FilledButton(
                  key: const Key('create-community-next'),
                  onPressed: _submitting ? null : _next,
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                  child: Text(
                    _submitting
                        ? l10n.createCommunitySubmitting
                        : last
                        ? l10n.createCommunitySubmit
                        : l10n.createCommunityNext,
                  ),
                ),
              ],
            ),
          ),
        ),
        body: SafeArea(
          top: false,
          bottom: false,
          child: IndexedStack(
            index: _step,
            children: [_step0(l10n), _step1(l10n), _step2(l10n)],
          ),
        ),
      ),
    );
  }

  Widget _step0(AppLocalizations l10n) => Form(
    key: _formKeys[0],
    child: ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        TextFormField(
          key: const Key('create-community-name'),
          controller: _name,
          onChanged: _onNameChanged,
          maxLength: kCommunityNameMax,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: l10n.createCommunityName,
            hintText: l10n.createCommunityNameHint,
          ),
          validator: (value) => validateCommunityName(value ?? ''),
        ),
        const SizedBox(height: 8),
        TextFormField(
          key: const Key('create-community-slug'),
          controller: _slug,
          onChanged: _onSlugChanged,
          maxLength: kCommunitySlugMax,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: l10n.createCommunityAddress,
            prefixText: 'communities/',
            helperText: switch (_address) {
              _AddressState.checking => l10n.createCommunityAddressChecking,
              _AddressState.free => l10n.createCommunityAddressFree,
              _ => l10n.createCommunityAddressHelper,
            },
            helperMaxLines: 2,
            suffixIcon: switch (_address) {
              _AddressState.checking => const Padding(
                padding: EdgeInsets.all(14),
                child: SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              _AddressState.free => Icon(
                Icons.check_circle_rounded,
                color: context.brand.success,
              ),
              _ => null,
            },
          ),
          validator: (value) =>
              validateCommunitySlug(value ?? '') ??
              (_address == _AddressState.taken
                  ? 'That address is already taken. Try another.'
                  : null),
        ),
        const SizedBox(height: 16),
        CommunityFieldLabel(l10n.createCommunityCategory),
        const SizedBox(height: 8),
        CommunityCategoryPicker(
          selected: _category,
          onChanged: (category) => setState(() => _category = category),
        ),
      ],
    ),
  );

  Widget _step1(AppLocalizations l10n) => Form(
    key: _formKeys[1],
    child: ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        CommunityDetailsFields(
          description: _description,
          language: _language,
          location: _location,
        ),
        const SizedBox(height: 16),
        CommunityFieldLabel(l10n.createCommunityVisibility),
        RadioGroup<CommunityVisibility>(
          groupValue: _visibility,
          onChanged: (value) {
            if (value != null) setState(() => _visibility = value);
          },
          child: Column(
            children: [
              RadioListTile<CommunityVisibility>(
                key: const Key('create-visibility-public'),
                value: CommunityVisibility.public,
                contentPadding: EdgeInsets.zero,
                secondary: const Icon(Icons.public_rounded),
                title: Text(l10n.communitiesPublic),
                subtitle: Text(l10n.createCommunityPublicBody),
              ),
              RadioListTile<CommunityVisibility>(
                key: const Key('create-visibility-private'),
                value: CommunityVisibility.private,
                contentPadding: EdgeInsets.zero,
                secondary: const Icon(Icons.lock_outline_rounded),
                title: Text(l10n.communitiesPrivate),
                subtitle: Text(l10n.createCommunityPrivateBody),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            l10n.createCommunityVisibilityLocked,
            style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
          ),
        ),
      ],
    ),
  );

  Widget _step2(AppLocalizations l10n) => Form(
    key: _formKeys[2],
    child: ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        CommunityImageField(
          label: l10n.createCommunityProfileImage,
          upload: _avatar,
          square: true,
          onPick: () => _pickImage(cover: false),
          onRemove: () => setState(() => _avatar = null),
        ),
        const SizedBox(height: 12),
        CommunityImageField(
          label: l10n.createCommunityCoverImage,
          upload: _cover,
          square: false,
          onPick: () => _pickImage(cover: true),
          onRemove: () => setState(() => _cover = null),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(
            l10n.createCommunityImageHelper,
            style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
          ),
        ),
        const SizedBox(height: 20),
        CommunityFieldLabel(l10n.createCommunityRules),
        const SizedBox(height: 4),
        CommunityRulesEditor(
          controllers: _rules,
          onAdd: () => setState(() => _rules.add(TextEditingController())),
          onRemove: (index) => setState(() => _rules.removeAt(index).dispose()),
        ),
      ],
    ),
  );
}
