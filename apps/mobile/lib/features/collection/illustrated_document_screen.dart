import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:url_launcher/url_launcher.dart';

Future<void> openPublishedDocument(BuildContext context, String? url) async {
  final uri = Uri.tryParse(url ?? '');
  var opened = false;
  if (uri != null && uri.scheme == 'https' && uri.host.isNotEmpty) {
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      // Keep the reader available when the device has no document handler.
    }
  }
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Could not open this document. Please try again.'),
      ),
    );
  }
}

class IllustratedDocumentScreen extends StatefulWidget {
  const IllustratedDocumentScreen({required this.item, super.key});

  final PublishedReel item;

  @override
  State<IllustratedDocumentScreen> createState() =>
      _IllustratedDocumentScreenState();
}

class _IllustratedDocumentScreenState extends State<IllustratedDocumentScreen> {
  final _pages = PageController();
  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _go(int index) => _pages.animateToPage(
    index,
    duration: const Duration(milliseconds: 220),
    curve: Curves.easeOut,
  );

  @override
  Widget build(BuildContext context) {
    final urls = widget.item.documentPageUrls;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.item.title),
        actions: [
          if (widget.item.mediaUrl?.isNotEmpty ?? false)
            IconButton(
              tooltip: 'Open PDF',
              icon: const Icon(Icons.picture_as_pdf_outlined),
              onPressed: () =>
                  openPublishedDocument(context, widget.item.mediaUrl),
            ),
        ],
      ),
      body: urls.isEmpty
          ? const Center(child: Text('No illustrated pages are available.'))
          : Column(
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Swipe to turn pages. Pinch to zoom.'),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _pages,
                    itemCount: urls.length,
                    onPageChanged: (index) => setState(() => _index = index),
                    itemBuilder: (context, index) => _DocumentPage(
                      key: ValueKey(urls[index]),
                      url: urls[index],
                      number: index + 1,
                    ),
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 12,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          tooltip: 'Previous page',
                          onPressed: _index > 0 ? () => _go(_index - 1) : null,
                          icon: const Icon(Icons.chevron_left),
                        ),
                        Semantics(
                          liveRegion: true,
                          child: Text('Page ${_index + 1} of ${urls.length}'),
                        ),
                        IconButton(
                          tooltip: 'Next page',
                          onPressed: _index + 1 < urls.length
                              ? () => _go(_index + 1)
                              : null,
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _DocumentPage extends StatefulWidget {
  const _DocumentPage({required this.url, required this.number, super.key});
  final String url;
  final int number;

  @override
  State<_DocumentPage> createState() => _DocumentPageState();
}

class _DocumentPageState extends State<_DocumentPage> {
  int _attempt = 0;

  @override
  Widget build(BuildContext context) => InteractiveViewer(
    minScale: 1,
    maxScale: 5,
    child: Center(
      child: CachedNetworkImage(
        key: ValueKey('${widget.url}:$_attempt'),
        imageUrl: widget.url,
        fit: BoxFit.contain,
        imageBuilder: (_, image) => Image(
          image: image,
          fit: BoxFit.contain,
          semanticLabel: 'Illustrated story page ${widget.number}',
        ),
        placeholder: (_, _) => const Center(child: CircularProgressIndicator()),
        errorWidget: (_, _, _) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Page ${widget.number} could not load.'),
            TextButton(
              onPressed: () => setState(() => _attempt++),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    ),
  );
}
