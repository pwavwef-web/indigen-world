package world.indigen.mobile

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreateRestoreCredentialRequest
import androidx.credentials.CreateRestoreCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetRestoreCredentialOption
import androidx.credentials.RestoreCredential
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.restorecredential.E2eeUnavailableException
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.lang.ref.WeakReference
import java.util.concurrent.Executor

/**
 * Zero-Tap Sign-In: the device half of Android's Restore Credentials API.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 * Google Play requires, from April 2027, that an app supporting sign-in signs
 * a member back in without a tap when they move to a new Android handset. The
 * mechanism is a restore key: a public-key credential the system mints after a
 * member authenticates, carries to the next device with the backup transport,
 * and lets the app assert there before anybody has typed anything.
 *
 * Three operations, and this class is all three of them:
 *
 *   create  — mint a key for the member who just signed in.
 *   get     — assert the key the new device was given.
 *   clear   — forget it, when somebody signs out.
 *
 * ── Why it is written here rather than taken from pub.dev ─────────────────
 * The same reason [PlayIntegrityChannel] is. This is authentication: a plugin
 * sitting in this position could hand back an assertion from somewhere else,
 * and would have to be re-audited on every upgrade for the life of the
 * project. The API it would wrap is three calls.
 *
 * ── Nothing here decides anything ─────────────────────────────────────────
 * The JSON in is the relying party's, the JSON out goes straight back to it,
 * and the private key never leaves the system credential store. This code
 * carries bytes between Credential Manager and `restore-credentials.ts`, which
 * is the only party that ever decides a signature was good.
 *
 * ── Failure is ordinary ───────────────────────────────────────────────────
 * Every one of these calls fails routinely and harmlessly: Android 9 is the
 * floor, Play services may be old, a device restored from nothing has no key,
 * a member without a screen lock cannot back one up. None of that is an error
 * anybody should read about — it just means the sign-in screen appears, which
 * is what happens today. So failures come back as a named code the Dart side
 * logs and swallows, never as something a member is shown.
 */
class RestoreCredentialChannel(activity: Activity) {

    companion object {
        const val CHANNEL = "world.indigen.mobile/restore_credentials"

        /**
         * Restore Credentials needs Android 9.
         *
         * The app's own floor is API 24, so a real share of the install base
         * is below this and will never see a zero-tap restore. That is the
         * documented limit of the feature rather than a gap to work around.
         */
        private const val MINIMUM_SDK = Build.VERSION_CODES.P
    }

    /**
     * Weak on purpose. Credential Manager wants an Activity — it is allowed to
     * put UI on screen, even though the restore flows never do — and this
     * channel is constructed inside `configureFlutterEngine`, which runs again
     * on every fresh Activity. A strong reference here would leak the previous
     * one; a cleared weak reference simply reports the operation unavailable,
     * which is already a case every caller handles.
     */
    private val activityRef = WeakReference(activity)
    private val appContext: Context = activity.applicationContext

    /**
     * Where Credential Manager's answers land.
     *
     * The main thread, because a [MethodChannel.Result] may only be completed
     * there — replying from the executor's own thread is the kind of bug that
     * works on every device in the room and crashes on somebody else's.
     * Built from the main looper rather than `Context.getMainExecutor()` so
     * the class carries no API-28 call site of its own; the version gate is
     * already in [handle], and one gate is easier to trust than two.
     */
    private val mainExecutor: Executor = Executor(Handler(Looper.getMainLooper())::post)

    fun attachTo(messenger: BinaryMessenger) {
        MethodChannel(messenger, CHANNEL).setMethodCallHandler(::handle)
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < MINIMUM_SDK) {
            result.error("unsupported", "Restore Credentials needs Android 9 or later.", null)
            return
        }
        when (call.method) {
            "isSupported" -> result.success(true)
            "create" -> create(
                call.argument<String>("requestJson"),
                call.argument<Boolean>("cloudBackup") ?: true,
                result,
            )
            "get" -> get(call.argument<String>("requestJson"), result)
            "clear" -> clear(result)
            else -> result.notImplemented()
        }
    }

    /**
     * Mints a restore key from the relying party's creation options.
     *
     * [cloudBackup] asks for the key to be included in the member's encrypted
     * Google backup as well as kept on the device. It is what makes a restore
     * work when somebody sets up a new phone from the cloud rather than over a
     * cable, so it is worth asking for — but it needs a screen lock and backup
     * switched on, and a device without those raises
     * [E2eeUnavailableException]. That is not a failure: the same key is still
     * worth having for the cable path, so the request is made again without
     * cloud backup rather than abandoned. See the Restore Credentials guide.
     */
    private fun create(requestJson: String?, cloudBackup: Boolean, reply: MethodChannel.Result) {
        if (requestJson.isNullOrEmpty()) {
            reply.error("invalid_request", "Creation options are required.", null)
            return
        }
        val activity = activityRef.get()
        if (activity == null) {
            reply.error("no_activity", "No activity is attached.", null)
            return
        }

        CredentialManager.create(appContext).createCredentialAsync(
            activity,
            CreateRestoreCredentialRequest(requestJson, cloudBackup),
            null,
            mainExecutor,
            object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
                override fun onResult(result: CreateCredentialResponse) {
                    val restore = result as? CreateRestoreCredentialResponse
                    if (restore == null) {
                        reply.error(
                            "unexpected_response",
                            "The system returned a credential that is not a restore key.",
                            null,
                        )
                        return
                    }
                    reply.success(restore.responseJson)
                }

                override fun onError(e: CreateCredentialException) {
                    if (e is E2eeUnavailableException && cloudBackup) {
                        create(requestJson, cloudBackup = false, reply = reply)
                        return
                    }
                    reply.error(e.type, e.errorMessage?.toString() ?: e.message, null)
                }
            },
        )
    }

    /**
     * Asserts the restore key this device was given, if it was given one.
     *
     * Returns null rather than failing when there is no key to assert, because
     * that is the ordinary case on every device that was set up from scratch —
     * and telling those apart from a real fault is the difference between a
     * quiet sign-in screen and a support conversation.
     */
    private fun get(requestJson: String?, reply: MethodChannel.Result) {
        if (requestJson.isNullOrEmpty()) {
            reply.error("invalid_request", "Request options are required.", null)
            return
        }
        val activity = activityRef.get()
        if (activity == null) {
            reply.error("no_activity", "No activity is attached.", null)
            return
        }

        CredentialManager.create(appContext).getCredentialAsync(
            activity,
            GetCredentialRequest(listOf(GetRestoreCredentialOption(requestJson))),
            null,
            mainExecutor,
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    val credential = result.credential as? RestoreCredential
                    reply.success(credential?.authenticationResponseJson)
                }

                override fun onError(e: GetCredentialException) {
                    reply.error(e.type, e.errorMessage?.toString() ?: e.message, null)
                }
            },
        )
    }

    /** Forgets the key on this device. Called when somebody signs out. */
    private fun clear(reply: MethodChannel.Result) {
        CredentialManager.create(appContext).clearCredentialStateAsync(
            ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL),
            null,
            mainExecutor,
            object : CredentialManagerCallback<Void?, ClearCredentialException> {
                override fun onResult(result: Void?) {
                    reply.success(true)
                }

                override fun onError(e: ClearCredentialException) {
                    reply.error(e.type, e.errorMessage?.toString() ?: e.message, null)
                }
            },
        )
    }
}
