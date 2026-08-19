import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  final _postController = TextEditingController();
  final _posts = <_CommunityPost>[..._starterPosts];
  final _appreciated = <int>{};
  var _kasemConfirmed = false;
  _PostAttachment? _attachment;

  @override
  void dispose() {
    _postController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ScreenContainer(
    child: CustomScrollView(
      key: const PageStorageKey('community-scroll'),
      slivers: [
        const SliverToBoxAdapter(child: _CommunityHero()),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
          sliver: SliverList.list(
            children: [
              const _PreviewNotice(),
              const SizedBox(height: 14),
              _buildComposer(context),
              const SizedBox(height: 22),
              const Row(
                children: [
                  Expanded(
                    child: Text(
                      'LATEST CONVERSATIONS',
                      style: TextStyle(
                        color: BrandColors.heritageGreen,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                  Text(
                    'KASEM ONLY',
                    style: TextStyle(
                      color: BrandColors.terracotta,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              for (final post in _posts) ...[
                _CommunityPostCard(
                  post: post,
                  appreciated: _appreciated.contains(post.id),
                  onAppreciate: () => setState(() {
                    _appreciated.contains(post.id)
                        ? _appreciated.remove(post.id)
                        : _appreciated.add(post.id);
                  }),
                  onReply: () => _addReply(context, post),
                  onReelReply: () => _showMessage(
                    context,
                    'A reel reply can be attached after the approved upload flow is connected.',
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
      ],
    ),
  );

  Widget _buildComposer(BuildContext context) => Card(
    color: Colors.white,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              _CommunityAvatar(initials: 'YO', color: BrandColors.kenteGold),
              SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Make a Kasem post',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(
                          Icons.circle,
                          color: BrandColors.savannahGreen,
                          size: 8,
                        ),
                        SizedBox(width: 5),
                        Text(
                          'Kasem language mode is on',
                          style: TextStyle(
                            fontSize: 11,
                            color: BrandColors.mutedInk,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('community-composer'),
            controller: _postController,
            minLines: 3,
            maxLines: 6,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'Bəŋə Kasem…',
              helperText: 'Posts and replies in this room stay in Kasem.',
              alignLabelWithHint: true,
            ),
          ),
          if (_attachment case final attachment?) ...[
            const SizedBox(height: 4),
            _AttachmentPreview(
              attachment: attachment,
              onRemove: () => setState(() => _attachment = null),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 7,
            runSpacing: 7,
            children: [
              ActionChip(
                avatar: const Icon(Icons.image_outlined, size: 18),
                label: const Text('Photo'),
                onPressed: () => _chooseAttachment(context, video: false),
              ),
              ActionChip(
                avatar: const Icon(Icons.video_library_outlined, size: 18),
                label: const Text('Video / reel'),
                onPressed: () => _chooseAttachment(context, video: true),
              ),
            ],
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            value: _kasemConfirmed,
            onChanged: (value) =>
                setState(() => _kasemConfirmed = value ?? false),
            title: const Text(
              'I confirm this post is written in Kasem.',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
            subtitle: const Text(
              'The preview uses a community pledge instead of unreliable automatic language detection.',
              style: TextStyle(fontSize: 10),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              key: const Key('community-publish'),
              onPressed: _publishPost,
              icon: const Icon(Icons.north_east_rounded),
              label: const Text('Post'),
            ),
          ),
        ],
      ),
    ),
  );

  Future<void> _chooseAttachment(
    BuildContext context, {
    required bool video,
  }) async {
    final chosen = await showModalBottomSheet<_PostAttachment>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                video ? 'Add a reel preview' : 'Add an approved demo photo',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              const Text(
                'This build offers rights-attributed demo media while device uploads and consent records are being connected.',
              ),
              const SizedBox(height: 16),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  video
                      ? Icons.play_circle_outline_rounded
                      : Icons.photo_outlined,
                ),
                title: Text(
                  video
                      ? 'Community dance reel preview'
                      : 'Community gathering photo',
                ),
                subtitle: const Text('Attributed demo media · tap to attach'),
                trailing: const Icon(Icons.add_circle_outline_rounded),
                onTap: () => Navigator.pop(
                  context,
                  _PostAttachment(
                    imageUrl: video
                        ? 'https://images.unsplash.com/photo-1660675133223-c293889b9fb8?auto=format&fit=crop&q=80&w=900'
                        : 'https://images.unsplash.com/photo-1515921560173-3633830cb11a?auto=format&fit=crop&q=80&w=900',
                    label: video ? 'REEL PREVIEW' : 'PHOTO',
                    credit: video
                        ? 'Emmanuel Yeboah Okine · Unsplash'
                        : 'Kwasi Ansong Bamfo · Unsplash',
                    isVideo: video,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (chosen != null && mounted) setState(() => _attachment = chosen);
  }

  void _publishPost() {
    final text = _postController.text.trim();
    if (text.isEmpty) {
      _showMessage(context, 'Write your Kasem post before publishing.');
      return;
    }
    if (!_kasemConfirmed) {
      _showMessage(context, 'Confirm that this post is written in Kasem.');
      return;
    }
    setState(() {
      _posts.insert(
        0,
        _CommunityPost(
          id: DateTime.now().microsecondsSinceEpoch,
          author: 'You',
          handle: '@you',
          initials: 'YO',
          age: 'NOW',
          text: text,
          attachment: _attachment,
          replies: const [],
        ),
      );
      _postController.clear();
      _attachment = null;
      _kasemConfirmed = false;
    });
    _showMessage(context, 'Your Kasem post is visible in this local preview.');
  }

  Future<void> _addReply(BuildContext context, _CommunityPost post) async {
    final controller = TextEditingController();
    final reply = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          18 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Reply to ${post.author}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 5),
            const Text(
              'Keep the conversation in Kasem.',
              style: TextStyle(color: BrandColors.mutedInk),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              autofocus: true,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(hintText: 'Reply in Kasem…'),
            ),
            const SizedBox(height: 10),
            FilledButton(
              onPressed: () {
                final value = controller.text.trim();
                if (value.isNotEmpty) Navigator.pop(context, value);
              },
              child: const Text('Add reply'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (reply == null || !mounted) return;
    setState(() {
      final index = _posts.indexWhere((item) => item.id == post.id);
      _posts[index] = post.copyWith(
        replies: [
          ...post.replies,
          _CommunityReply(author: 'You', text: reply),
        ],
      );
    });
  }

  void _showMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}

class _CommunityHero extends StatelessWidget {
  const _CommunityHero();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.circle, size: 9, color: BrandColors.savannahGreen),
                  SizedBox(width: 7),
                  Text(
                    'KASEM-ONLY SPACE',
                    style: TextStyle(
                      color: BrandColors.terracotta,
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.1,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'A room where Kasem never has to translate itself.',
                style: Theme.of(context).textTheme.headlineMedium
                    ?.copyWith(height: 1.02),
              ),
              const SizedBox(height: 8),
              const Text(
                'Share a thought, photo or reel. Reply and keep the conversation moving—in Kasem.',
                style: TextStyle(color: BrandColors.mutedInk, height: 1.4),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        const AnimatedCulturalSymbol(
          glyph: '✣',
          label: 'TOGETHER',
          color: BrandColors.terracotta,
        ),
      ],
    ),
  );
}

class _PreviewNotice extends StatelessWidget {
  const _PreviewNotice();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: BrandColors.kenteGold.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: BrandColors.kenteGold.withValues(alpha: 0.4)),
    ),
    child: const Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.science_outlined, color: BrandColors.heritageGreen),
        SizedBox(width: 10),
        Expanded(
          child: Text(
            'Community UI preview: sample phrases and media demonstrate the flow; they are not a validated Kasem corpus or live public posts.',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
        ),
      ],
    ),
  );
}

class _CommunityPostCard extends StatelessWidget {
  const _CommunityPostCard({
    required this.post,
    required this.appreciated,
    required this.onAppreciate,
    required this.onReply,
    required this.onReelReply,
  });

  final _CommunityPost post;
  final bool appreciated;
  final VoidCallback onAppreciate;
  final VoidCallback onReply;
  final VoidCallback onReelReply;

  @override
  Widget build(BuildContext context) => Card(
    color: Colors.white,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _CommunityAvatar(initials: post.initials),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      post.author,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      '${post.handle} · ${post.age}',
                      style: const TextStyle(
                        color: BrandColors.mutedInk,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.more_horiz_rounded, color: BrandColors.mutedInk),
            ],
          ),
          const SizedBox(height: 14),
          Text(post.text, style: const TextStyle(fontSize: 17, height: 1.5)),
          if (post.attachment case final attachment?) ...[
            const SizedBox(height: 13),
            _PostMedia(attachment: attachment),
          ],
          const SizedBox(height: 11),
          const Divider(height: 1),
          const SizedBox(height: 5),
          Wrap(
            spacing: 2,
            children: [
              TextButton.icon(
                onPressed: onAppreciate,
                icon: Icon(
                  appreciated
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  size: 18,
                ),
                label: Text(appreciated ? 'Appreciated' : 'Appreciate'),
              ),
              TextButton.icon(
                onPressed: onReply,
                icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
                label: Text('${post.replies.length} replies'),
              ),
              IconButton(
                tooltip: 'Add a reel reply',
                onPressed: onReelReply,
                icon: const Icon(Icons.video_call_outlined, size: 20),
              ),
            ],
          ),
          if (post.replies.isNotEmpty) ...[
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.only(left: 12),
              decoration: const BoxDecoration(
                border: Border(
                  left: BorderSide(color: BrandColors.kenteGold, width: 2),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final reply in post.replies)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            reply.author,
                            style: const TextStyle(
                              color: BrandColors.heritageGreen,
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text(
                            reply.text,
                            style: const TextStyle(fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

class _AttachmentPreview extends StatelessWidget {
  const _AttachmentPreview({required this.attachment, required this.onRemove});

  final _PostAttachment attachment;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      _PostMedia(attachment: attachment),
      Positioned(
        top: 7,
        right: 7,
        child: IconButton.filled(
          tooltip: 'Remove attachment',
          onPressed: onRemove,
          style: IconButton.styleFrom(
            backgroundColor: Colors.black54,
            foregroundColor: Colors.white,
          ),
          icon: const Icon(Icons.close_rounded, size: 18),
        ),
      ),
    ],
  );
}

class _PostMedia extends StatelessWidget {
  const _PostMedia({required this.attachment});

  final _PostAttachment attachment;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(15),
    child: AspectRatio(
      aspectRatio: 4 / 3,
      child: Stack(
        fit: StackFit.expand,
        children: [
          CachedNetworkImage(
            imageUrl: attachment.imageUrl,
            fit: BoxFit.cover,
            placeholder: (context, url) =>
                const ColoredBox(color: BrandColors.heritageGreen),
            errorWidget: (context, url, error) => const ColoredBox(
              color: BrandColors.heritageGreen,
              child: Icon(
                Icons.image_not_supported_outlined,
                color: Colors.white70,
              ),
            ),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Color(0xAA000000)],
              ),
            ),
          ),
          if (attachment.isVideo)
            const Center(
              child: Icon(
                Icons.play_circle_fill_rounded,
                color: Colors.white,
                size: 58,
              ),
            ),
          Positioned(
            left: 10,
            right: 10,
            bottom: 9,
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    attachment.label,
                    style: const TextStyle(
                      color: BrandColors.kenteGold,
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const Spacer(),
                Flexible(
                  child: Text(
                    attachment.credit,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white70, fontSize: 8),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _CommunityAvatar extends StatelessWidget {
  const _CommunityAvatar({
    required this.initials,
    this.color = BrandColors.heritageGreen,
  });

  final String initials;
  final Color color;

  @override
  Widget build(BuildContext context) => CircleAvatar(
    radius: 20,
    backgroundColor: color,
    foregroundColor: color == BrandColors.kenteGold
        ? BrandColors.heritageGreen
        : Colors.white,
    child: Text(
      initials,
      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
    ),
  );
}

class _CommunityPost {
  const _CommunityPost({
    required this.id,
    required this.author,
    required this.handle,
    required this.initials,
    required this.age,
    required this.text,
    required this.replies,
    this.attachment,
  });

  final int id;
  final String author;
  final String handle;
  final String initials;
  final String age;
  final String text;
  final _PostAttachment? attachment;
  final List<_CommunityReply> replies;

  _CommunityPost copyWith({List<_CommunityReply>? replies}) => _CommunityPost(
    id: id,
    author: author,
    handle: handle,
    initials: initials,
    age: age,
    text: text,
    attachment: attachment,
    replies: replies ?? this.replies,
  );
}

class _CommunityReply {
  const _CommunityReply({required this.author, required this.text});

  final String author;
  final String text;
}

class _PostAttachment {
  const _PostAttachment({
    required this.imageUrl,
    required this.label,
    required this.credit,
    required this.isVideo,
  });

  final String imageUrl;
  final String label;
  final String credit;
  final bool isVideo;
}

const _starterPosts = [
  _CommunityPost(
    id: 1,
    author: 'Amina Ayaribisa',
    handle: '@amina.paga',
    initials: 'AA',
    age: '12 MIN',
    text: 'De N zezenga! Ko ye te mo?',
    attachment: _PostAttachment(
      imageUrl: 'https://images.unsplash.com/photo-1515921560173-3633830cb11a?auto=format&fit=crop&q=80&w=900',
      label: 'COMMUNITY PHOTO',
      credit: 'Kwasi Ansong Bamfo · Unsplash',
      isVideo: false,
    ),
    replies: [
      _CommunityReply(author: 'Nyaaba', text: 'Ko gara.'),
      _CommunityReply(author: 'Akumbis', text: 'De N lei.'),
    ],
  ),
  _CommunityPost(
    id: 2,
    author: 'Nyaaba Atanga',
    handle: '@nyaaba.learns',
    initials: 'NA',
    age: '1 HR',
    text: 'Amo wora a zamese Kasem mo. Jwa ne a daa wo zamese.',
    replies: [
      _CommunityReply(author: 'Amina', text: 'Ei, chega mo!'),
      _CommunityReply(author: 'Awine', text: 'De daa wo jeeri.'),
    ],
  ),
  _CommunityPost(
    id: 3,
    author: 'Project Kasena',
    handle: '@projectkasena',
    initials: 'PK',
    age: '3 HR',
    text: 'De zaanem. De daa wo jeeri.',
    attachment: _PostAttachment(
      imageUrl: 'https://images.unsplash.com/photo-1757169917348-b4f790e4dc85?auto=format&fit=crop&q=80&w=900',
      label: 'REEL PREVIEW',
      credit: 'Oswald Elsaboath · Unsplash',
      isVideo: true,
    ),
    replies: [_CommunityReply(author: 'Community', text: 'Mbesem.')],
  ),
];
