package world.indigen.mobile

import android.content.pm.PackageManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.security.MessageDigest

/**
 * Reports the identity this build actually runs as.
 *
 * Google Sign-In only works for a build whose *package id and signing
 * certificate* pair has been registered in the Firebase project. When the pair
 * is missing, Android and Firebase both report it obliquely — an ordinary
 * "cancelled" from the account sheet, or "there was an error while trying to
 * get your package certificate hash" from the hosted flow — and neither says
 * which certificate it was actually signed with. Play App Signing makes that
 * worse: a release is re-signed after upload, so the certificate on the device
 * is one nobody built with locally.
 *
 * So the app reads it off itself. The values below are what Firebase compares
 * against, taken from the same place the Play services libraries take them,
 * which makes a configuration gap a thing you can read in Settings rather than
 * infer from a broken button.
 */
private const val DIAGNOSTICS_CHANNEL = "world.indigen.mobile/app_signature"

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, DIAGNOSTICS_CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "read") result.success(signature()) else result.notImplemented()
            }
    }

    private fun signature(): Map<String, Any?> {
        val certificates = certificates()
        // The first certificate is the one Google Play services hashes, so it
        // is the one that has to be registered. Later entries only appear
        // after a signing-key rotation and are reported for completeness.
        val primary = certificates.firstOrNull()
        return mapOf(
            "packageName" to packageName,
            "sha1" to primary?.let { digest(it, "SHA-1") },
            "sha256" to primary?.let { digest(it, "SHA-256") },
            "certificateCount" to certificates.size,
            "installer" to installer(),
            "androidSdk" to Build.VERSION.SDK_INT,
        )
    }

    /** The raw signing certificates, newest signing scheme first. */
    private fun certificates(): List<ByteArray> = try {
        val manager = packageManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val info = manager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            val signing = info.signingInfo
            when {
                signing == null -> emptyList()
                signing.hasMultipleSigners() -> signing.apkContentsSigners.map { it.toByteArray() }
                else -> signing.signingCertificateHistory.map { it.toByteArray() }
            }
        } else {
            @Suppress("DEPRECATION")
            manager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
                .signatures
                .orEmpty()
                .filterNotNull()
                .map { it.toByteArray() }
        }
    } catch (_: PackageManager.NameNotFoundException) {
        emptyList()
    }

    /** Lowercase, colon-free hex — the form Firebase and the CLI both accept. */
    private fun digest(certificate: ByteArray, algorithm: String): String =
        MessageDigest.getInstance(algorithm)
            .digest(certificate)
            .joinToString(separator = "") { "%02x".format(it) }

    /**
     * Which store installed this build. A release re-signed by Play App
     * Signing reports `com.android.vending`, which is the tell that the
     * certificate above is Google's rather than the upload key.
     */
    private fun installer(): String? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            packageManager.getInstallSourceInfo(packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            packageManager.getInstallerPackageName(packageName)
        }
    } catch (_: Exception) {
        null
    }
}
