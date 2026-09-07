package world.indigen.mobile

import java.util.Locale

/**
 * The deliberately small language model behind the Kasem keyboard.
 *
 * This is layout data, not a dictionary: the IME never records what somebody
 * types and never sends text to Flutter or to the network. Keeping the rules
 * here also gives the orthography review one obvious place to change keys
 * without touching Android input-connection code.
 *
 * ── The number this file exists to serve ─────────────────────────────────
 * 785 of the 1200 published dictionary entries carry at least one letter that
 * does not exist on a stock Android English keyboard — ɩ in 640 headwords,
 * ʋ in 195, ə in 177, ɔ in 156, ŋ in 115, ɛ in 9. (Counted in
 * `apps/mobile/lib/domain/kasem_orthography.dart`.)
 *
 * The first cut of this keyboard offered ɛ, ɔ and ŋ, and reached ɛ and ɔ a
 * second way by long-pressing e and o. It offered no way at all to type ɩ, ʋ
 * or ə — which is to say it could not type the three commonest extended
 * letters in the language, including the one that appears in more than half of
 * all headwords. A Kasem keyboard that cannot produce ɩ has not solved the
 * problem it was built for, and the workaround it leaves is the one that
 * causes the damage: type `i` instead, and the word is filed under a spelling
 * that is a different word.
 *
 * So every extended letter now has a dedicated key, on its own row, always
 * visible in Kasem mode. That is the one arrangement whose reachability does
 * not depend on a contributor discovering an invisible gesture.
 */
internal object KasemKeyboardLayout {
    val letterRows = listOf(
        listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
        listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
        listOf("z", "x", "c", "v", "b", "n", "m"),
    )

    /**
     * The letters of Kasem that no stock keyboard produces, in frequency order
     * of their appearance in the published archive.
     *
     * Drawn as a full row above the QWERTY block whenever the keyboard is in
     * Kasem mode. Six keys across is comfortable at any phone width, and the
     * row costs one key height — which is the correct price for making two
     * thirds of the vocabulary typeable.
     */
    val extendedRow = listOf("ɩ", "ʋ", "ə", "ɔ", "ŋ", "ɛ")

    val numberRows = listOf(
        listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
        listOf("@", "#", "¢", "₵", "&", "-", "+", "(", ")", "/"),
        listOf("[", "]", "{", "}", "<", ">", "=", "_", "%"),
    )

    /**
     * What a key produces when it is held down.
     *
     * ── Two kinds of alternate, and they are not the same kind of thing ───
     * The vowels map to their extended counterparts, which is a second route
     * to a letter that also has its own key above — belt and braces for the
     * muscle memory of somebody used to an African-language keyboard that
     * works this way. The consonants map to digraphs, which are a convenience
     * rather than a character that is otherwise unreachable.
     *
     * The digraph shortcuts remain a draft pending review with fluent Kasem
     * speakers. They are cheap to change and nothing depends on them, which is
     * exactly the property a provisional decision should have.
     */
    val longPress = mapOf(
        "e" to "ɛ",
        "i" to "ɩ",
        "o" to "ɔ",
        "u" to "ʋ",
        "a" to "ə",
        "n" to "ŋ",
        "c" to "ch",
        "k" to "kw",
        "g" to "gw",
        "p" to "pw",
        "ɛ" to "ɛ́",
        "ɩ" to "ɩ́",
        "ə" to "ə́",
        "ɔ" to "ɔ́",
        "ŋ" to "ŋw",
        "ʋ" to "ʋ́",
    )

    /**
     * The mark drawn in a key's top corner when it has an alternate.
     *
     * ── Why a hint is not optional ───────────────────────────────────────
     * A long-press with no visual sign of itself is a feature only the person
     * who wrote it knows about. The first cut of this keyboard reached ɛ and ɔ
     * only that way and drew nothing at all, so for every user who had not
     * read the release notes those letters did not exist. Real keyboards have
     * shown this hint since the first Android soft keyboard, and it costs a
     * seven-point glyph in the corner of a key.
     *
     * Returns null for keys that produce nothing extra, so no hint is drawn
     * where there is nothing to hint at.
     */
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
