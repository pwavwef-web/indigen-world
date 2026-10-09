import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

ImageProvider<Object> audioArtworkProvider(String url) =>
    Uri.tryParse(url)?.scheme == 'file'
    ? FileImage(File.fromUri(Uri.parse(url)))
    : CachedNetworkImageProvider(url);

/// Artwork kept with a download uses the same surfaces as streamed artwork.
class AudioArtwork extends StatelessWidget {
  const AudioArtwork({
    required this.imageUrl,
    this.width,
    this.height,
    this.fit,
    this.memCacheWidth,
    this.fadeInDuration = AppMotion.standard,
    this.placeholder,
    this.errorWidget,
    super.key,
  });
  final String imageUrl;
  final double? width, height;
  final BoxFit? fit;
  final int? memCacheWidth;
  final Duration fadeInDuration;
  final Widget Function(BuildContext, String)? placeholder;
  final Widget Function(BuildContext, String, Object)? errorWidget;
  @override
  Widget build(BuildContext context) {
    if (Uri.tryParse(imageUrl)?.scheme == 'file') {
      return Image.file(
        File.fromUri(Uri.parse(imageUrl)),
        width: width,
        height: height,
        fit: fit,
        cacheWidth: memCacheWidth,
        errorBuilder: (context, error, stack) =>
            errorWidget?.call(context, imageUrl, error) ??
            const SizedBox.shrink(),
      );
    }
    return CachedNetworkImage(
      imageUrl: imageUrl,
      width: width,
      height: height,
      fit: fit,
      memCacheWidth: memCacheWidth,
      placeholder: placeholder,
      fadeInDuration: motionOr(context, fadeInDuration),
      errorWidget: errorWidget,
    );
  }
}
