"""Read public dictionary words and select a small, explicitly identified trial.

No credentials, writes to Firebase, private records, or training data are used.
"""
import argparse
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT = "project-kassena-7e026"
FIELDS = ["kasemText", "headword", "englishText", "translation", "dialect",
          "partOfSpeech", "audioUrl", "pronunciationAudioUrl", "isPublished",
          "authenticationStatus", "attribution"]
GROUPS = {
    "Everyday words": ["na", "Nu", "di", "da", "dɛ", "kaane", "baaro", "tete"],
    "Vowels and consonants": ["baŋa", "maŋa", "sɔŋɔ", "vɔɔro", "wɛyuu", "gaaro"],
    "Longer words and numbers": ["wodiiru", "kunkwolo", "Zamese", "belei", "yatɔ", "yanu"],
    "Written accent comparisons": ["Deem", "Deém", "Vei", "Véi", "Wo", "Wó", "Ye", "Yé"],
}


def plain(value):
    for key in ["stringValue", "booleanValue", "integerValue", "doubleValue"]:
        if key in value:
            return value[key]
    return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, help="Previously saved public runQuery response")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Output already exists; use a new path to preserve earlier evidence.")
    if args.snapshot:
        response = json.loads(args.snapshot.read_text(encoding="utf-8-sig"))
    else:
        body = {"structuredQuery": {
            "from": [{"collectionId": "dictionaryEntries"}],
            "where": {"fieldFilter": {"field": {"fieldPath": "isPublished"},
                                     "op": "EQUAL", "value": {"booleanValue": True}}},
            "select": {"fields": [{"fieldPath": name} for name in FIELDS]},
            "limit": 2000,
        }}
        url = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents:runQuery"
        request = urllib.request.Request(url, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=60) as result:
            response = json.load(result)
    documents = [row["document"] for row in response if "document" in row]
    if len(documents) >= 2000:
        raise SystemExit("Query limit reached; paginate before claiming a complete snapshot.")
    entries = []
    for document in documents:
        fields = {key: plain(value) for key, value in document["fields"].items()}
        if fields.get("isPublished") is not True:
            raise SystemExit("Snapshot contains a non-public entry.")
        entries.append({
            "entryId": document["name"].rsplit("/", 1)[-1],
            "documentPath": document["name"],
            "sourceUpdateTime": document.get("updateTime"),
            "headword": fields.get("kasemText") or fields.get("headword") or "",
            "meaning": fields.get("englishText") or fields.get("translation") or "",
            "dialect": fields.get("dialect") or "Not recorded",
            "partOfSpeech": fields.get("partOfSpeech") or "Not recorded",
            "attribution": fields.get("attribution") or "Not recorded in the public entry",
            "authenticationStatus": fields.get("authenticationStatus") or "Not recorded",
            "isPublished": True,
            "existingAudio": bool(fields.get("audioUrl") or fields.get("pronunciationAudioUrl")),
        })
    selected = []
    for group, words in GROUPS.items():
        for word in words:
            matches = [entry for entry in entries if entry["headword"] == word and not entry["existingAudio"]]
            if len(matches) != 1:
                raise SystemExit(f"Expected one published entry without audio for {word!r}; found {len(matches)}. Review selection.")
            selected.append({**matches[0], "group": group, "status": "awaiting_generation"})
    result = {
        "schemaVersion": 1,
        "preparedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"projectId": PROJECT, "collection": "dictionaryEntries",
                   "filter": "isPublished == true", "publishedEntriesRead": len(entries),
                   "readTimes": sorted({row["readTime"] for row in response if "readTime" in row}),
                   "snapshotFile": args.snapshot.name if args.snapshot else None},
        "selection": "28 purposively selected words; not a random sample or a measure of overall accuracy.",
        "textPolicy": "Keep original headwords and meanings. Only NFC normalization and lowercase are allowed for model input; fail on unsupported characters.",
        "entries": selected,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Selected {len(selected)} words from {len(entries)} published entries → {args.output}")


if __name__ == "__main__":
    main()
