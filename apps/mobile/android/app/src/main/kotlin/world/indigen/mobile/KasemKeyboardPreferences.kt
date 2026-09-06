package world.indigen.mobile

import android.content.Context

internal enum class KeyboardLanguage(val storedValue: String) {
    KASEM("kasem"),
    ENGLISH("english");

    companion object {
        fun from(value: String?): KeyboardLanguage =
            entries.firstOrNull { it.storedValue == value } ?: KASEM
    }
}

/** Preferences owned by the native IME so they are available before Flutter starts. */
internal class KasemKeyboardPreferences(context: Context) {
    private val store = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    var defaultLanguage: KeyboardLanguage
        get() = KeyboardLanguage.from(store.getString(DEFAULT_LANGUAGE, null))
        set(value) = store.edit().putString(DEFAULT_LANGUAGE, value.storedValue).apply()

    var vibration: Boolean
        get() = store.getBoolean(VIBRATION, true)
        set(value) = store.edit().putBoolean(VIBRATION, value).apply()

    var sound: Boolean
        get() = store.getBoolean(SOUND, false)
        set(value) = store.edit().putBoolean(SOUND, value).apply()

    fun asMap(enabled: Boolean): Map<String, Any> = mapOf(
        "enabled" to enabled,
        "defaultLanguage" to defaultLanguage.storedValue,
        "vibration" to vibration,
        "sound" to sound,
    )

    private companion object {
        const val FILE_NAME = "kasem_keyboard"
        const val DEFAULT_LANGUAGE = "default_language"
        const val VIBRATION = "vibration"
        const val SOUND = "sound"
    }
}

