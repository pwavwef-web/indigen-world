import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// Search the community by handle or name, with new members as the default
/// suggestion list.
class PeopleScreen extends ConsumerStatefulWidget {
  const PeopleScreen({super.key});

  @override
  ConsumerState<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends ConsumerState<PeopleScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  var _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 320), () {
      if (mounted) setState(() => _query = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final searching = _query.length >= 2;
    final results = searching
        ? ref.watch(profileSearchProvider(_query))
        : ref.watch(suggestedProfilesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Find people')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: TextField(
              key: const Key('community-people-search'),
              controller: _controller,
              autofocus: true,
              textInputAction: TextInputAction.search,
              onChanged: _onChanged,
              decoration: InputDecoration(
                hintText: 'Search by name or @handle',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _controller.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear',
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () {
                          _controller.clear();
                          _onChanged('');
                        },
                      ),
              ),
            ),
          ),
          if (!searching)
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'NEW IN THE COMMUNITY',
                  style: TextStyle(
                    color: BrandColors.heritageGreen,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
            ),
          Expanded(
            child: switch (results) {
              AsyncValue(:final value?) when value.isEmpty =>
                CommunityEmptyState(
                  icon: searching
                      ? Icons.person_search_outlined
                      : Icons.groups_outlined,
                  title: searching ? 'No one found' : 'No members yet',
                  message: searching
                      ? 'Try a different name or handle. Search matches the '
                            'start of a name or handle.'
                      : 'Members appear here as they join the community.',
                ),
              AsyncValue(:final value?) => _PeopleList(profiles: value),
              AsyncValue(hasError: true) => const CommunityEmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Search unavailable',
                message: 'Check your connection and try again.',
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
        ],
      ),
    );
  }
}

/// Which edge of the follow graph a [PeopleListScreen] renders.
enum PeopleListMode { followers, following }

/// The followers / following list for one member.
class PeopleListScreen extends ConsumerWidget {
  const PeopleListScreen({required this.uid, required this.mode, super.key});

  final String uid;
  final PeopleListMode mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final people = mode == PeopleListMode.followers
        ? ref.watch(followersListProvider(uid))
        : ref.watch(followingListProvider(uid));

    return Scaffold(
      appBar: AppBar(
        title: Text(
          mode == PeopleListMode.followers ? 'Followers' : 'Following',
        ),
      ),
      body: switch (people) {
        AsyncValue(:final value?) when value.isEmpty => CommunityEmptyState(
          icon: Icons.group_outlined,
          title: mode == PeopleListMode.followers
              ? 'No followers yet'
              : 'Not following anyone yet',
          message: mode == PeopleListMode.followers
              ? 'People who follow this member will be listed here.'
              : 'The people this member follows will be listed here.',
        ),
        AsyncValue(:final value?) => _PeopleList(profiles: value),
        AsyncValue(hasError: true) => const CommunityEmptyState(
          icon: Icons.cloud_off_rounded,
          title: 'Could not load',
          message: 'Check your connection and try again.',
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _PeopleList extends StatelessWidget {
  const _PeopleList({required this.profiles});

  final List<CommunityProfile> profiles;

  @override
  Widget build(BuildContext context) => ListView.separated(
    padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
    itemCount: profiles.length,
    separatorBuilder: (context, index) => const Divider(height: 1),
    itemBuilder: (context, index) {
      final profile = profiles[index];
      return ProfileTile(
        profile: profile,
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (context) => CommunityProfileScreen(uid: profile.uid),
          ),
        ),
      );
    },
  );
}
