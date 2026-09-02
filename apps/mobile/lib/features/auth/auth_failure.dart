/// Why an authentication attempt did not succeed.
///
/// The kind is what the UI branches on — a cancelled account chooser is a
/// no-op, a configuration problem is worth reporting to the team, a network
/// problem is worth a retry — while [AuthFailure.message] is the sentence the
/// member actually reads.
enum AuthFailureKind {
  /// The member dismissed the provider sheet. Not an error.
  cancelled,

  /// This build is misconfigured (wrong client id, signing certificate, or a
  /// provider that is not enabled in the Firebase console).
  configuration,

  /// The request could not reach Firebase.
  network,

  /// The credentials were wrong, or the account does not exist.
  credentials,

  /// The email is already linked to a different sign-in method.
  accountConflict,

  /// Sign-in cannot run right now — Firebase is down for this launch, the
  /// account is disabled, or the platform does not support the provider.
  unavailable,

  /// Too many attempts in a short window.
  rateLimited,

  unknown,
}

/// A human-readable authentication failure surfaced in the UI.
class AuthFailure implements Exception {
  const AuthFailure(this.kind, this.message, {this.detail});

  /// Convenience for the common "we do not know, show this sentence" case.
  const AuthFailure.unknown(this.message)
    : kind = AuthFailureKind.unknown,
      detail = null;

  final AuthFailureKind kind;
  final String message;

  /// The provider's own verdict, verbatim, for somebody reporting this.
  ///
  /// Kept apart from [message] rather than appended to it. The message is
  /// written for a member who wants to get in; this is the error code and
  /// description Google actually returned, which is the only thing that tells
  /// anybody *which* of the half-dozen ways Google Sign-In can fail happened
  /// here. It used to go only to Crashlytics, which meant the one person who
  /// could see it was not the person holding the phone — so a member's report
  /// arrived as "it doesn't work" and there was nothing to add to it.
  ///
  /// Null whenever the failure came from our own code rather than a provider.
  final String? detail;

  bool get wasCancelled => kind == AuthFailureKind.cancelled;

  /// The same failure with [detail] attached, for a caller that knows which
  /// leg of the sign-in failed and wants to say so.
  AuthFailure withDetail(String? value) =>
      value == null || value.isEmpty ? this : AuthFailure(kind, message, detail: value);

  @override
  String toString() => detail == null ? message : '$message ($detail)';
}

/// Raised when a sign-in flow is dismissed by the member (for example closing
/// the Google account chooser). Callers treat this as a silent no-op.
class AuthCancelled implements Exception {
  const AuthCancelled();
}
