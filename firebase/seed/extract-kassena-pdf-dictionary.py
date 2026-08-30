#!/usr/bin/env python3
"""Build a review-only Kasem-English dictionary import from Kassena.org PDFs.

The source dictionary is a two-volume Kasem-French-English publication.  This
extractor keeps only entries for which the PDF supplies every user-visible text
field required by the mobile dictionary: a headword, English gloss, part of
speech, written tone guide, and an aligned Kasem/English usage example.  Audio
is deliberately not created.  Sentence examples remain nested on their lexical
entry and are never emitted as standalone dictionary records.

The generated rows are source-attested candidates, not community-validated
production data.  Rights and Ghana-variety review remain explicit blockers to
publication.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit(
        "pdfplumber is required. Run with the Codex bundled Python runtime."
    ) from exc


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_AK = ROOT / ".tmp" / "pdfs" / "kasem-dictionary-a-k.pdf"
DEFAULT_LZ = ROOT / ".tmp" / "pdfs" / "kasem-dictionary-l-z.pdf"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "project-kasena-dictionary-data.json"
DEFAULT_LIMIT = 1200
IMPORT_ID = "kassena_org_kasem_english_usage_v1"

SOURCE_URLS = {
    "A-K": (
        "https://www.kassena.org/sites/www.kassena.org/files/uploads/"
        "Dictionnaire%20Kassem%20francais%20anglais%20A%20-%20K.pdf"
    ),
    "L-Z": (
        "https://www.kassena.org/sites/www.kassena.org/files/uploads/"
        "Dictionnaire%20Kassem%20francais%20anglais%20L%20-%20Z.pdf"
    ),
}

SOURCE_TITLE = "Dictionnaire Kasɩm - Français - English"
SOURCE_AUTHOR = "Urs Niggli (SIL)"
SOURCE_VARIETY = "Tiébélé / Burkina Faso"
RIGHTS_CAUTION = (
    "Public reference source; bulk reuse permission is not recorded in the "
    "repository. Keep unpublished until rights and community review are complete."
)

# The PDF's embedded Lucida Sans Unicode ToUnicode map points a small set of
# visible Kasem glyphs at the wrong Unicode code points.  Headwords use Charis
# SIL and extract correctly.  This mapping repairs only Lucida-font example
# text; applying it globally would corrupt valid headwords.
LUCIDA_KASEM_TRANSLATION = str.maketrans(
    {
        "ț": "ʋ",
        "Ț": "Ʋ",
        "ǹ": "ɩ",
        "Ǹ": "Ɩ",
        "ǩ": "ə",
        "Ǩ": "Ə",
        "ǫ": "ɔ",
        "Ǫ": "Ɔ",
        # The source font maps lowercase open-o to U+01E4 (Ǥ). Uppercase
        # open-o is a different source glyph and is handled by Ǫ above.
        "Ǥ": "ɔ",
        "ɴ": "ŋ",
    }
)

SUPERSCRIPT_DIGITS = str.maketrans("123456789", "¹²³⁴⁵⁶⁷⁸⁹")

POS_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bnom\s+pluriel\b", re.I), "Plural noun"),
    (re.compile(r"\bnom\.", re.I), "Noun"),
    (re.compile(r"\bverbe\.", re.I), "Verb"),
    (re.compile(r"\bv\.aux\.", re.I), "Auxiliary verb"),
    (re.compile(r"\badj\.", re.I), "Adjective"),
    (re.compile(r"\badverbe\.", re.I), "Adverb"),
    (re.compile(r"\bpn\.", re.I), "Pronoun"),
    (re.compile(r"\bpr[ée]p\.", re.I), "Preposition"),
    (re.compile(r"\bcj\.", re.I), "Conjunction"),
    (re.compile(r"\binterj\.", re.I), "Interjection"),
    (re.compile(r"\bd[ée]t\.", re.I), "Determiner"),
    (re.compile(r"\bd[ée]m\.", re.I), "Demonstrative"),
    (re.compile(r"\bnum\.", re.I), "Numeral"),
    (re.compile(r"\bpart\.", re.I), "Particle"),
    (re.compile(r"\brel\.", re.I), "Relative marker"),
    (re.compile(r"\bexpression\.", re.I), "Phrase"),
    (re.compile(r"\bid\.", re.I), "Ideophone"),
]

BAD_EXTRACTION_CHARS = set("țȚǹǸǩǨǫǪǤɴ")


@dataclass(frozen=True)
class SourceVolume:
    code: str
    path: Path
    url: str
    first_dictionary_page: int
    last_dictionary_page: int


@dataclass
class EntryBlock:
    volume: SourceVolume
    pdf_page: int
    column: int
    order_on_page: int
    headword: str
    tokens: list[dict[str, object]]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tidy(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\u00ad", "").replace("\u200b", "")
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"([‘“])\s+", r"\1", value)
    value = re.sub(r"\s+([’”])", r"\1", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def display_headword(value: str) -> str:
    value = tidy(value)
    # Source homograph numbers render as superscripts but extract as baseline
    # digits. Preserve that distinction without making the digit searchable as
    # part of the lexical form.
    match = re.fullmatch(r"(.+?)([1-9])", value)
    if match:
        return match.group(1) + match.group(2).translate(SUPERSCRIPT_DIGITS)
    return value


def font_category(token: dict[str, object]) -> str:
    font = str(token.get("fontname", ""))
    if "CharisSIL,Bold" in font:
        return "headword"
    if "LucidaSansUnicode" in font:
        return "kasem"
    if "Italic" in font or font.endswith("Times-Italic"):
        return "french"
    if "Times" in font:
        return "english"
    if "CharisSIL" in font:
        return "phonetic"
    return "other"


def token_text(token: dict[str, object], *, repair_kasem: bool = False) -> str:
    value = str(token.get("text", ""))
    if repair_kasem and font_category(token) == "kasem":
        value = value.translate(LUCIDA_KASEM_TRANSLATION)
    return value


def group_lines(words: Iterable[dict[str, object]], tolerance: float = 2.2) -> list[list[dict[str, object]]]:
    lines: list[list[dict[str, object]]] = []
    for word in sorted(words, key=lambda item: (float(item["top"]), float(item["x0"]))):
        top = float(word["top"])
        target = None
        for line in reversed(lines[-3:]):
            if abs(float(line[0]["top"]) - top) <= tolerance:
                target = line
                break
        if target is None:
            lines.append([word])
        else:
            target.append(word)
    for line in lines:
        line.sort(key=lambda item: float(item["x0"]))
    lines.sort(key=lambda line: float(line[0]["top"]))
    return lines


def entry_headword(line: list[dict[str, object]], column_left: float) -> tuple[str, int] | None:
    if not line:
        return None
    first = line[0]
    if float(first["x0"]) > column_left + 38:
        return None
    if font_category(first) != "headword":
        return None

    parts: list[str] = []
    consumed = 0
    for token in line:
        if font_category(token) != "headword":
            break
        parts.append(token_text(token))
        consumed += 1
    headword = display_headword(" ".join(parts))
    if not headword or len(headword) > 80 or not any(char.isalpha() for char in headword):
        return None
    return headword, consumed


def page_blocks(page, volume: SourceVolume, pdf_page: int) -> list[EntryBlock]:
    clean_page = page.dedupe_chars(tolerance=1)
    width = float(clean_page.width)
    height = float(clean_page.height)
    gutter = width / 2
    columns = [
        (0.0, gutter - 5.0),
        (gutter + 5.0, width),
    ]
    blocks: list[EntryBlock] = []

    for column_number, (left, right) in enumerate(columns, start=1):
        cropped = clean_page.crop((left, 48.0, right, height - 32.0))
        words = cropped.extract_words(
            x_tolerance=2,
            y_tolerance=2,
            keep_blank_chars=False,
            use_text_flow=False,
            extra_attrs=["fontname", "size"],
        )
        lines = group_lines(words)
        current: EntryBlock | None = None
        order = 0
        for line in lines:
            detected = entry_headword(line, left)
            if detected:
                headword, _ = detected
                order += 1
                current = EntryBlock(
                    volume=volume,
                    pdf_page=pdf_page,
                    column=column_number,
                    order_on_page=order,
                    headword=headword,
                    tokens=list(line),
                )
                blocks.append(current)
            elif current is not None:
                current.tokens.extend(line)
    return blocks


def token_join(tokens: Iterable[dict[str, object]], *, repair_kasem: bool = False) -> str:
    return tidy(" ".join(token_text(token, repair_kasem=repair_kasem) for token in tokens))


def first_pos(tokens: list[dict[str, object]]) -> str:
    french_text = token_join(token for token in tokens if font_category(token) == "french")
    for pattern, label in POS_PATTERNS:
        if pattern.search(french_text):
            return label
    return ""


def pronunciation(tokens: list[dict[str, object]]) -> str:
    # Tone patterns are written in square brackets immediately after the
    # headword. Combining macrons can be separated into adjacent PDF tokens.
    candidate = token_join(
        token
        for token in tokens[:30]
        if font_category(token) in {"phonetic", "other"}
    )
    match = re.search(r"\[[^\]]{1,80}\]", candidate)
    if not match:
        return ""
    value = match.group(0)
    # In this PDF, a combining tone mark can be exposed after the following
    # hyphen (for example `ə-́` for visible `ə́-`). Put the mark back on its
    # vowel, then remove line-extraction spaces around syllable separators.
    value = re.sub(
        r"([A-Za-z\u0180-\u02AF])(-)([\u0300-\u036f]+)",
        r"\1\3\2",
        value,
    )
    value = re.sub(r"\s*-\s*", "-", value)
    return tidy(unicodedata.normalize("NFC", value))


def first_index(tokens: list[dict[str, object]], predicate, start: int = 0) -> int | None:
    for index in range(start, len(tokens)):
        if predicate(tokens[index]):
            return index
    return None


def content_fields(tokens: list[dict[str, object]]) -> tuple[str, str, str]:
    semicolon = first_index(tokens, lambda token: ";" in token_text(token))
    if semicolon is None:
        return "", "", ""

    kasem_start = first_index(
        tokens,
        lambda token: font_category(token) == "kasem",
        semicolon + 1,
    )
    if kasem_start is None:
        return "", "", ""

    translation_tokens = [
        token
        for token in tokens[semicolon + 1 : kasem_start]
        if font_category(token) == "english"
    ]
    translation = token_join(translation_tokens).strip(" .;")

    french_example_start = first_index(
        tokens,
        lambda token: font_category(token) == "french",
        kasem_start + 1,
    )
    if french_example_start is None:
        return translation, "", ""

    kasem_tokens = [
        token
        for token in tokens[kasem_start:french_example_start]
        if font_category(token) == "kasem"
    ]
    kasem_example = token_join(kasem_tokens, repair_kasem=True)

    english_example_start = first_index(
        tokens,
        lambda token: font_category(token) == "english",
        french_example_start + 1,
    )
    if english_example_start is None:
        return translation, kasem_example, ""

    english_example_tokens: list[dict[str, object]] = []
    for token in tokens[english_example_start:]:
        category = font_category(token)
        if category in {"french", "kasem", "headword"} and english_example_tokens:
            break
        if category == "english":
            english_example_tokens.append(token)
    english_example = token_join(english_example_tokens)
    return translation, kasem_example, english_example


def plausible_text(value: str, *, kasem: bool = False) -> bool:
    if not value or len(value) > 500:
        return False
    if "(cid:" in value or "�" in value:
        return False
    if kasem and any(char in BAD_EXTRACTION_CHARS for char in value):
        return False
    return any(char.isalpha() for char in value)


def headword_in_example(headword: str, example: str) -> bool:
    # Inflected forms and multiword entries make exact matching too strict.
    # Requiring a two-character lexical stem catches extraction mismatches while
    # keeping ordinary Kasem morphology represented by the source example.
    form = re.sub(r"[¹²³⁴⁵⁶⁷⁸⁹]", "", headword).lstrip("-").split()[0].lower()
    example_words = re.findall(r"[A-Za-z\u0180-\u02AF]+", example.lower())
    if len(form) <= 2:
        return form in example_words
    stem = form[: max(2, min(len(form), 4))]
    return any(word.startswith(stem) or form.startswith(word[:4]) for word in example_words)


def cultural_note(block: EntryBlock) -> str:
    return (
        "Source-attested usage from the Tiébélé, Burkina Faso variety. "
        "Ghana spelling, meaning, and register require Kasem community review before publication."
    )


def source_id(block: EntryBlock) -> str:
    return (
        f"{block.volume.code.lower().replace('-', '')}-"
        f"p{block.pdf_page:03d}-c{block.column}-e{block.order_on_page:02d}"
    )


def make_entry(block: EntryBlock, now: str) -> tuple[dict[str, object] | None, str]:
    pos = first_pos(block.tokens)
    guide = pronunciation(block.tokens)
    translation, kasem_example, english_example = content_fields(block.tokens)

    checks = {
        "headword": plausible_text(block.headword, kasem=True),
        "translation": plausible_text(translation),
        "partOfSpeech": bool(pos),
        "pronunciation": bool(guide),
        "kasemExample": plausible_text(kasem_example, kasem=True),
        "englishExample": plausible_text(english_example),
        "usageMatch": headword_in_example(block.headword, kasem_example),
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        return None, ",".join(failed)

    locator = source_id(block)
    entry_id = f"kasem_bf_{locator.replace('-', '_')}"
    attribution = (
        f"{SOURCE_AUTHOR}, {SOURCE_TITLE}, {block.volume.code}, "
        f"PDF p. {block.pdf_page}; {SOURCE_VARIETY}. {RIGHTS_CAUTION}"
    )
    source_metadata = {
        "title": SOURCE_TITLE,
        "author": SOURCE_AUTHOR,
        "publisher": "Kassena.org / SIL reference dictionary",
        "languageCode": "xsm",
        "variety": SOURCE_VARIETY,
        "volume": block.volume.code,
        "pdfPage": block.pdf_page,
        "column": block.column,
        "entryOrder": block.order_on_page,
        "rightsCaution": RIGHTS_CAUTION,
    }
    note = cultural_note(block)
    return (
        {
            "id": entry_id,
            "sourceRowId": locator,
            "importBatch": IMPORT_ID,
            "kasemText": block.headword,
            "headword": block.headword,
            "englishText": translation,
            "translation": translation,
            "translationStatus": "source_attested",
            "partOfSpeech": pos,
            "sourcePartOfSpeech": pos,
            "dialect": SOURCE_VARIETY,
            "varietyProfile": "Burkina Faso reference; Ghana review required",
            "orthographyProfile": "Published Kasem reference orthography",
            "pronunciation": guide,
            "kasemExample": kasem_example,
            "englishExample": english_example,
            "example": kasem_example,
            "exampleTranslation": english_example,
            "usage": [
                {
                    "kasem": kasem_example,
                    "english": english_example,
                    "sourceLocator": locator,
                }
            ],
            "culturalNote": note,
            "reviewNote": note,
            "attribution": attribution,
            "sourceCode": f"KASSENA-{block.volume.code}",
            "sourceUrl": block.volume.url,
            "sourceLocator": locator,
            "sourceMetadata": source_metadata,
            "validationStatus": "in_review",
            "reviewDecision": "pending",
            "needsValidation": True,
            "rightsStatus": "permission_required",
            "publicationEligible": False,
            "aiTrainingEligible": False,
            "isPublished": False,
            "isSynthetic": False,
            "isSentencePair": False,
            "tags": [
                "kasem-english",
                "lexical-candidate",
                "source-attested",
                "usage-example",
                "burkina-faso",
                pos.lower().replace(" ", "-"),
            ],
            "governance": {
                "source": attribution,
                "contributor": {
                    "collection": "sourceOrganizations",
                    "id": "kassena-org-sil",
                },
                "language": {"collection": "languages", "id": "kasem"},
                "dialect": {
                    "collection": "dialects",
                    "id": "kasem-tiebele-bf",
                },
                "validationStatus": "in_review",
                "validator": None,
                "consentStatus": "not_required",
                "consent": None,
                "licence": "undetermined",
                "culturalPermissionTier": "public",
            },
            "schemaVersion": 1,
            "lifecycle": {
                "createdAt": now,
                "updatedAt": now,
                "version": 1,
                "auditRefs": [],
            },
        },
        "",
    )


def parse_volume(volume: SourceVolume) -> list[EntryBlock]:
    blocks: list[EntryBlock] = []
    with pdfplumber.open(volume.path) as document:
        for page_index, page in enumerate(document.pages, start=1):
            if page_index < volume.first_dictionary_page:
                continue
            if page_index > volume.last_dictionary_page:
                break
            blocks.extend(page_blocks(page, volume, page_index))
            # pdfplumber otherwise retains every page's layout and image cache
            # until the whole volume closes, which is unnecessary for this
            # streaming extraction and can exceed a gigabyte on these PDFs.
            page.close()
    return blocks


def dedupe(entries: list[dict[str, object]]) -> list[dict[str, object]]:
    unique: list[dict[str, object]] = []
    seen: set[tuple[str, str, str]] = set()
    for entry in entries:
        key = (
            str(entry["headword"]).casefold(),
            str(entry["translation"]).casefold(),
            str(entry["kasemExample"]).casefold(),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(entry)
    return unique


def build_payload(volumes: list[SourceVolume], limit: int) -> dict[str, object]:
    for volume in volumes:
        if not volume.path.is_file():
            raise SystemExit(
                f"Missing source PDF: {volume.path}\nDownload it from {volume.url}"
            )

    now = utc_now()
    blocks: list[EntryBlock] = []
    for volume in volumes:
        blocks.extend(parse_volume(volume))

    rejected = Counter()
    candidates: list[dict[str, object]] = []
    for block in blocks:
        entry, reason = make_entry(block, now)
        if entry is None:
            rejected[reason] += 1
        else:
            candidates.append(entry)
    candidates = dedupe(candidates)

    # Preserve dictionary order while taking an even number of entries from
    # A-K and L-Z. This gives broad alphabetic coverage instead of reaching the
    # target almost entirely from the first volume.
    by_volume = {
        code: [entry for entry in candidates if entry["sourceMetadata"]["volume"] == code]
        for code in SOURCE_URLS
    }
    selected: list[dict[str, object]] = []
    while len(selected) < limit and any(by_volume.values()):
        for code in SOURCE_URLS:
            if by_volume[code] and len(selected) < limit:
                selected.append(by_volume[code].pop(0))

    if len(selected) < limit:
        raise SystemExit(
            f"Only {len(selected)} fully populated lexical entries passed validation; "
            f"{limit} requested. Rejection summary: {dict(rejected.most_common(12))}"
        )

    ids = [str(entry["id"]) for entry in selected]
    if len(ids) != len(set(ids)):
        raise SystemExit("Generated duplicate dictionary entry ids.")

    return {
        "importId": IMPORT_ID,
        "generatedAt": now,
        "sourceDocument": SOURCE_TITLE,
        "sourceDocumentName": "Kassena.org Kasem-French-English dictionary volumes A-K and L-Z",
        "sourceFiles": [
            {
                "volume": volume.code,
                "url": volume.url,
                "sha256": sha256(volume.path),
                "pdfFileName": volume.path.name,
            }
            for volume in volumes
        ],
        "governanceNotice": RIGHTS_CAUTION,
        "dictionaryEntries": selected,
        "stats": {
            "entryBlocksParsed": len(blocks),
            "fullyPopulatedCandidates": len(candidates),
            "dictionaryEntries": len(selected),
            "entriesWithUsage": sum(bool(entry["usage"]) for entry in selected),
            "standaloneSentenceEntries": sum(
                bool(entry["isSentencePair"]) for entry in selected
            ),
            "publishedEntries": sum(bool(entry["isPublished"]) for entry in selected),
            "audioFieldsPresent": sum(
                "audioUrl" in entry or "audio" in entry for entry in selected
            ),
            "rejectionSummary": dict(rejected.most_common(20)),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--a-k", type=Path, default=DEFAULT_AK)
    parser.add_argument("--l-z", type=Path, default=DEFAULT_LZ)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    args = parser.parse_args()
    if args.limit < 1000:
        raise SystemExit("The Project Kassena review batch must contain at least 1000 entries.")

    volumes = [
        # A-K has introductory material before the alphabetic entries. L-Z is
        # followed by French and English reverse indexes; those index rows are
        # translations, not full lexical entries, and must not be imported.
        SourceVolume("A-K", args.a_k.resolve(), SOURCE_URLS["A-K"], 14, 100),
        SourceVolume("L-Z", args.l_z.resolve(), SOURCE_URLS["L-Z"], 1, 100),
    ]
    payload = build_payload(volumes, args.limit)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    stats = payload["stats"]
    print(
        f"Wrote {stats['dictionaryEntries']} fully populated Kasem-English "
        f"lexical entries to {args.out.resolve()}"
    )
    print(
        f"Usage examples: {stats['entriesWithUsage']}; standalone sentences: "
        f"{stats['standaloneSentenceEntries']}; audio fields: "
        f"{stats['audioFieldsPresent']}; published: {stats['publishedEntries']}"
    )


if __name__ == "__main__":
    main()
