import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/widgets/birthday_field.dart';
import 'package:indigen_world_mobile/features/community/widgets/kasem_name_panel.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// One-time handle claim. A signed-in member needs a `communityProfiles` record
/// before they can post, follow or be followed, and the handle registry makes
/// the handle unique across the community.
///
/// -- Why it can be embedded ------------------------------------------------
/// This is the same form whether somebody arrived at it from the Profile tab
/// months after joining, or is walking through it as the second step of
/// [AccountSetupFlow] the minute they signed in. Two copies of a form that
/// debounces a handle check, normalises what was typed and races a registry
/// write would be two places for the same bug, so the flow embeds this one:
/// [embedded] drops the Scaffold and the app bar, and [onCreated] replaces the
/// pop that a pushed route ends with.
class CommunitySetupScreen extends ConsumerStatefulWidget {
  const CommunitySetupScreen({
    this.initialHandle = '',
    this.embedded = false,
    this.onCreated,
    this.submitLabel,
    super.key,
  });

  /// A handle to start from -- the fold of a Kassena name chosen a step
  /// earlier. Empty for the standalone screen, which derives one from the
  /// signed-in account's display name instead.
  final String initialHandle;

  /// Renders the form alone, for a host that supplies its own chrome.
  final bool embedded;

  /// Called with the new profile instead of popping. Required in [embedded]
  /// mode, where there is no route of this screen's own to pop.
  final ValueChanged<CommunityProfile>? onCreated;

  /// Overrides the wording on the button that creates the profile.
  final String? submitLabel;

  @override
  ConsumerState<CommunitySetupScreen> createState() =>
      _CommunitySetupScreenState();
}

class _CommunitySetupScreenState extends ConsumerState<CommunitySetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _handleController = TextEditingController();
  final _nameController = TextEditingController();
  final _bioController = TextEditingController();
  final _locationController = TextEditingController();

  Timer? _handleDebounce;
  bool? _handleAvailable;
  var _checkingHandle = false;
  var _saving = false;
  var _birthMonth = 0;
  var _birthDay = 0;

  @override
  void initState() {
    super.initState();
    final displayName = ref.read(currentDisplayNameProvider)?.trim() ?? '';
    _nameController.text = displayName;
    // A Kassena name chosen a step earlier wins over one derived from the
    // Google account's display name: the member has already decided.
    final seed = widget.initialHandle.trim().isNotEmpty
        ? normaliseUsername(widget.initialHandle)
        : normaliseUsername(displayName.replaceAll(' ', ''));
    if (seed.isNotEmpty) {
      _handleController.text = seed;
      _scheduleHandleCheck(seed);
    }
  }

  @override
  void dispose() {
    _handleDebounce?.cancel();
    _handleController.dispose();
    _nameController.dispose();
    _bioController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  void _scheduleHandleCheck(String raw) {
    _handleDebounce?.cancel();
    final handle = normaliseUsername(raw);
    if (validateUsername(handle) != null) {
      setState(() {
        _handleAvailable = null;
        _checkingHandle = false;
      });
      return;
    }
    setState(() => _checkingHandle = true);
    _handleDebounce = Timer(const Duration(milliseconds: 450), () async {
      final repository = ref.read(communityRepositoryProvider);
      if (repository == null) {
        if (mounted) setState(() => _checkingHandle = false);
        return;
      }
      final available = await repository.isUsernameAvailable(handle);
      if (!mounted || normaliseUsername(_handleController.text) != handle) {
        return;
      }
      setState(() {
        _handleAvailable = available;
        _checkingHandle = false;
      });
    });
  }

  /// Puts a chosen name in the handle field and checks it is free.
  void _takeName(String ascii) {
    _handleController.text = ascii;
    _handleController.selection = TextSelection.collapsed(
      offset: ascii.length,
    );
    setState(() {});
    _scheduleHandleCheck(ascii);
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    // Half a birthday is not one. Caught here rather than dropped silently at
    // the write, which would leave somebody sure they had given it.
    if ((_birthMonth == 0) != (_birthDay == 0)) {
      showCommunityMessage(
        context,
        'Finish your birthday -- a month and a day -- or clear both.',
      );
      return;
    }
    final repository = ref.read(communityRepositoryProvider);
    final uid = ref.read(currentUidProvider);
    if (repository == null || uid == null) {
      showCommunityMessage(context, 'Sign in to join the community.');
      return;
    }

    setState(() => _saving = true);
    try {
      final profile = await repository.createProfile(
        uid: uid,
        username: normaliseUsername(_handleController.text),
        displayName: _nameController.text,
        bio: _bioController.text,
        location: _locationController.text,
        avatarUrl: ref.read(currentPhotoUrlProvider),
        birthMonth: _birthMonth,
        birthDay: _birthDay,
      );
      if (!mounted) return;
      final onCreated = widget.onCreated;
      if (onCreated != null) {
        onCreated(profile);
        return;
      }
      Navigator.of(context).pop(true);
    } on CommunityFailure catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        showCommunityMessage(context, error.message);
      }
    } on Object {
      if (mounted) {
        setState(() => _saving = false);
        showCommunityMessage(context, 'Could not create your profile.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final form = _buildForm(context);
    // Embedded, the host owns the page: its own progress header sits above this
    // and its own ground behind it, so a second Scaffold would paint over both.
    if (widget.embedded) return form;
    return Scaffold(
      appBar: AppBar(title: const Text('Join the community')),
      body: form,
    );
  }

  Widget _buildForm(BuildContext context) {
    final handle = normaliseUsername(_handleController.text);
    return Form(
        key: _formKey,
        child: ListView(
          // Named so it keeps its place across a rebuild, and so a test can say
          // which of the two scrollables on this screen it means — the panel's
          // row of names is the other one.
          key: const PageStorageKey('community-setup-scroll'),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            Text(
              'Choose the name and handle the community will know you by. Your '
              'handle is public and cannot be changed later.',
              style: TextStyle(color: context.brand.mutedInk, height: 1.5),
            ),
            const SizedBox(height: 22),
            TextFormField(
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Display name',
                hintText: 'How your name appears on posts',
              ),
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Add the name the community will see.'
                  : null,
            ),
            const SizedBox(height: 16),
            // Above the field, not below it: somebody who has already typed a
            // handle is far less likely to change it than somebody who has not
            // typed anything yet.
            KasemNamePanel(
              currentHandle: _handleController.text,
              onPick: _takeName,
            ),
            const SizedBox(height: 16),
            TextFormField(
              key: const Key('community-handle'),
              controller: _handleController,
              autocorrect: false,
              decoration: InputDecoration(
                labelText: 'Handle',
                prefixText: '@',
                helperText: 'Lowercase letters, numbers and underscores.',
                suffixIcon: _checkingHandle
                    ? const Padding(
                        padding: EdgeInsets.all(14),
                        child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : switch (_handleAvailable) {
                        true => Icon(
                          Icons.check_circle_rounded,
                          color: context.brand.success,
                        ),
                        false => Icon(
                          Icons.error_outline_rounded,
                          color: context.brand.terracotta,
                        ),
                        null => null,
                      },
              ),
              onChanged: _scheduleHandleCheck,
              validator: (value) {
                final normalised = normaliseUsername(value ?? '');
                final reason = validateUsername(normalised);
                if (reason != null) return reason;
                if (_handleAvailable == false) {
                  return 'That handle is already taken.';
                }
                return null;
              },
            ),
            if (handle.isNotEmpty && validateUsername(handle) == null) ...[
              const SizedBox(height: 8),
              Text(
                'You will appear as @$handle',
                style: TextStyle(
                  color: context.brand.accent,
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                ),
              ),
            ],
            const SizedBox(height: 16),
            TextFormField(
              controller: _bioController,
              minLines: 2,
              maxLines: 4,
              maxLength: 180,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'About you',
                hintText: 'Your connection to Kasem and the Kassena community',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 4),
            TextFormField(
              controller: _locationController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Where you are (optional)',
                hintText: 'Paga, Navrongo, Chiana…',
              ),
            ),
            const SizedBox(height: 22),
            BirthdayField(
              month: _birthMonth,
              day: _birthDay,
              onChanged: (month, day) => setState(() {
                _birthMonth = month;
                _birthDay = day;
              }),
            ),
            const SizedBox(height: 26),
            FilledButton.icon(
              key: const Key('community-setup-submit'),
              onPressed: _saving ? null : _submit,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.groups_rounded),
              label: Text(
                _saving
                    ? 'Creating…'
                    : widget.submitLabel ?? 'Create my community profile',
              ),
            ),
          ],
        ),
      );
  }
}
