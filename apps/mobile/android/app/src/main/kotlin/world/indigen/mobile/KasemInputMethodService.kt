package world.indigen.mobile

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.text.Spannable
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.SuperscriptSpan
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.inputmethodservice.InputMethodService

/**
 * Offline-first Kasem Android input method.
 *
 * The IME contains no prediction, telemetry or typed-text logging. Every key
 * writes directly to the active app's InputConnection.
 *
 * ── What changed after the first review, and why ─────────────────────────
 *  * Every extended Kasem letter is now reachable. The first cut could not
 *    type ɩ, ʋ or ə at all — between them the commonest letters in the
 *    archive, ɩ alone appearing in 640 of 1200 headwords. They have their own
 *    always-visible row now; see `KasemKeyboardLayout.extendedRow`.
 *  * Long-press alternates draw a hint. A gesture with no visual sign of
 *    itself is a feature only its author knows about.
 *  * The keyboard no longer rebuilds itself on every keystroke. Shifting used
 *    to tear down and re-allocate forty Buttons and their drawables per typed
 *    character, which is the sort of thing that is invisible on a test device
 *    and miserable on the phones this app is actually for.
 *  * Backspace repeats when held. Deleting a sentence took forty taps.
 *  * Keys meet the 48dp touch-target minimum in portrait, and shrink in
 *    landscape rather than eating the screen.
 *  * The palette follows the phone's dark theme.
 */
class KasemInputMethodService : InputMethodService() {
    private lateinit var preferences: KasemKeyboardPreferences
    private lateinit var keyboardRoot: LinearLayout
    private var language = KeyboardLanguage.KASEM
    private var shift = ShiftState.LOWER
    private var symbols = false
    private var lastShiftTap = 0L
    private var dark = false

    /**
     * Whether the user has picked a language since the process started.
     *
     * The stored preference is the language the keyboard OPENS in, not a
     * setting that reasserts itself. Somebody who switches to English to type
     * a URL and then taps the next field should still be in English; resetting
     * on every `onStartInputView` made the switch feel broken in exactly the
     * situation it exists for.
     */
    private var languageChosenThisSession = false

    /** Every letter key, so a case change can relabel instead of rebuild. */
    private val letterKeys = mutableListOf<Pair<Button, String>>()
    private var shiftKey: Button? = null

    private val repeatHandler = Handler(Looper.getMainLooper())
    private var repeatRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        preferences = KasemKeyboardPreferences(this)
    }

    override fun onCreateInputView(): View {
        dark = isNightMode()
        keyboardRoot = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(6), dp(6), dp(6), dp(BASE_BOTTOM_PADDING_DP))
            setBackgroundColor(palette().background)
        }
        applyNavigationBarInset(keyboardRoot)
        drawKeyboard()
        return keyboardRoot
    }

    /**
     * Keeps the bottom row clear of the navigation bar.
     *
     * ── Why an input method has to do this for itself ────────────────────
     * From Android 15, a window belonging to an app that targets SDK 35 or
     * above is laid out edge to edge, and an IME's input view is such a window
     * — it is our app's window, governed by our app's target. Without this the
     * bottom row of keys is drawn *underneath* the gesture handle, so on a
     * gesture-navigation phone the space bar and the enter key share their
     * lower half with the system's own swipe target. The user's tap goes to
     * whichever wins.
     *
     * Written against the platform API rather than `WindowInsetsCompat` so it
     * costs no dependency, and it is deliberately safe in both directions: on a
     * device or an Android version where the system already insets the IME
     * window, `navigationBars()` reports zero here and the padding is exactly
     * what it was. So this is a no-op where it is not needed rather than a
     * second correction stacked on top of the system's.
     *
     * The base padding is re-read from a constant rather than from the view, so
     * repeated inset callbacks cannot accumulate.
     */
    private fun applyNavigationBarInset(root: View) {
        root.setOnApplyWindowInsetsListener { view, insets ->
            val bottom = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                insets.getInsets(WindowInsets.Type.navigationBars()).bottom
            } else {
                @Suppress("DEPRECATION")
                insets.systemWindowInsetBottom
            }
            view.setPadding(
                view.paddingLeft,
                view.paddingTop,
                view.paddingRight,
                dp(BASE_BOTTOM_PADDING_DP) + bottom,
            )
            // Returned unconsumed: nothing else is competing for it, and
            // swallowing insets is how a child stops receiving them later.
            insets
        }
        root.requestApplyInsets()
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        if (!languageChosenThisSession) language = preferences.defaultLanguage
        symbols = isNumericField(info)
        shift = if (!symbols && shouldStartShifted(info)) {
            ShiftState.UPPER_ONCE
        } else {
            ShiftState.LOWER
        }
        if (::keyboardRoot.isInitialized) {
            val nowDark = isNightMode()
            if (nowDark != dark) {
                dark = nowDark
                keyboardRoot.setBackgroundColor(palette().background)
            }
            drawKeyboard()
        }
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        // A held backspace that outlives the view would keep deleting into
        // whatever the user opened next.
        stopRepeat()
        super.onFinishInputView(finishingInput)
    }

    override fun onEvaluateFullscreenMode(): Boolean = false

    private fun drawKeyboard() {
        letterKeys.clear()
        shiftKey = null
        keyboardRoot.removeAllViews()
        keyboardRoot.addView(statusRow())
        if (symbols) drawSymbols() else drawLetters()
    }

    private fun statusRow(): View = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(5), 0, dp(5), dp(3))
        val colours = palette()
        addView(TextView(context).apply {
            text = if (language == KeyboardLanguage.KASEM) "KASEM" else "ENGLISH"
            setTextColor(colours.accent)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.12f
        }, LinearLayout.LayoutParams(0, dp(22), 1f))
        addView(TextView(context).apply {
            text = "Local · private"
            setTextColor(colours.mutedInk)
            textSize = 11f
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
        }, LinearLayout.LayoutParams(0, dp(22), 1f))
    }

    private fun drawLetters() {
        // ── The row that makes this a Kasem keyboard ────────────────────
        // Always visible in Kasem mode, above the QWERTY block, because the
        // letters on it are the reason the keyboard exists and reachability
        // through a hidden gesture is not reachability.
        if (language == KeyboardLanguage.KASEM) {
            addRow(KasemKeyboardLayout.extendedRow.map { letterKey(it) })
        }

        KasemKeyboardLayout.letterRows.take(2).forEach { row ->
            addRow(row.map { letterKey(it) })
        }

        addRow(buildList {
            add(shiftKeyView())
            addAll(KasemKeyboardLayout.letterRows[2].map { letterKey(it) })
            add(backspaceKey())
        })

        addRow(buildList {
            add(key("123", 1.35f, special = true, description = "Numbers and symbols") {
                symbols = true
                drawKeyboard()
            })
            add(textKey(","))
            add(key("space", 4.2f, description = "Space") { commit(" ") })
            add(textKey("."))
            add(key(languageSwitchLabel(), 1.25f, special = true,
                description = "Switch between Kasem and English",
                longPress = { showSystemInputPicker() }) { toggleLanguage() })
            add(key(enterLabel(), 1.25f, special = true, description = "Enter") { enter() })
        })
    }

    private fun drawSymbols() {
        KasemKeyboardLayout.numberRows.forEach { row ->
            addRow(row.map { textKey(it) })
        }
        addRow(listOf(
            key("ABC", 1.4f, special = true, description = "Letters") {
                symbols = false
                drawKeyboard()
            },
            textKey(","),
            key("space", 3.4f, description = "Space") { commit(" ") },
            textKey("."),
            backspaceKey(),
            key(enterLabel(), 1.25f, special = true, description = "Enter") { enter() },
        ))
    }

    /**
     * A letter, with its long-press alternate and the hint that advertises it.
     */
    private fun letterKey(raw: String): View {
        val output = KasemKeyboardLayout.applyCase(raw, shift)
        val alternate = KasemKeyboardLayout.longPress[raw]
        val button = key(
            output,
            description = if (alternate == null) output else "$output, hold for $alternate",
            longPress = alternate?.let { text ->
                { commit(KasemKeyboardLayout.applyCase(text, shift)) }
            },
        ) { commit(output) }
        letterKeys.add(button to raw)
        applyLabel(button, output, alternate)
        return button
    }

    /**
     * Writes a key's face: the letter, and its alternate as a small superscript
     * in the corner.
     *
     * A SpannableString rather than a second overlaid view, so the hint costs
     * no layout and cannot drift out of alignment on a narrow screen.
     */
    private fun applyLabel(button: Button, output: String, alternate: String?) {
        if (alternate == null) {
            button.text = output
            return
        }
        val hint = KasemKeyboardLayout.applyCase(alternate, shift)
        val label = SpannableString("$output $hint")
        val start = output.length + 1
        label.setSpan(RelativeSizeSpan(0.52f), start, label.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        label.setSpan(SuperscriptSpan(), start, label.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        label.setSpan(
            ForegroundColorSpan(palette().mutedInk),
            start,
            label.length,
            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE,
        )
        button.text = label
    }

    /**
     * Relabels the letters in place after a case change.
     *
     * ── Why this is not just `drawKeyboard()` ────────────────────────────
     * Because `drawKeyboard()` allocates forty Buttons, forty StateListDrawables
     * and eighty GradientDrawables, and shift-once means it used to run on
     * every single typed character. On a low-end phone that is a visible
     * stutter between the tap and the letter, and it is entirely avoidable:
     * the only thing that changed is the text on sixteen views.
     */
    private fun updateLetterCase() {
        letterKeys.forEach { (button, raw) ->
            val output = KasemKeyboardLayout.applyCase(raw, shift)
            val alternate = KasemKeyboardLayout.longPress[raw]
            applyLabel(button, output, alternate)
            button.contentDescription =
                if (alternate == null) output else "$output, hold for $alternate"
        }
        shiftKey?.text = shiftLabel()
    }

    private fun shiftKeyView(): View {
        val button = key(shiftLabel(), 1.3f, special = true, description = "Shift") { shiftTapped() }
        shiftKey = button
        return button
    }

    /**
     * Backspace, which repeats while it is held.
     *
     * Without this, clearing a mistyped sentence is forty separate taps. The
     * first repeat waits longer than the rest so a deliberate single delete
     * never turns into two.
     */
    private fun backspaceKey(): View {
        val button = key("⌫", 1.3f, special = true, description = "Backspace") { backspace() }
        button.setOnLongClickListener {
            feedback(button)
            startRepeat()
            true
        }
        button.setOnTouchListener { view, event ->
            if (event.actionMasked == android.view.MotionEvent.ACTION_UP ||
                event.actionMasked == android.view.MotionEvent.ACTION_CANCEL
            ) {
                stopRepeat()
            }
            view.onTouchEvent(event)
        }
        return button
    }

    private fun startRepeat() {
        stopRepeat()
        val runnable = object : Runnable {
            override fun run() {
                backspace()
                repeatHandler.postDelayed(this, REPEAT_INTERVAL_MS)
            }
        }
        repeatRunnable = runnable
        repeatHandler.postDelayed(runnable, REPEAT_INTERVAL_MS)
    }

    private fun stopRepeat() {
        repeatRunnable?.let(repeatHandler::removeCallbacks)
        repeatRunnable = null
    }

    private fun textKey(text: String): View = key(text, description = text) { commit(text) }

    private fun key(
        label: String,
        weight: Float = 1f,
        special: Boolean = false,
        description: String,
        longPress: (() -> Unit)? = null,
        action: () -> Unit,
    ): Button = Button(this).apply {
        this.text = label
        isAllCaps = false
        textSize = if (label.length > 2) 13f else 20f
        setTextColor(if (special) palette().onAccent else palette().ink)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        gravity = Gravity.CENTER
        minWidth = 0
        minimumWidth = 0
        minHeight = 0
        minimumHeight = 0
        setPadding(dp(2), 0, dp(2), 0)
        background = keyBackground(special)
        contentDescription = description
        setOnClickListener {
            feedback(it)
            action()
        }
        if (longPress != null) {
            setOnLongClickListener {
                feedback(it)
                longPress()
                true
            }
        }
        layoutParams = LinearLayout.LayoutParams(0, keyHeight(), weight).apply {
            marginStart = dp(2)
            marginEnd = dp(2)
            topMargin = dp(2)
            bottomMargin = dp(2)
        }
    }

    /**
     * How tall a key is.
     *
     * 48dp in portrait, which is Android's minimum touch target and which the
     * first cut missed by one pixel-density-independent pixel. In landscape the
     * whole keyboard has to fit in a third of the height it had, so the keys
     * shrink rather than pushing the text field off the screen — which is what
     * a fixed height does on a phone held sideways.
     */
    private fun keyHeight(): Int {
        val landscape =
            resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        return if (landscape) dp(38) else dp(48)
    }

    private fun addRow(keys: List<View>) {
        keyboardRoot.addView(LinearLayout(this).apply {
            gravity = Gravity.CENTER
            keys.forEach(::addView)
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }

    private fun commit(text: String) {
        currentInputConnection?.commitText(text, 1)
        if (shift == ShiftState.UPPER_ONCE) {
            shift = ShiftState.LOWER
            // A later shift tap starts a fresh gesture even if the user typed
            // very quickly after the earlier one; only two adjacent shift
            // taps are caps lock.
            lastShiftTap = 0L
            updateLetterCase()
        }
    }

    private fun backspace() {
        val connection = currentInputConnection ?: return
        if (!connection.getSelectedText(0).isNullOrEmpty()) {
            connection.commitText("", 1)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            connection.deleteSurroundingTextInCodePoints(1, 0)
        } else {
            connection.deleteSurroundingText(1, 0)
        }
    }

    private fun enter() {
        val connection = currentInputConnection ?: return
        val options = currentInputEditorInfo?.imeOptions ?: 0
        val action = options and EditorInfo.IME_MASK_ACTION
        // An editor that asks for a literal newline gets one, whatever action
        // it also names. Performing the action instead is how a multi-line
        // message box ends up sending on every attempted line break.
        val wantsNewline = options and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0
        if (!wantsNewline &&
            action != EditorInfo.IME_ACTION_NONE &&
            action != EditorInfo.IME_ACTION_UNSPECIFIED
        ) {
            connection.performEditorAction(action)
        } else {
            connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
            connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
        }
    }

    private fun shiftTapped() {
        val now = SystemClock.elapsedRealtime()
        shift = when {
            now - lastShiftTap <= DOUBLE_TAP_MS -> ShiftState.CAPS_LOCK
            shift == ShiftState.LOWER -> ShiftState.UPPER_ONCE
            else -> ShiftState.LOWER
        }
        lastShiftTap = now
        updateLetterCase()
    }

    private fun toggleLanguage() {
        language = if (language == KeyboardLanguage.KASEM) {
            KeyboardLanguage.ENGLISH
        } else {
            KeyboardLanguage.KASEM
        }
        languageChosenThisSession = true
        // A full redraw here is correct and cheap: the extended row appears or
        // disappears, so the row count itself changes.
        drawKeyboard()
    }

    private fun showSystemInputPicker() {
        getSystemService(InputMethodManager::class.java).showInputMethodPicker()
    }

    private fun feedback(view: View) {
        if (preferences.vibration) {
            view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        }
        if (preferences.sound) {
            (getSystemService(Context.AUDIO_SERVICE) as AudioManager)
                .playSoundEffect(AudioManager.FX_KEY_CLICK)
        }
    }

    private fun shouldStartShifted(info: EditorInfo?): Boolean {
        val inputType = info?.inputType ?: return false
        // Never auto-capitalise a password, an email address or a URL: the
        // first letter is significant in all three and a capital is wrong in
        // all three.
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        if (variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
            variation == InputType.TYPE_TEXT_VARIATION_URI
        ) {
            return false
        }
        val capFlags = InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or
            InputType.TYPE_TEXT_FLAG_CAP_WORDS or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        return inputType and capFlags != 0
    }

    private fun isNumericField(info: EditorInfo?): Boolean = when (
        info?.inputType?.and(InputType.TYPE_MASK_CLASS)
    ) {
        InputType.TYPE_CLASS_NUMBER,
        InputType.TYPE_CLASS_PHONE,
        InputType.TYPE_CLASS_DATETIME -> true
        else -> false
    }

    private fun isNightMode(): Boolean =
        resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
            Configuration.UI_MODE_NIGHT_YES

    private fun shiftLabel(): String = when (shift) {
        ShiftState.LOWER -> "⇧"
        ShiftState.UPPER_ONCE -> "⇧"
        ShiftState.CAPS_LOCK -> "⇪"
    }

    private fun languageSwitchLabel(): String =
        if (language == KeyboardLanguage.KASEM) "EN" else "KA"

    private fun enterLabel(): String = when (
        currentInputEditorInfo?.imeOptions?.and(EditorInfo.IME_MASK_ACTION)
    ) {
        EditorInfo.IME_ACTION_SEARCH -> "search"
        EditorInfo.IME_ACTION_SEND -> "send"
        EditorInfo.IME_ACTION_GO -> "go"
        EditorInfo.IME_ACTION_NEXT -> "next"
        EditorInfo.IME_ACTION_DONE -> "done"
        else -> "↵"
    }

    private fun keyBackground(special: Boolean): StateListDrawable {
        val colours = palette()
        val normal = if (special) colours.accent else colours.keySurface
        val pressed = if (special) colours.accentPressed else colours.keyPressed
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_pressed), rounded(pressed, colours))
            addState(intArrayOf(), rounded(normal, colours))
        }
    }

    private fun rounded(color: Int, colours: Palette) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(9).toFloat()
        if (color == colours.keySurface) setStroke(dp(1), colours.keyBorder)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    /**
     * The colours, in the phone's own theme.
     *
     * A keyboard that is always paper-white is a torch in the face of somebody
     * typing in the dark, and it is the one surface of a phone that is on
     * screen more than any other.
     */
    private data class Palette(
        val background: Int,
        val keySurface: Int,
        val keyPressed: Int,
        val keyBorder: Int,
        val accent: Int,
        val accentPressed: Int,
        val onAccent: Int,
        val ink: Int,
        val mutedInk: Int,
    )

    private fun palette(): Palette = if (dark) DARK else LIGHT

    private companion object {
        const val DOUBLE_TAP_MS = 360L

        /** The keyboard's own bottom padding, before any navigation-bar inset. */
        const val BASE_BOTTOM_PADDING_DP = 8

        /** How fast a held backspace deletes. Slow enough to stop on a word. */
        const val REPEAT_INTERVAL_MS = 55L

        val LIGHT = Palette(
            background = Color.rgb(244, 242, 236),
            keySurface = Color.WHITE,
            keyPressed = Color.rgb(221, 228, 224),
            keyBorder = Color.rgb(218, 216, 208),
            accent = Color.rgb(11, 61, 46),
            accentPressed = Color.rgb(21, 91, 67),
            onAccent = Color.WHITE,
            ink = Color.rgb(26, 29, 28),
            mutedInk = Color.rgb(95, 103, 100),
        )

        val DARK = Palette(
            background = Color.rgb(18, 21, 20),
            keySurface = Color.rgb(38, 43, 41),
            keyPressed = Color.rgb(54, 62, 58),
            keyBorder = Color.rgb(52, 58, 55),
            accent = Color.rgb(24, 86, 66),
            accentPressed = Color.rgb(34, 112, 84),
            onAccent = Color.WHITE,
            ink = Color.rgb(238, 240, 238),
            mutedInk = Color.rgb(150, 160, 155),
        )
    }
}
