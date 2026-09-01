package world.indigen.mobile

import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityException
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Asks Google Play what it thinks of this device.
 *
 * ── Why this is written here and not taken from pub.dev ───────────────────
 * The whole value of an integrity verdict is that the code producing it is the
 * code Play signed. A third-party plugin in that position is a dependency with
 * the power to quietly return a token from somewhere else, and it would have to
 * be audited on every upgrade for the rest of the project's life. The API it
 * would wrap is two calls, so it is wrapped here instead.
 *
 * ── Standard rather than Classic ──────────────────────────────────────────
 * The Standard Integrity API keeps a warmed-up token provider and answers a
 * request in a few hundred milliseconds; the Classic API goes to Google's
 * servers every time and takes seconds. Standard also has no per-day request
 * quota worth worrying about, which matters for an app that checks on launch
 * and again before a purchase.
 *
 * The trade is that the provider has to be prepared first — a slow call that
 * needs the network — so [warmUp] is fired once at start-up and the result is
 * kept. A request that arrives before the warm-up finished prepares one on the
 * spot rather than failing.
 */
class PlayIntegrityChannel(private val context: Context) {

    companion object {
        const val CHANNEL = "world.indigen.mobile/play_integrity"

        /**
         * Where the Cloud project number comes from.
         *
         * The google-services Gradle plugin writes the Firebase project number
         * into this string resource, and the Firebase project *is* the Cloud
         * project the Play Console app is linked to — so reading it here means
         * the number can never disagree with the google-services.json the
         * flavour was built with. Hardcoding it would be one more place to
         * update when an environment changes, and the one place nobody
         * remembers.
         */
        private const val PROJECT_NUMBER_RESOURCE = "gcm_defaultSenderId"
    }

    private var tokenProvider: StandardIntegrityTokenProvider? = null

    fun attachTo(messenger: BinaryMessenger) {
        MethodChannel(messenger, CHANNEL).setMethodCallHandler(::handle)
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "warmUp" -> warmUp(result)
            "requestToken" -> requestToken(call.argument<String>("requestHash"), result)
            else -> result.notImplemented()
        }
    }

    /** Prepares the token provider. Slow, once, and safe to call again. */
    private fun warmUp(result: MethodChannel.Result) {
        if (tokenProvider != null) {
            result.success(true)
            return
        }
        prepare(
            onReady = { result.success(true) },
            onError = { code, message -> result.error(code, message, null) },
        )
    }

    private fun requestToken(requestHash: String?, result: MethodChannel.Result) {
        if (requestHash.isNullOrEmpty()) {
            result.error("invalid_request", "A request hash is required.", null)
            return
        }

        val ready = tokenProvider
        if (ready != null) {
            fetch(ready, requestHash, result, retryOnFailure = true)
            return
        }
        prepare(
            onReady = { provider -> fetch(provider, requestHash, result, retryOnFailure = false) },
            onError = { code, message -> result.error(code, message, null) },
        )
    }

    private fun prepare(
        onReady: (StandardIntegrityTokenProvider) -> Unit,
        onError: (String, String) -> Unit,
    ) {
        val projectNumber = cloudProjectNumber()
        if (projectNumber == 0L) {
            // No google-services.json in this build. Every Firebase feature is
            // already degraded here, so this reports rather than crashes.
            onError("not_configured", "This build has no Cloud project number.")
            return
        }

        IntegrityManagerFactory.createStandard(context)
            .prepareIntegrityToken(
                PrepareIntegrityTokenRequest.builder()
                    .setCloudProjectNumber(projectNumber)
                    .build(),
            )
            .addOnSuccessListener { provider ->
                tokenProvider = provider
                onReady(provider)
            }
            .addOnFailureListener { error ->
                onError(errorCodeOf(error), error.message ?: "Integrity preparation failed.")
            }
    }

    private fun fetch(
        provider: StandardIntegrityTokenProvider,
        requestHash: String,
        result: MethodChannel.Result,
        retryOnFailure: Boolean,
    ) {
        provider
            .request(
                StandardIntegrityTokenRequest.builder()
                    .setRequestHash(requestHash)
                    .build(),
            )
            .addOnSuccessListener { token -> result.success(token.token()) }
            .addOnFailureListener { error ->
                // A prepared provider goes stale — Play expires it, the process
                // was restored from a saved state, the account changed. That
                // failure looks identical to a real one, so the first request
                // after it re-prepares once and tries again rather than
                // reporting a device problem that does not exist.
                if (retryOnFailure) {
                    tokenProvider = null
                    prepare(
                        onReady = { fresh -> fetch(fresh, requestHash, result, retryOnFailure = false) },
                        onError = { code, message -> result.error(code, message, null) },
                    )
                } else {
                    result.error(
                        errorCodeOf(error),
                        error.message ?: "Integrity request failed.",
                        null,
                    )
                }
            }
    }

    /**
     * Play's numeric error code as a string, or a generic label.
     *
     * The number is what Google's documentation is indexed by, so it is worth
     * carrying across to Dart intact — `-8` (too many requests) and `-9` (Play
     * Store not installed) call for completely different handling, and neither
     * is a reason to tell somebody their phone failed a security check.
     */
    private fun errorCodeOf(error: Throwable): String =
        if (error is StandardIntegrityException) {
            "play_integrity_${error.errorCode}"
        } else {
            "play_integrity_failed"
        }

    private fun cloudProjectNumber(): Long {
        val id = context.resources.getIdentifier(
            PROJECT_NUMBER_RESOURCE,
            "string",
            context.packageName,
        )
        if (id == 0) return 0L
        return context.getString(id).toLongOrNull() ?: 0L
    }
}
