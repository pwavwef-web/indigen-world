#!/usr/bin/env python3
"""Extract the legacy Project Kasena DOCX review pack for archival comparison.

The canonical 1,000+ entry import is built by
``extract-kassena-pdf-dictionary.py``. This legacy extractor writes a separate
file so it cannot accidentally replace the source-attested dictionary batch.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

try:
    from docx import Document
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit(
        "python-docx is required. Run with the Codex bundled Python runtime."
    ) from exc


LEXICAL_HEADERS = [
    "ID",
    "Kasem source form",
    "English candidate gloss",
    "POS",
    "Variety / profile",
    "Source",
    "Review note",
]

SENTENCE_HEADERS = ["ID", "Kasem", "English", "Source", "Review note"]
SOURCE_HEADERS = [
    "Code",
    "Source",
    "Publisher / owner",
    "Variety",
    "Use in this pack",
    "Rights caution",
]

DEFAULT_DOCX = (
    Path.home()
    / "Documents"
    / "General"
    / "IW_Project_Kasena_Kasem_English_Data_Review_Pack_v0.1.docx"
)

DEFAULT_OUTPUT = (
    Path(__file__).resolve().parent / "project-kasena-legacy-review-pack-data.json"
)

IMPORT_ID = "project_kasena_review_pack_v0_1"
SOURCE_URLS = {
    "DICT-AK": "https://www.kassena.org/sites/www.kassena.org/files/uploads/Dictionnaire%20Kassem%20francais%20anglais%20A%20-%20K.pdf",
    "DICT-LZ": "https://www.kassena.org/sites/www.kassena.org/files/uploads/Dictionnaire%20Kassem%20francais%20anglais%20L%20-%20Z.pdf",
    "ANIM-BF": "https://www.kassena.org/sites/www.kassena.org/files/uploads/Kassem%20Animaux.pdf",
}


def cell_text(cell) -> str:
    return re.sub(r"\s+", " ", cell.text).strip()


def table_rows(table) -> list[dict[str, str]]:
    headers = [cell_text(cell) for cell in table.rows[0].cells]
    rows: list[dict[str, str]] = []
    for row in table.rows[1:]:
        values = [cell_text(cell) for cell in row.cells]
        if not any(values):
            continue
        rows.append(dict(zip(headers, values)))
    return rows


def find_tables(document, headers: list[str]) -> list[tuple[int, list[dict[str, str]]]]:
    matches: list[tuple[int, list[dict[str, str]]]] = []
    for index, table in enumerate(document.tables):
        if not table.rows:
            continue
        actual = [cell_text(cell) for cell in table.rows[0].cells]
        if actual == headers:
            matches.append((index, table_rows(table)))
    return matches


def slug(value: str) -> str:
    normalized = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return normalized or "row"


def clean_lookup_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = value.replace("\u00b9", "").replace("\u00b2", "").replace("\u00b3", "")
    value = re.sub(r"[0-9]+", "", value)
    value = value.replace("'", "")
    return value


def tokens(value: str) -> list[str]:
    value = clean_lookup_text(value)
    return [part for part in re.split(r"[^a-zA-Z\u0180-\u024f\u0250-\u02af]+", value) if part]


def candidate_forms(kasem: str) -> list[str]:
    forms: list[str] = []
    for part in re.split(r"\s*/\s*|;", kasem):
        part = part.strip()
        if not part:
            continue
        part = re.sub(r"\s*\[[^\]]+\]\s*", "", part)
        part = part.strip(" .")
        if part.startswith("-"):
            part = part[1:]
        forms.append(part)
    return forms


def sentence_match(kasem: str, sentence_rows: list[dict[str, str]]) -> dict[str, str] | None:
    if not kasem or len(kasem) > 80:
        return None
    forms = candidate_forms(kasem)
    for form in forms:
        form_clean = clean_lookup_text(form).strip(" .!?")
        if not form_clean:
            continue
        for row in sentence_rows:
            sentence = row["Kasem"]
            sentence_clean = clean_lookup_text(sentence)
            sentence_tokens = tokens(sentence)
            if form_clean == sentence_clean.strip(" .!?"):
                return row
            if " " in form_clean and form_clean in sentence_clean:
                return row
            if len(form_clean) >= 2 and form_clean in sentence_tokens:
                return row
            if len(form_clean) >= 3 and any(tok.startswith(form_clean) for tok in sentence_tokens):
                return row
    return None


def display_pos(pos: str) -> str:
    if not pos:
        return "Not specified"
    parts = re.split(r"\s*/\s*", pos)
    return " / ".join(part.replace("_", " ").title() for part in parts)


def dialect_from_variety(variety: str, source: str) -> str:
    if "Internal Ghana" in variety:
        return "Ghana / Project Kasena"
    if "Project" in variety:
        return "Project Kasena example"
    if "animal" in variety.lower():
        return "Tiébélé / Burkina animal list"
    if "Tiébélé" in variety or "BF/" in variety:
        return "Tiébélé / Burkina reference"
    if source.startswith("PK-"):
        return "Project Kasena"
    return variety or "Kasem"


def orthography_profile(variety: str) -> str:
    if "Internal Ghana" in variety or "Project" in variety:
        return "Ghana / Project Kasena draft"
    if "Tiébélé" in variety or "BF/" in variety:
        return "Burkina / Tiébélé reference"
    return "Unknown"


def attribution(source: str, source_meta: dict[str, dict[str, str]], variety: str) -> str:
    meta = source_meta.get(source)
    if not meta:
        return f"{source}; {variety}. Validation required before publication or training use."
    caution = meta.get("Rights caution", "Rights and permissions require review.")
    return f"{source}: {meta.get('Source', source)}; {meta.get('Variety', variety)}. {caution}"


def entry_tags(row: dict[str, str], kind: str) -> list[str]:
    values = [
        "project-kasena",
        "kasem-english",
        kind,
        row.get("Source", "").lower(),
    ]
    pos = row.get("POS")
    if pos:
        values.extend(slug(part) for part in re.split(r"\s*/\s*", pos))
    return sorted({value for value in values if value})


def base_lifecycle(now: str) -> dict[str, object]:
    return {"createdAt": now, "updatedAt": now, "version": 1}


def make_lexical_entry(
    row: dict[str, str],
    table_index: int,
    source_doc: Path,
    source_meta: dict[str, dict[str, str]],
    sentence_rows: list[dict[str, str]],
    now: str,
) -> dict[str, object]:
    row_id = row["ID"]
    kasem = row["Kasem source form"]
    english = row["English candidate gloss"]
    matched = sentence_match(kasem, sentence_rows)
    translation_status = "provided" if english else "pending"
    if not english and matched:
        english = matched["English"]
        translation_status = "looked_up_from_sentence_pair"
    if not english:
        english = "Translation pending"

    is_sentence = row["POS"].upper() == "SENTENCE"
    if is_sentence and not matched:
        matched = {
            "ID": row_id,
            "Kasem": kasem,
            "English": english,
            "Source": row["Source"],
            "Review note": row["Review note"],
        }

    source = row["Source"]
    variety = row["Variety / profile"]
    example_kasem = matched["Kasem"] if matched else ""
    example_english = matched["English"] if matched else ""
    example_source_id = matched["ID"] if matched else ""

    return {
        "id": f"project_kasena_{row_id.lower()}",
        "sourceRowId": row_id,
        "sourceTable": f"table_{table_index}",
        "importBatch": IMPORT_ID,
        "sourceDocument": str(source_doc),
        "kasemText": kasem,
        "headword": kasem,
        "englishText": english,
        "translation": english,
        "translationStatus": translation_status,
        "partOfSpeech": display_pos(row["POS"]),
        "sourcePartOfSpeech": row["POS"],
        "dialect": dialect_from_variety(variety, source),
        "varietyProfile": variety,
        "orthographyProfile": orthography_profile(variety),
        "pronunciation": "Audio not available yet",
        "kasemExample": example_kasem,
        "englishExample": example_english,
        "exampleSourceId": example_source_id,
        "exampleLookup": "sentence_pair_table" if matched else "none",
        "culturalNote": row["Review note"],
        "reviewNote": row["Review note"],
        "attribution": attribution(source, source_meta, variety),
        "sourceCode": source,
        "sourceUrl": SOURCE_URLS.get(source, ""),
        "sourceMetadata": source_meta.get(source, {}),
        "validationStatus": "candidate_review",
        "reviewDecision": "pending",
        "needsValidation": True,
        "isPublished": True,
        "isSynthetic": False,
        "isSentencePair": is_sentence,
        "tags": entry_tags(row, "lexical-candidate"),
        "schemaVersion": 1,
        "lifecycle": base_lifecycle(now),
    }


def make_sentence_entry(
    row: dict[str, str],
    table_index: int,
    source_doc: Path,
    source_meta: dict[str, dict[str, str]],
    now: str,
) -> dict[str, object]:
    row_id = row["ID"]
    source = row["Source"]
    meta = source_meta.get(source, {})
    variety = meta.get("Variety", "Kasem sentence pair")
    kasem = row["Kasem"]
    english = row["English"] or "Translation pending"
    return {
        "id": f"project_kasena_{row_id.lower()}",
        "sourceRowId": row_id,
        "sourceTable": f"table_{table_index}",
        "importBatch": IMPORT_ID,
        "sourceDocument": str(source_doc),
        "kasemText": kasem,
        "headword": kasem,
        "englishText": english,
        "translation": english,
        "translationStatus": "provided" if row["English"] else "pending",
        "partOfSpeech": "Sentence",
        "sourcePartOfSpeech": "SENTENCE",
        "dialect": dialect_from_variety(variety, source),
        "varietyProfile": variety,
        "orthographyProfile": orthography_profile(variety),
        "pronunciation": "Audio not available yet",
        "kasemExample": kasem,
        "englishExample": english,
        "exampleSourceId": row_id,
        "exampleLookup": "self",
        "culturalNote": row["Review note"],
        "reviewNote": row["Review note"],
        "attribution": attribution(source, source_meta, variety),
        "sourceCode": source,
        "sourceUrl": SOURCE_URLS.get(source, ""),
        "sourceMetadata": meta,
        "sentencePair": {
            "source": {"languageCode": "xsm", "text": kasem},
            "target": {"languageCode": "en", "text": english},
            "domain": "general",
            "riskLevel": "standard",
        },
        "validationStatus": "candidate_review",
        "reviewDecision": "pending",
        "needsValidation": True,
        "isPublished": True,
        "isSynthetic": False,
        "isSentencePair": True,
        "tags": entry_tags({"POS": "SENTENCE", "Source": source}, "sentence-pair"),
        "schemaVersion": 1,
        "lifecycle": base_lifecycle(now),
    }


def build_payload(docx_path: Path) -> dict[str, object]:
    document = Document(docx_path)
    source_tables = find_tables(document, SOURCE_HEADERS)
    if not source_tables:
        raise SystemExit("Could not find source register table.")
    source_meta = {row["Code"]: row for _, rows in source_tables for row in rows}

    lexical_tables = find_tables(document, LEXICAL_HEADERS)
    sentence_tables = find_tables(document, SENTENCE_HEADERS)
    if not lexical_tables:
        raise SystemExit("Could not find lexical candidate tables.")
    if not sentence_tables:
        raise SystemExit("Could not find sentence-pair table.")

    sentence_index, sentence_rows = sentence_tables[0]
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    entries = []
    for table_index, rows in lexical_tables:
        for row in rows:
            entries.append(
                make_lexical_entry(
                    row=row,
                    table_index=table_index,
                    source_doc=docx_path,
                    source_meta=source_meta,
                    sentence_rows=sentence_rows,
                    now=now,
                )
            )

    for row in sentence_rows:
        entries.append(
            make_sentence_entry(
                row=row,
                table_index=sentence_index,
                source_doc=docx_path,
                source_meta=source_meta,
                now=now,
            )
        )

    ids = [entry["id"] for entry in entries]
    duplicate_ids = sorted({entry_id for entry_id in ids if ids.count(entry_id) > 1})
    if duplicate_ids:
        raise SystemExit(f"Duplicate dictionary entry ids: {', '.join(duplicate_ids)}")

    missing_translations = [
        entry["id"]
        for entry in entries
        if entry.get("translationStatus") == "pending"
    ]

    looked_up_examples = [
        entry["id"]
        for entry in entries
        if entry.get("exampleLookup") == "sentence_pair_table"
    ]

    return {
        "importId": IMPORT_ID,
        "generatedAt": now,
        "sourceDocument": str(docx_path),
        "sourceDocumentName": docx_path.name,
        "dictionaryEntries": entries,
        "stats": {
            "lexicalTables": len(lexical_tables),
            "lexicalRows": sum(len(rows) for _, rows in lexical_tables),
            "sentenceRows": len(sentence_rows),
            "dictionaryEntries": len(entries),
            "lookedUpExamples": len(looked_up_examples),
            "pendingTranslations": len(missing_translations),
            "pendingTranslationIds": missing_translations,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docx", type=Path, default=DEFAULT_DOCX)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_payload(args.docx.resolve())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    stats = payload["stats"]
    print(
        "Extracted "
        f"{stats['dictionaryEntries']} dictionary entries "
        f"({stats['lexicalRows']} lexical rows + {stats['sentenceRows']} sentence rows)."
    )
    print(f"Matched sentence examples for {stats['lookedUpExamples']} entries.")
    print(f"Pending translations: {stats['pendingTranslations']}.")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
