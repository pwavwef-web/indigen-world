import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// A refusal worth showing somebody, in the words the server used.
class PhoneVerificationFailure implements Exception {
  const PhoneVerificationFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// The two calls behind proving a number belongs to this account.
///
/// Everything real happens on the server: the code is generated there, only its
/// hash is stored, and the flag it eventually sets is one the Security Rules
/// refuse to every client — including the one that owns the profile. There is
/// deliberately nothing here that could be made to lie by a modified app.
class PhoneVerificationRepository {
  const PhoneVerificationRepository(this._functions);

  final FirebaseFunctions _functions;

  static const _timeout = Duration(seconds: 30);

  /// Sends a code to [phone]. Returns when it is on its way.
  Future<void> start(String phone) =>
      _call('startPhoneVerification', {'phone': phone.trim()});

  /// Answers the challenge. Returns normally only when the number is verified.
  Future<void> confirm(String code) =>
      _call('confirmPhoneVerification', {'code': code.trim()});

  Future<void> _call(String name, Map<String, Object?> payload) async {
    try {
      final callable = _functions.httpsCallable(
        name,
        options: HttpsCallableOptions(timeout: _timeout),
      );
      await callable.call<Object?>(payload);
    } on FirebaseFunctionsException catch (error) {
      // The callable's own message is the useful one — it says whether the
      // number was malformed, the code wrong, or the wait too short. A generic
      // failure here would leave somebody retyping a correct code.
      throw PhoneVerificationFailure(
        error.message?.trim().isNotEmpty ?? false
            ? error.message!.trim()
            : 'That did not go through. Check your connection and try again.',
      );
    } on Object {
      throw const PhoneVerificationFailure(
        'That did not go through. Check your connection and try again.',
      );
    }
  }
}

final phoneVerificationRepositoryProvider =
    Provider<PhoneVerificationRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return PhoneVerificationRepository(FirebaseFunctions.instance);
    });
