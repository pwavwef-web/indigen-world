package world.indigen.mobile

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.media.AudioManager
import android.os.Build
import android.os.SystemClock
import android.text.InputType
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.inputmethodservice.InputMethodService

/**
 * Offline-first Kasem Android input method.
 *
 * The MVP intentionally contains no prediction, telemetry or typed-text
 * logging. Every key writes directly to the active app's InputConnection.
 */
class KasemInputMethodService : InputMethodService() {
    private lateinit var preferences: KasemKeyboardPreferences
    private lateinit var keyboardRoot: LinearLayout
    private var language = KeyboardLanguage.KASEM
    private var shift = ShiftState.LOWER
    private var symbols = false
    private var lastShiftTap = 0L

    override fun onCreate() {
        super.onCreate()
        preferences = KasemKeyboardPreferences(this)
    }

    override fun onCreateInputView(): View {
        keyboardRoot = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(6), dp(6), dp(6), dp(8))
            setBackgroundColor(BACKGROUND)
        }
        drawKeyboard()
        return keyboardRoot
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        language = preferences.defaultLanguage
        symbols = isNumericField(info)
        shift = if (!symbols && shouldStartShifted(info)) {
            ShiftState.UPPER_ONCE
        } else {
            ShiftState.LOWER
        }
        if (::keyboardRoot.isInitialized) drawKeyboard()
    }

    override fun onEvaluateFullscreenMode(): Boolean = false

    private fun drawKeyboard() {
        keyboardRoot.removeAllViews()
        keyboardRoot.addView(statusRow())
        if (symbols) drawSymbols() else drawLetters()
    }

    private fun statusRow(): View = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(5), 0, dp(5), dp(3))
        addView(TextView(context).apply {
            text = if (language == KeyboardLanguage.KASEM) "KASEM" else "ENGLISH"
            setTextColor(HERITAGE_GREEN)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.12f
        }, LinearLayout.LayoutParams(0, dp(24), 1f))
        addView(TextView(context).apply {
            text = "Local · private"
            setTextColor(MUTED_INK)
            textSize = 11f
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
        }, LinearLayout.LayoutParams(0, dp(24), 1f))
    }

    private fun drawLetters() {
        KasemKeyboardLayout.letterRows.take(2).forEach { row ->
            addRow(row.map { letterKey(it) })
        }

        addRow(buildList {
            add(key(shiftLabel(), 1.3f, special = true, description = "Shift") { shiftTapped() })
            addAll(KasemKeyboardLayout.letterRows[2].map { letterKey(it) })
            add(key("⌫", 1.3f, special = true, description = "Backspace") { backspace() })
        })

        addRow(buildList {
            add(key("123", 1.35f, special = true, description = "Numbers and symbols") {
                symbols = true
                drawKeyboard()
            })
            if (language == KeyboardLanguage.KASEM) {
                add(letterKey("ɛ"))
                add(letterKey("ɔ"))
                add(letterKey("ŋ"))
            } else {
                add(textKey(","))
            }
            add(key("space", 3.3f, description = "Space") { commit(" ") })
            if (language == KeyboardLanguage.ENGLISH) add(textKey("."))
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
            key(languageSwitchLabel(), 1.25f, special = true,
                description = "Switch between Kasem and English",
                longPress = { showSystemInputPicker() }) { toggleLanguage() },
            key(enterLabel(), 1.25f, special = true, description = "Enter") { enter() },
        ))
    }

    private fun letterKey(raw: String): View {
        val output = KasemKeyboardLayout.applyCase(raw, shift)
        val alternate = KasemKeyboardLayout.longPress[raw]
        return key(
            output,
            description = if (alternate == null) output else "$output, hold for $alternate",
            longPress = alternate?.let { text ->
                { commit(KasemKeyboardLayout.applyCase(text, shift)) }
            },
        ) { commit(output) }
    }

    private fun textKey(text: String): View = key(text, description = text) { commit(text) }

    private fun key(
        label: String,
        weight: Float = 1f,
        special: Boolean = false,
        description: String,
        longPress: (() -> Unit)? = null,
        action: () -> Unit,
    ): View = Button(this).apply {
        this.text = label
        isAllCaps = false
        textSize = if (label.length > 2) 13f else 20f
        setTextColor(if (special) Color.WHITE else INK)
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
        layoutParams = LinearLayout.LayoutParams(0, dp(47), weight).apply {
            marginStart = dp(2)
            marginEnd = dp(2)
            topMargin = dp(2)
            bottomMargin = dp(2)
        }
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
            drawKeyboard()
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
        val action = currentInputEditorInfo?.imeOptions?.and(EditorInfo.IME_MASK_ACTION)
            ?: EditorInfo.IME_ACTION_NONE
        if (action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
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
        drawKeyboard()
    }

    private fun toggleLanguage() {
        language = if (language == KeyboardLanguage.KASEM) {
            KeyboardLanguage.ENGLISH
        } else {
            KeyboardLanguage.KASEM
        }
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
        val normal = if (special) HERITAGE_GREEN else KEY_SURFACE
        val pressed = if (special) SAVANNAH_GREEN else KEY_PRESSED
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_pressed), rounded(pressed))
            addState(intArrayOf(), rounded(normal))
        }
    }

    private fun rounded(color: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(9).toFloat()
        if (color == KEY_SURFACE) setStroke(dp(1), KEY_BORDER)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val DOUBLE_TAP_MS = 360L
        val BACKGROUND = Color.rgb(244, 242, 236)
        val KEY_SURFACE = Color.WHITE
        val KEY_PRESSED = Color.rgb(221, 228, 224)
        val KEY_BORDER = Color.rgb(218, 216, 208)
        val HERITAGE_GREEN = Color.rgb(11, 61, 46)
        val SAVANNAH_GREEN = Color.rgb(21, 91, 67)
        val INK = Color.rgb(26, 29, 28)
        val MUTED_INK = Color.rgb(95, 103, 100)
    }
}
