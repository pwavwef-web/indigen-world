import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:html/dom.dart' as dom;
import 'package:html/parser.dart' as html_parser;
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:url_launcher/url_launcher.dart';

/// A blog post's HTML, drawn as the app's own text.
///
/// ── Why not a WebView ─────────────────────────────────────────────────────
/// A post is paragraphs, headings, lists, quotes and captioned pictures — the
/// release posts in `apps/updates-blog/posts` are written to exactly that
/// shape. Drawing those natively means the reader's text size, dark mode and
/// screen reader all apply, nothing on the page can run script, and nothing
/// loads that the post did not put there. Anything outside that shape (an
/// embed, a form) is replaced by a line pointing to the web version rather
/// than silently dropped.
class BlogBody extends StatefulWidget {
  const BlogBody({required this.html, required this.onOpenWeb, super.key});

  final String html;
  final VoidCallback onOpenWeb;

  @override
  State<BlogBody> createState() => _BlogBodyState();
}

class _BlogBodyState extends State<BlogBody> {
  final _recognizers = <TapGestureRecognizer>[];

  @override
  void dispose() {
    _disposeRecognizers();
    super.dispose();
  }

  void _disposeRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  Widget build(BuildContext context) {
    _disposeRecognizers();
    final document = html_parser.parseFragment(widget.html);
    final blocks = <Widget>[];
    _blocks(document.nodes, blocks, context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: blocks,
    );
  }

  TextStyle _base(BuildContext context) =>
      TextStyle(color: context.brand.ink, fontSize: 16.5, height: 1.62);

  void _blocks(List<dom.Node> nodes, List<Widget> out, BuildContext context) {
    final inline = <dom.Node>[];
    void flush() {
      if (inline.isEmpty) return;
      final span = _spans(inline, _base(context), context);
      inline.clear();
      if (span.toPlainText().trim().isEmpty) return;
      out.add(_paragraph(span));
    }

    for (final node in nodes) {
      if (node is dom.Element && _isBlock(node.localName)) {
        flush();
        _block(node, out, context);
      } else {
        inline.add(node);
      }
    }
    flush();
  }

  static const _blockNames = {
    'p',
    'div',
    'section',
    'article',
    'header',
    'footer',
    'main',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'blockquote',
    'figure',
    'img',
    'hr',
    'table',
    'pre',
    'iframe',
    'video',
    'audio',
    'form',
    'script',
    'style',
    'noscript',
    'aside',
    'nav',
    'details',
  };

  bool _isBlock(String? name) => _blockNames.contains(name);

  Widget _paragraph(InlineSpan span, {EdgeInsets? padding}) => Padding(
    padding: padding ?? const EdgeInsets.only(bottom: 14),
    child: Text.rich(span),
  );

  void _block(dom.Element e, List<Widget> out, BuildContext context) {
    final brand = context.brand;
    switch (e.localName) {
      case 'script' || 'style' || 'noscript' || 'form' || 'nav':
        return;
      case 'div' ||
          'section' ||
          'article' ||
          'header' ||
          'footer' ||
          'main' ||
          'aside' ||
          'details':
        _blocks(e.nodes, out, context);
      case 'p':
        final span = _spans(e.nodes, _base(context), context);
        if (span.toPlainText().trim().isNotEmpty) out.add(_paragraph(span));
        // A paragraph that only wraps a picture.
        for (final img in e.querySelectorAll('img')) {
          if (span.toPlainText().trim().isEmpty) out.add(_image(img, null));
        }
      case 'h1' || 'h2' || 'h3' || 'h4' || 'h5' || 'h6':
        final level = int.parse(e.localName!.substring(1));
        out.add(
          Semantics(
            header: true,
            child: _paragraph(
              _spans(
                e.nodes,
                TextStyle(
                  color: brand.ink,
                  fontSize: level <= 2 ? 22 : 18,
                  height: 1.25,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.3,
                ),
                context,
              ),
              padding: const EdgeInsets.only(top: 14, bottom: 10),
            ),
          ),
        );
      case 'ul' || 'ol':
        final ordered = e.localName == 'ol';
        var index = 0;
        for (final li in e.children.where((c) => c.localName == 'li')) {
          index++;
          out.add(
            Padding(
              padding: const EdgeInsets.only(bottom: 8, left: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 24,
                    child: Text(
                      ordered ? '$index.' : '•',
                      style: _base(context).copyWith(
                        color: brand.accent,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text.rich(_spans(li.nodes, _base(context), context)),
                  ),
                ],
              ),
            ),
          );
        }
        out.add(const SizedBox(height: 6));
      case 'blockquote':
        out.add(
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.fromLTRB(16, 4, 4, 4),
            decoration: BoxDecoration(
              border: Border(left: BorderSide(color: brand.gold, width: 3)),
            ),
            child: Text.rich(
              _spans(
                e.nodes,
                _base(
                  context,
                ).copyWith(fontStyle: FontStyle.italic, color: brand.mutedInk),
                context,
              ),
            ),
          ),
        );
      case 'figure':
        final img = e.querySelector('img');
        final caption = e.querySelector('figcaption')?.text.trim();
        if (img != null) out.add(_image(img, caption));
      case 'img':
        out.add(_image(e, null));
      case 'hr':
        out.add(Divider(height: 32, color: brand.divider));
      case 'pre':
        out.add(
          Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: brand.surfaceMuted,
              borderRadius: BorderRadius.circular(12),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Text(
                e.text,
                style: TextStyle(
                  color: brand.ink,
                  fontFamily: 'monospace',
                  fontSize: 13,
                ),
              ),
            ),
          ),
        );
      case 'table':
        for (final row in e.querySelectorAll('tr')) {
          final cells = row.children
              .map((c) => c.text.trim())
              .where((t) => t.isNotEmpty);
          if (cells.isEmpty) continue;
          out.add(
            _paragraph(
              TextSpan(text: cells.join('  ·  '), style: _base(context)),
              padding: const EdgeInsets.only(bottom: 6),
            ),
          );
        }
      default:
        // iframe, video, audio: something the reader cannot draw honestly.
        out.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: OutlinedButton.icon(
              onPressed: widget.onOpenWeb,
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('This part of the post opens on the web'),
            ),
          ),
        );
    }
  }

  Widget _image(dom.Element img, String? caption) {
    final src = img.attributes['src'] ?? '';
    final uri = Uri.tryParse(src);
    if (uri == null || uri.scheme != 'https') return const SizedBox.shrink();
    final alt = (img.attributes['alt'] ?? '').trim();
    return Builder(
      builder: (context) {
        final brand = context.brand;
        return Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: CachedNetworkImage(
                  imageUrl: src,
                  memCacheWidth: 1200,
                  fit: BoxFit.fitWidth,
                  imageBuilder: (context, provider) => Image(
                    image: provider,
                    fit: BoxFit.fitWidth,
                    semanticLabel: alt.isEmpty ? null : alt,
                  ),
                  placeholder: (_, _) => AspectRatio(
                    aspectRatio: 16 / 9,
                    child: ColoredBox(color: brand.surfaceMuted),
                  ),
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
              if (caption != null && caption.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    caption,
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  TextSpan _spans(List<dom.Node> nodes, TextStyle style, BuildContext context) {
    final children = <InlineSpan>[];
    for (final node in nodes) {
      if (node is dom.Text) {
        final text = node.text.replaceAll(RegExp(r'\s+'), ' ');
        if (text.isNotEmpty) children.add(TextSpan(text: text));
      } else if (node is dom.Element) {
        switch (node.localName) {
          case 'br':
            children.add(const TextSpan(text: '\n'));
          case 'strong' || 'b':
            children.add(
              _spans(
                node.nodes,
                style.copyWith(fontWeight: FontWeight.w800),
                context,
              ),
            );
          case 'em' || 'i':
            children.add(
              _spans(
                node.nodes,
                style.copyWith(fontStyle: FontStyle.italic),
                context,
              ),
            );
          case 'code':
            children.add(
              _spans(
                node.nodes,
                style.copyWith(
                  fontFamily: 'monospace',
                  backgroundColor: context.brand.surfaceMuted,
                ),
                context,
              ),
            );
          case 'a':
            final href = Uri.tryParse(node.attributes['href'] ?? '');
            final linkable =
                href != null &&
                (href.scheme == 'https' || href.scheme == 'http');
            TapGestureRecognizer? recognizer;
            if (linkable) {
              recognizer = TapGestureRecognizer()
                ..onTap = () =>
                    launchUrl(href, mode: LaunchMode.externalApplication);
              _recognizers.add(recognizer);
            }
            children.add(
              TextSpan(
                children: [_spans(node.nodes, style, context)],
                style: linkable
                    ? style.copyWith(
                        color: context.brand.accent,
                        decoration: TextDecoration.underline,
                        decorationColor: context.brand.accent.withValues(
                          alpha: 0.5,
                        ),
                      )
                    : null,
                recognizer: recognizer,
              ),
            );
          case 'img' || 'script' || 'style':
            break;
          default:
            children.add(_spans(node.nodes, style, context));
        }
      }
    }
    return TextSpan(style: style, children: children);
  }
}
