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
  const AuthFailure(this.kind, this.message);

  /// Convenience for the common "we do not know, show this sentence" case.
  const AuthFailure.unknown(this.message) : kind = AuthFailureKind.unknown;

  final AuthFailureKind kind;
  final String message;

  bool get wasCancelled => kind == AuthFailureKind.cancelled;

  @override
  String toString() => message;
}

/// Raised when a sign-in flow is dismissed by the member (for example closing
/// the Google account chooser). Callers treat this as a silent no-op.
class AuthCancelled implements Exception {
  const AuthCancelled();
}
