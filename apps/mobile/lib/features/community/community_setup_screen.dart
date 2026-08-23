import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// One-time handle claim. A signed-in member needs a `communityProfiles` record
/// before they can post, follow or be followed, and the handle registry makes
/// the handle unique across the community.
class CommunitySetupScreen extends ConsumerStatefulWidget {
  const CommunitySetupScreen({super.key});

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

  @override
  void initState() {
    super.initState();
    final displayName = ref.read(currentDisplayNameProvider)?.trim() ?? '';
    _nameController.text = displayName;
    if (displayName.isNotEmpty) {
      _handleController.text = normaliseUsername(
        displayName.replaceAll(' ', ''),
      );
      _scheduleHandleCheck(_handleController.text);
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

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final repository = ref.read(communityRepositoryProvider);
    final uid = ref.read(currentUidProvider);
    if (repository == null || uid == null) {
      showCommunityMessage(context, 'Sign in to join the community.');
      return;
    }

    setState(() => _saving = true);
    try {
      await repository.createProfile(
        uid: uid,
        username: normaliseUsername(_handleController.text),
        displayName: _nameController.text,
        bio: _bioController.text,
        location: _locationController.text,
      );
      if (!mounted) return;
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
    final handle = normaliseUsername(_handleController.text);
    return Scaffold(
      appBar: AppBar(title: const Text('Join the community')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            const Text(
              'Choose the name and handle the community will know you by. Your '
              'handle is public and cannot be changed later.',
              style: TextStyle(color: BrandColors.mutedInk, height: 1.5),
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
                        true => const Icon(
                          Icons.check_circle_rounded,
                          color: BrandColors.savannahGreen,
                        ),
                        false => const Icon(
                          Icons.error_outline_rounded,
                          color: BrandColors.terracotta,
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
                style: const TextStyle(
                  color: BrandColors.heritageGreen,
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
                hintText: 'Your connection to Kasem and the Kasena community',
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
                _saving ? 'Creating…' : 'Create my community profile',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
