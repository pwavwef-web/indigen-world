package world.indigen.mobile

import java.util.Locale

/**
 * The deliberately small language model behind the first keyboard release.
 *
 * This is layout data, not a dictionary: the IME never records what somebody
 * types and never sends text to Flutter or to the network. Keeping the rules
 * here also gives the future orthography review one obvious place to change
 * keys without touching Android input-connection code.
 */
internal object KasemKeyboardLayout {
    val letterRows = listOf(
        listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
        listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
        listOf("z", "x", "c", "v", "b", "n", "m"),
    )

    val numberRows = listOf(
        listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
        listOf("@", "#", "¢", "₵", "&", "-", "+", "(", ")", "/"),
        listOf("[", "]", "{", "}", "<", ">", "=", "_", "%"),
    )

    /** Draft shortcuts from the project brief, pending native-speaker review. */
    val longPress = mapOf(
        "e" to "ɛ",
        "o" to "ɔ",
        "c" to "ch",
        "n" to "ny",
        "k" to "kw",
        "g" to "gw",
        "p" to "pw",
        "ŋ" to "ŋw",
    )

    fun applyCase(text: String, shift: ShiftState): String = when (shift) {
        ShiftState.LOWER -> text
        ShiftState.UPPER_ONCE -> text.replaceFirstChar { it.titlecase(Locale.ROOT) }
        ShiftState.CAPS_LOCK -> text.uppercase(Locale.ROOT)
    }
}

internal enum class ShiftState {
    LOWER,
    UPPER_ONCE,
    CAPS_LOCK,
}

