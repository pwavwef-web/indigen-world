import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// Edit the public parts of a community profile. The handle is fixed once
/// claimed, so it is shown read-only here.
class EditCommunityProfileScreen extends ConsumerStatefulWidget {
  const EditCommunityProfileScreen({required this.profile, super.key});

  final CommunityProfile profile;

  @override
  ConsumerState<EditCommunityProfileScreen> createState() =>
      _EditCommunityProfileScreenState();
}

class _EditCommunityProfileScreenState
    extends ConsumerState<EditCommunityProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _nameController = TextEditingController(
    text: widget.profile.displayName,
  );
  late final _bioController = TextEditingController(text: widget.profile.bio);
  late final _locationController = TextEditingController(
    text: widget.profile.location,
  );
  late final _dialectController = TextEditingController(
    text: widget.profile.dialect,
  );

  PendingUpload? _newAvatar;
  PendingUpload? _newBanner;
  var _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _bioController.dispose();
    _locationController.dispose();
    _dialectController.dispose();
    super.dispose();
  }

  Future<void> _pick({required bool banner}) async {
    const picker = CommunityMediaPicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked == null || !mounted) return;
    setState(() {
      if (banner) {
        _newBanner = picked;
      } else {
        _newAvatar = picked;
      }
    });
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) {
      showCommunityMessage(context, 'You need a connection to save changes.');
      return;
    }

    setState(() => _saving = true);
    try {
      final avatarUrl = _newAvatar == null
          ? null
          : await repository.uploadAvatar(
              uid: widget.profile.uid,
              upload: _newAvatar!,
            );
      final bannerUrl = _newBanner == null
          ? null
          : await repository.uploadBanner(
              uid: widget.profile.uid,
              upload: _newBanner!,
            );

      await repository.updateProfile(
        uid: widget.profile.uid,
        displayName: _nameController.text,
        bio: _bioController.text,
        location: _locationController.text,
        dialect: _dialectController.text,
        avatarUrl: avatarUrl,
        bannerUrl: bannerUrl,
      );
      if (!mounted) return;
      showCommunityMessage(context, 'Profile updated.');
      Navigator.of(context).pop();
    } on CommunityFailure catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showCommunityMessage(context, error.message);
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      showCommunityMessage(context, 'Could not save your profile.');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Edit profile'),
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 12),
          child: FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 40),
              padding: const EdgeInsets.symmetric(horizontal: 18),
            ),
            child: Text(_saving ? 'Saving…' : 'Save'),
          ),
        ),
      ],
    ),
    body: Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          _CoverPicker(
            profile: widget.profile,
            pendingBanner: _newBanner,
            pendingAvatar: _newAvatar,
            onPickBanner: () => _pick(banner: true),
            onPickAvatar: () => _pick(banner: false),
          ),
          const SizedBox(height: 22),
          TextFormField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Display name'),
            validator: (value) => (value ?? '').trim().isEmpty
                ? 'Add the name the community will see.'
                : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            initialValue: widget.profile.handle,
            readOnly: true,
            decoration: const InputDecoration(
              labelText: 'Handle',
              helperText: 'Handles cannot be changed once claimed.',
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _bioController,
            minLines: 2,
            maxLines: 4,
            maxLength: 180,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'About you',
              alignLabelWithHint: true,
            ),
          ),
          TextFormField(
            controller: _locationController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Where you are'),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _dialectController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Dialect you speak',
              hintText: 'Paga, Navrongo, Chiana…',
            ),
          ),
        ],
      ),
    ),
  );
}

class _CoverPicker extends StatelessWidget {
  const _CoverPicker({
    required this.profile,
    required this.pendingBanner,
    required this.pendingAvatar,
    required this.onPickBanner,
    required this.onPickAvatar,
  });

  final CommunityProfile profile;
  final PendingUpload? pendingBanner;
  final PendingUpload? pendingAvatar;
  final VoidCallback onPickBanner;
  final VoidCallback onPickAvatar;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 150,
    child: Stack(
      clipBehavior: Clip.none,
      children: [
        GestureDetector(
          onTap: onPickBanner,
          child: Container(
            height: 110,
            width: double.infinity,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  BrandColors.heritageGreen,
                  BrandColors.savannahGreen,
                  BrandColors.kenteGold,
                ],
              ),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (pendingBanner != null)
                  Image.file(File(pendingBanner!.path), fit: BoxFit.cover)
                else if (profile.bannerUrl != null)
                  Image.network(
                    profile.bannerUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stack) =>
                        const SizedBox.shrink(),
                  ),
                const Center(
                  child: Icon(
                    Icons.photo_camera_outlined,
                    color: Colors.white,
                    size: 26,
                  ),
                ),
              ],
            ),
          ),
        ),
        Positioned(
          left: 16,
          bottom: 0,
          child: GestureDetector(
            onTap: onPickAvatar,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: context.brand.background,
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (pendingAvatar != null)
                    ClipOval(
                      child: Image.file(
                        File(pendingAvatar!.path),
                        width: 76,
                        height: 76,
                        fit: BoxFit.cover,
                      ),
                    )
                  else
                    CommunityAvatar(
                      initials: profile.initials,
                      imageUrl: profile.avatarUrl,
                      size: 76,
                    ),
                  const IgnorePointer(
                    child: Icon(
                      Icons.photo_camera_outlined,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
