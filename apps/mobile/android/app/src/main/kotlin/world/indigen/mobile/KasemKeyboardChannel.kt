package world.indigen.mobile

import android.app.Activity
import android.content.Intent
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/** The narrow bridge used by the Flutter settings page. Typed text never crosses it. */
internal class KasemKeyboardChannel(private val activity: Activity) {
    private val preferences = KasemKeyboardPreferences(activity.applicationContext)

    fun attachTo(messenger: BinaryMessenger) {
        MethodChannel(messenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "state" -> result.success(preferences.asMap(isEnabled()))
                "setPreference" -> {
                    when (val key = call.argument<String>("key")) {
                        "defaultLanguage" ->
                            preferences.defaultLanguage =
                                KeyboardLanguage.from(call.argument("value"))
                        "vibration" -> preferences.vibration = call.argument<Boolean>("value") ?: true
                        "sound" -> preferences.sound = call.argument<Boolean>("value") ?: false
                        else -> {
                            result.error("unknown_preference", "Unknown keyboard preference: $key", null)
                            return@setMethodCallHandler
                        }
                    }
                    result.success(preferences.asMap(isEnabled()))
                }
                "openInputMethodSettings" -> {
                    activity.startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
                    result.success(null)
                }
                "showInputMethodPicker" -> {
                    inputMethodManager().showInputMethodPicker()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun isEnabled(): Boolean = inputMethodManager().enabledInputMethodList.any {
        it.serviceInfo.packageName == activity.packageName &&
            it.serviceInfo.name == KasemInputMethodService::class.java.name
    }

    private fun inputMethodManager(): InputMethodManager =
        activity.getSystemService(InputMethodManager::class.java)

    private companion object {
        const val CHANNEL = "world.indigen.mobile/kasem_keyboard"
    }
}
