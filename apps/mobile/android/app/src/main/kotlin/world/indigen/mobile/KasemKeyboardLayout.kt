package world.indigen.mobile

import java.util.Locale

/** Ghana Kasem spelling, BGL Kasem Orthography (1997), pages 13–29.
 * IPA vowel symbols are not ordinary written letters. Keep English QWERTY
 * available separately and use only the book's letters in Kasem mode.
 */
internal object KasemKeyboardLayout {
    val letterRows = listOf(
        listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
        listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
        listOf("z", "x", "c", "v", "b", "n", "m"),
    )

    val kasemRows = listOf(
        listOf("w", "e", "r", "t", "y", "u", "i", "o", "p"),
        listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
        listOf("z", "v", "b", "n", "m"),
    )

    // Tone is used only for the distinctions explained in the spelling guide.
    val extendedRow = listOf("ɛ", "ɔ", "ŋ", "ch", "ny", "́", "̀")

    val numberRows = listOf(
        listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
        listOf("@", "#", "¢", "₵", "&", "-", "+", "(", ")", "/"),
        listOf("[", "]", "{", "}", "<", ">", "=", "_", "%"),
    )

    val longPress = mapOf(
        "a" to "á", "e" to "ɛ", "o" to "ɔ", "n" to "ŋ",
        "w" to "wó", "y" to "yé", "d" to "dé",
        "k" to "kw", "g" to "gw", "p" to "pw", "ŋ" to "ŋw",
        "ch" to "chw", "ny" to "nyw",
    )

    fun hintFor(key: String): String? = longPress[key]

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
