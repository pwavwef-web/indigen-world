# Review: the Kasem Android keyboard

*Reviewed 2026-09-07. Subject: commit `f3d27df`, "feat(mobile): add Kasem
Android keyboard" (Anim Andy, 2026-09-06).*

## Is it a good idea at all?

**Yes — it is arguably the highest-leverage thing in the mobile app**, and the
argument is a number rather than a feeling.

785 of the 1200 published dictionary entries carry at least one letter that
does not exist on a stock Android English keyboard: **ɩ in 640 headwords, ʋ in
195, ə in 177, ɔ in 156, ŋ in 115, ɛ in 9** (counted in
`apps/mobile/lib/domain/kasem_orthography.dart`).

Every other Kasem feature in this project is downstream of that. `foldForSearch`
exists because a learner who has heard `dɩ` cannot type ɩ and types `di`. The
web contribution desk needs a character palette for the same reason. Community
posts in Kasem are written in approximate ASCII because there is no alternative.
A system keyboard is the only fix that works *outside* the app — in WhatsApp, in
a browser, in an SMS — which is where the language actually gets written.

It is also strategically cheap to own: no server, no per-user cost, no content
moderation, and it makes the app the thing a Kasena speaker keeps installed even
in a month they never open it.

**The honest costs**, which should be stated rather than discovered:

- **Maintenance surface.** An IME is a permanently-installed piece of system UI.
  Every Android release changes something about input, and a keyboard that
  breaks is worse than one that never shipped.
- **Play policy.** An input method must disclose in the privacy policy what it
  does with typed text. This one does nothing with it — no logging, no network,
  no path into Flutter — which is the easy case to declare, but it must actually
  *be* declared. **This is an open action item.**
- **The alphabet is a linguistic commitment.** The digraph shortcuts are still
  a draft. The README says so and should keep saying so until a fluent-speaker
  review is done.

The implementation was also better than it needed to be in the ways that are
hard to retrofit: no telemetry, no typed-text logging, a narrow method channel
that carries setup only, a layout isolated in its own file so it can be revised,
and honest documentation admitting the layout was provisional.

## What was broken

Ordered by how many people hit it.

### 1. The keyboard could not type Kasem — BLOCKER

`KasemKeyboardLayout` offered direct keys for **ɛ, ɔ and ŋ** and long-press
alternates for **ɛ and ɔ** only. There was no way at all — no key, no gesture,
no symbol page — to produce **ɩ, ʋ or ə**.

Those are the three *commonest* extended letters in the archive. ɩ alone appears
in more than half of all headwords.

So the Kasem keyboard could not type the most common letter in Kasem, and the
three letters it did offer include the rarest (ɛ, 9 headwords). The workaround
it leaves is the one that causes real damage: type `i` for `ɩ`, and the word is
filed under a spelling that is a **different word** — which is precisely what
`headwordKey` refuses to fold, and precisely what homograph numbering exists to
keep apart.

**Fixed.** Every extended letter now has its own key on a dedicated row, always
visible in Kasem mode (`KasemKeyboardLayout.extendedRow` = `ɩ ʋ ə ɔ ŋ ɛ`), plus
long-press on the matching vowel as a second route, plus the high-tone mark on
each Kasem vowel. Reachability through an undiscoverable gesture is not
reachability, so the row is the primary route and the gesture is the backup.

### 2. Long-press was invisible — MAJOR

`ɛ` and `ɔ` were reachable by holding `e` and `o`, and **nothing on screen said
so**. The only trace was `contentDescription`, which only a screen reader hears.
For every user who had not read the release notes, those alternates did not
exist.

**Fixed.** Every key with an alternate now draws it as a small superscript in
the corner — a `SpannableString`, so it costs no extra layout and cannot drift
out of alignment on a narrow screen.

### 3. The keyboard rebuilt itself on every keystroke — MAJOR

`commit()` called `drawKeyboard()` whenever shift was in its one-shot state,
and `drawKeyboard()` does `removeAllViews()` and then re-allocates roughly
forty `Button`s, forty `StateListDrawable`s and eighty `GradientDrawable`s.

So typing a capitalised sentence — which is every sentence, because
`shouldStartShifted` turns shift on for any field with `CAP_SENTENCES` — tore
down and rebuilt the entire keyboard between the tap and the letter appearing.
Invisible on a developer's device; a visible stutter on the phones this app is
for.

**Fixed.** `updateLetterCase()` relabels the sixteen views whose text actually
changed. `drawKeyboard()` is now called only when the row structure itself
changes — switching language, or switching to symbols.

### 4. Backspace did not repeat — MAJOR

No long-press handler. Clearing a mistyped sentence was forty separate taps.

**Fixed.** Holding backspace repeats at 55ms, with the first repeat delayed so a
deliberate single delete never becomes two. The repeat is cancelled in
`onFinishInputView`, so a held key cannot keep deleting into whatever the user
opens next.

### 5. The declared language was the wrong language — MAJOR

`kasem_input_method.xml` declared `android:imeSubtypeLocale="kss_GH"`.

**ISO 639-3 `kss` is Southern Kisi**, a Mel language of Sierra Leone and
Liberia. **Kasem is `xsm`** — which this repo's own contract already states
(`packages/contracts/schemas/common.schema.json`: *"Kasem is 'xsm'"*), and which
the backend writes on every submission as `primaryLanguage: 'xsm'`.

Not cosmetic: Android matches on the subtype locale when deciding which keyboard
to offer for a field, and accessibility services read the subtype out.

**Fixed.** `xsm_GH`, plus an explicit `languageTag="xsm-GH"`.

### 6. The settings link went somewhere misleading — MINOR

`android:settingsActivity="world.indigen.mobile.MainActivity"`. Android launches
a settings activity with a plain `ACTION_MAIN` intent, indistinguishable from a
launcher tap — so there is no way for `MainActivity` to know it was opened from
keyboard settings. Tapping the gear beside "Kasem keyboard" dropped the user on
the app's home screen with no explanation and no way back.

**Fixed by removal.** A link that goes somewhere misleading is worse than no
link. The keyboard's settings live in-app at **Settings → Preferences → Kasem
keyboard**, which is where the setup flow already sends people.

### 7. Keys were below the minimum touch target — MINOR

`dp(47)`, one below Android's 48dp minimum, with no landscape adaptation — so in
landscape five rows of fixed-height keys pushed the field being typed into off
the screen.

**Fixed.** 48dp in portrait, 38dp in landscape.

### 8. The keyboard was always light — MINOR

Hard-coded paper-white palette. A keyboard is the surface of a phone that is on
screen more than any other, and a white one at night is a torch in the face.

**Fixed.** The palette follows `UI_MODE_NIGHT_MASK`, re-read on
`onStartInputView` so a theme change mid-session is picked up.

### 9. Auto-capitalisation fired in fields where a capital is wrong — MINOR

`shouldStartShifted` checked only the `CAP_*` flags, so a password, email or URI
field that also carried one started shifted. The first letter is significant in
all three.

**Fixed.** Those variations are excluded.

### 10. Enter ignored `IME_FLAG_NO_ENTER_ACTION` — MINOR

An editor that asks for a literal newline while also naming an action got the
action performed. That is how a multi-line message box sends on every attempted
line break.

**Fixed.** The flag is honoured before the action.

### 11. The language switch reset itself between fields — MINOR

`onStartInputView` reassigned `language` from preferences every time, so
somebody who switched to English to type a URL was back in Kasem on the next
field. The stored preference should be the language the keyboard *opens* in, not
one that reasserts itself.

**Fixed.** A per-process flag records that the user has chosen, and the
preference is only consulted until they do.

## Still open

- **Declare the IME in the Play privacy policy.** It must say that the keyboard
  processes text locally, stores nothing, and sends nothing. Not a code change,
  and it must happen before the next release goes to review.
- **Fluent-speaker review of the digraph shortcuts** (Ch, Kw, Gw, Pw, Ŋw) and of
  key positions. The alphabet is now settled; these are not.
- **No key-press popup preview.** Standard on every commercial keyboard, and the
  usual complaint on a small screen is not knowing which key was hit. Worth
  doing, not worth blocking on.
- **One subtype, labelled "Kasem and English".** Android would let the two be
  separate subtypes so the globe key cycles between them; today the EN/KA toggle
  is internal to the IME. It works, and the tidier version is a later change.
- **No iOS keyboard.** A separate project entirely, and not obviously worth it
  until the Android one has been used in anger.
