import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';

/// Signs the member out, taking this phone's push registration with them.
///
/// The one way out of an account in the app. There used to be two: Settings
/// dropped the device's registration first, and the Community drawer's own
/// Sign out did not — so on a shared phone the next person could be woken by
/// the previous account's replies and messages. The order matters as well as
/// the step: the registration can only be removed while the account that owns
/// it is still signed in and the rules still let it delete its own row.
Future<void> signOutOfApp(WidgetRef ref) async {
  await unregisterThisDevice(ref);
  await ref.read(authRepositoryProvider)?.signOut();
}
