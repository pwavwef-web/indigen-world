import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';

/// The web host the app answers for.
///
/// Both spellings, because a link pasted into a chat is as likely to carry the
/// `www.` as not, and Android verifies each host separately — the manifest
/// claims both and so must this.
const _webHosts = {'indigenworld.com', 'www.indigenworld.com'};

/// The custom scheme, for the cases App Links cannot reach.
///
/// A verified `https` link never gets here: Android hands it straight to the
/// app. This is the fallback the website's post page offers when verification
/// did not take — a sideloaded or debug build whose signing certificate is not
/// in `assetlinks.json`, or a browser that insists on opening links itself.
const _appScheme = 'indigen';

/// The path prefixes this app claims on the website's domain.
///
/// Deliberately short. Everything here is also declared in the Android
/// manifest's App Links filter and in `apps/website/config/app-links.json`, and
/// the three have to agree: a path claimed in the manifest but missing here
/// opens the app on the router's error screen, and a path claimed by the app
/// but with no page on the website leaves anybody without the app on a 404.
/// `/post/` is the only link the app actually shares today.
const _claimedPrefixes = <String>{'post'};

/// The in-app route for an incoming [uri], or null when this is not a link the
/// app should answer for.
///
/// Returning null is the normal outcome for most of the site — somebody
/// following a link to `/about` wants the website, and an app that swallowed it
/// would be taking over pages it has no version of.
String? appRouteForLink(Uri uri) {
  final isWebLink = (uri.scheme == 'https' || uri.scheme == 'http') &&
      _webHosts.contains(uri.host.toLowerCase());
  // A custom-scheme link puts its first segment in the host: `indigen://post/1`
  // parses as host `post`, path `/1`.
  final isAppLink = uri.scheme == _appScheme;
  if (!isWebLink && !isAppLink) return null;

  final segments = <String>[
    if (isAppLink && uri.host.isNotEmpty) uri.host,
    ...uri.pathSegments,
  ].where((segment) => segment.isNotEmpty).toList(growable: false);

  if (segments.length != 2) return null;
  final [prefix, id] = segments;
  if (!_claimedPrefixes.contains(prefix)) return null;
  // `pathSegments` hands back decoded segments, so a segment carrying its own
  // separators is not an id at all — it is a longer path that arrived encoded.
  if (id.contains('/') || id.contains('?') || id.contains('#')) return null;

  // Re-encoded because the result is a location string go_router parses, and
  // go_router decodes path parameters again on the way out. A Firestore id
  // passes through untouched; anything stranger survives the round trip.
  return '/$prefix/${Uri.encodeComponent(id)}';
}

/// Routes links that arrive from outside the app.
///
/// Watched by the shell, and only by the shell, for the same reason the push
/// registration is: the link has to land on top of a running app, not instead
/// of one. Feeding [pendingPushRouteProvider] rather than pushing directly is
/// what buys that — the shell already reads that provider once it has a router,
/// so a link tapped during a cold start waits behind onboarding and the
/// notifications primer instead of skipping them, and the route it opens has
/// the shell beneath it to go back to.
///
/// This is also why the app does not set `flutter_deeplinking_enabled`. That
/// flag hands the incoming URL to go_router as the app's initial location,
/// which would replace the startup gate rather than sit on top of it.
final incomingLinksProvider = Provider<void>((ref) {
  final links = AppLinks();
  var disposed = false;

  void route(Uri? uri) {
    if (disposed || uri == null) return;
    final route = appRouteForLink(uri);
    if (route == null) {
      debugPrint('Ignoring deep link this build does not claim: $uri');
      return;
    }
    ref.read(pendingPushRouteProvider.notifier).set(route);
  }

  // Every incoming link, including the one that started a cold launch: the
  // plugin holds the launch intent and replays it to the first subscriber, so
  // this alone covers both. Asking `getInitialLink()` as well would route that
  // first link twice and push the post onto the stack twice with it.
  final subscription = links.uriLinkStream.listen(
    route,
    onError: (Object error) => debugPrint('Deep link stream failed: $error'),
  );

  ref.onDispose(() {
    disposed = true;
    unawaited(subscription.cancel());
  });
});
