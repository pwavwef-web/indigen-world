package world.indigen.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Publishes the long-press shortcuts on the app icon.
 *
 * The list itself lives in Dart (`lib/core/app_shortcuts.dart`), next to the
 * routes the shortcuts open; this only hands it to the launcher. Dynamic rather
 * than a static `shortcuts.xml` because a static shortcut has to name its
 * target package, and this app is built under three of them.
 *
 * Each shortcut fires an `indigen://open/<id>` VIEW intent at [MainActivity],
 * which the app already answers through the same link handling a shared post
 * link uses — so a shortcut pressed on a cold start waits behind the start-up
 * gate like any other link, instead of skipping it.
 */
class AppShortcutsChannel(private val context: Context) {

    companion object {
        const val CHANNEL = "world.indigen.mobile/app_shortcuts"
    }

    fun attachTo(messenger: BinaryMessenger) {
        MethodChannel(messenger, CHANNEL).setMethodCallHandler(::handle)
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != "publish") {
            result.notImplemented()
            return
        }
        try {
            val entries = call.arguments as? List<*> ?: emptyList<Any>()
            val shortcuts = entries.mapNotNull { entry ->
                val map = entry as? Map<*, *> ?: return@mapNotNull null
                val id = map["id"] as? String ?: return@mapNotNull null
                val uri = map["uri"] as? String ?: return@mapNotNull null
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
                    .setClass(context, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                val builder = ShortcutInfoCompat.Builder(context, id)
                    .setShortLabel(map["shortLabel"] as? String ?: id)
                    .setLongLabel(map["longLabel"] as? String ?: id)
                    .setIntent(intent)
                val icon = map["icon"] as? String
                val resource = icon?.let {
                    context.resources.getIdentifier(it, "drawable", context.packageName)
                } ?: 0
                if (resource != 0) {
                    builder.setIcon(IconCompat.createWithResource(context, resource))
                }
                builder.build()
            }
            // Never more than the launcher shows: anything past the limit is
            // refused outright rather than trimmed.
            val limit = ShortcutManagerCompat.getMaxShortcutCountPerActivity(context)
            ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts.take(limit))
            result.success(null)
        } catch (error: Exception) {
            result.error("shortcuts", error.message, null)
        }
    }
}
