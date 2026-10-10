"""Text encoding and Kasem orthography checks.

Only rules the project has verified are applied: the Bureau of Ghana Languages
"Kasem Orthography: Spelling Rules" (1997), imported into
data/orthography-seed/rules.json. Every finding names its rule key there
(tests/test_text.py checks the keys exist). Findings are flags for a validator,
never automatic rejections, and they apply to Ghana Kasem only: for other or
unknown varieties no orthography rule is applied and that is stated.

The submitted text is never rewritten. `normalized_nfc` is stored beside it as
a separate, derived form; meaningful characters (ɛ, ɔ, ŋ, tone marks the book
prescribes, hyphens, apostrophes) are preserved.
"""

from __future__ import annotations

import re
import unicodedata

RULES_SOURCE = "data/orthography-seed/rules.json"

# Letters the book uses (lowercase; ch and ny are digraphs of c+h and n+y).
ALPHABET = set("abdefghijklmnoprstuvwyzɛɔŋ") | {"c"}
# Combining marks the book does not use (tilde, macron, circumflex, diaeresis, caron, …).
FOREIGN_MARKS = {"̂", "̃", "̄", "̆", "̈", "̌", "̣", "̱"}
TONE_MARKS = {"́", "̀"}  # acute and grave: the book prescribes a few
CONFUSABLES = {
    "ε": ("ɛ", "Greek epsilon ε looks like Kasem ɛ"),
    "Ε": ("Ɛ", "Greek capital Ε looks like Kasem Ɛ"),
    "η": ("ŋ", "Greek eta η looks like Kasem ŋ"),
    "ↄ": ("ɔ", "reversed c ↄ looks like Kasem ɔ"),
    "ɔ̃": ("ɔ", "ɔ with a nasal tilde"),
}
PHONETIC = {"ɩ": ("e", "vowels"), "ʋ": ("o", "vowels"), "ɣ": (None, "alphabet"), "ʒ": ("j", "alphabet"), "ʃ": ("ch", "alphabet")}
ZERO_WIDTH = {"​", "‌", "‍", "﻿", "⁠"}
MOJIBAKE = re.compile(r"Ã.|â€|É›|É”|Å‹|Ã©")
ENGLISH_WORDS = set("""the a an and of to in is are was were be been you your i me my we our he she it they them this that
what how when where why who with for on at by from not do does did have has had will would can could should please thank
thanks hello good morning evening night yes no""".split())


def is_ghana_kasem(dialect: str) -> bool:
    d = (dialect or "").strip().lower()
    if "burkina" in d or "faso" in d:
        return False
    return d in {"", "kasem", "ghana kasem", "kasena", "kasem (ghana)", "ghana"} or "ghana" in d or d.startswith("kasem")


def encoding_findings(text: str) -> list[dict]:
    findings = []
    if "�" in text:
        findings.append({"rule": "encoding:replacement-character", "severity": "warning",
                         "message": "Contains � — part of the text was lost in a copy or upload. Ask the contributor to retype it."})
    if any(ch in ZERO_WIDTH for ch in text):
        findings.append({"rule": "encoding:invisible-characters", "severity": "info",
                         "message": "Contains invisible zero-width characters; the normalised copy can drop them."})
    if any(unicodedata.category(ch) == "Cc" and ch not in "\n\t" for ch in text):
        findings.append({"rule": "encoding:control-characters", "severity": "warning", "message": "Contains control characters."})
    if MOJIBAKE.search(text):
        findings.append({"rule": "encoding:mojibake", "severity": "warning",
                         "message": "Looks double-encoded (e.g. É› instead of ɛ). Check with the contributor before correcting."})
    return findings


def orthography_findings(text: str, dialect: str) -> tuple[str, list[dict]]:
    """Returns (rulesApplied, findings) for the Kasem side of a contribution."""
    if not is_ghana_kasem(dialect):
        return "none", []
    findings: list[dict] = []
    decomposed = unicodedata.normalize("NFD", text)
    lower = text.lower()
    for ch, (replacement, why) in CONFUSABLES.items():
        if ch in text:
            findings.append({"rule": "bgl97:alphabet", "severity": "warning",
                             "message": f"{why}; the normalised form would use {replacement}. Confirm before changing."})
    for ch, (replacement, rule) in PHONETIC.items():
        if ch in lower:
            advice = f"the book writes it as {replacement}" if replacement else "the book does not use this letter"
            findings.append({"rule": f"bgl97:{rule}", "severity": "warning",
                             "message": f"“{ch}” is a phonetic symbol; {advice}. Phonetic spellings describe pronunciation and are kept as submitted."})
    if any(mark in decomposed for mark in FOREIGN_MARKS):
        findings.append({"rule": "bgl97:diacritics", "severity": "warning",
                         "message": "Uses a nasal tilde, macron or other mark the book does not use. Kept as submitted for a validator."})
    if re.search(r"(?<![a-zɛɔŋ])ng|ng(?![a-zɛɔŋ])", lower):
        findings.append({"rule": "bgl97:alphabet", "severity": "info",
                         "message": "“ng” may be the old spelling of ŋ; the book writes ŋ. It can also be a genuine n + g."})
    if re.search(r"c(?!h)", lower):
        findings.append({"rule": "bgl97:alphabet", "severity": "info", "message": "“c” appears outside “ch”; the book writes c only in ch."})
    letters = {unicodedata.normalize("NFD", ch)[0] for ch in lower if ch.isalpha()}
    outside = sorted(ch for ch in letters if ch not in ALPHABET and ch not in PHONETIC)
    if outside:
        findings.append({"rule": "bgl97:alphabet", "severity": "info",
                         "message": f"Letters outside the book's alphabet: {', '.join(outside)}. They can be names or loanwords."})
    return "ghana-bgl-1997", findings


def normalize_nfc(text: str) -> str:
    """The derived comparison form: NFC, invisible characters removed, spaces collapsed. Never replaces the original."""
    cleaned = "".join(ch for ch in text if ch not in ZERO_WIDTH)
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", cleaned)).strip()


def comparison_key(text: str) -> str:
    """For duplicate detection only: casefolded, punctuation-insensitive. Tone marks are kept — they can change meaning."""
    nfc = normalize_nfc(text).casefold()
    return re.sub(r"[\s\.,;:!?\"“”'‘’()\[\]-]+", " ", nfc).strip()


def tokens(text: str) -> list[str]:
    return re.findall(r"[\ẁ-ͯ]+", normalize_nfc(text).casefold())


def looks_like_english(kasem: str, english: str) -> str | None:
    """A copy of the English, or mostly English words, in the Kasem field."""
    if comparison_key(kasem) and comparison_key(kasem) == comparison_key(english):
        return "The Kasem field repeats the English meaning."
    words = tokens(kasem)
    if len(words) >= 3 and sum(w in ENGLISH_WORDS for w in words) / len(words) >= 0.6:
        return "The Kasem field is mostly common English words."
    return None
