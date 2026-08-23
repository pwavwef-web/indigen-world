import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether [FirebaseBootstrap.initialize] succeeded for this launch.
///
/// Firebase initialisation is allowed to fail (for example when the device is
/// offline on first run), so every feature that touches Firebase — auth,
/// Firestore, Storage — must degrade gracefully when this is `false`. `main`
/// overrides it with the real bootstrap result; the `false` default means tests
/// and any un-overridden environment behave as offline (guest + curated feed).
final firebaseReadyProvider = Provider<bool>((ref) => false);
